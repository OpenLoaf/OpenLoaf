/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useCallback, useEffect, useMemo } from "react";
import { Camera, Maximize2, Minimize2, MoreHorizontal, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { DockItem } from "@openloaf/api/common";
import { Button } from "@openloaf/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { useOptionalSidebar } from "@openloaf/ui/sidebar";

import {
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import { emitSidebarOpenRequest, getLeftSidebarOpen } from "@/lib/sidebar-state";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { trpcClient } from "@/utils/trpc";
import { getBoardEngine } from "./engine/board-engine-registry";
import type { BoardJsonSnapshot } from "@openloaf/api/types/boardCollab";
import { blobToBase64 } from "./utils/base64";
import {
  captureBoardImageBlob,
  setBoardExporting,
  waitForAnimationFrames,
} from "./utils/board-export";

/** Build a filename for board image exports. */
function buildBoardExportFileName(
  params: DockItem["params"] | undefined,
  title: string
) {
  const name = typeof (params as any)?.name === "string" ? (params as any).name : title;
  const ext = typeof (params as any)?.ext === "string" ? (params as any).ext : undefined;
  const baseName = isBoardFolderName(name)
    ? getBoardDisplayName(name).trim() || "board"
    : getDisplayFileName(name || "board", ext).trim() || "board";
  return baseName.endsWith(".png") ? baseName : `${baseName}.png`;
}

/** Trigger a download for a blob without opening a new tab. */
async function downloadBlobAsFile(blob: Blob, fileName: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const saveFile = window.openloafElectron?.saveFile;
  if (saveFile) {
    const contentBase64 = await blobToBase64(blob);
    const result = await saveFile({
      contentBase64,
      suggestedName: fileName,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (result?.ok) return true;
    if (result?.canceled) return false;
    throw new Error(result?.reason ?? "Save failed");
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.target = "_self";
  link.rel = "noopener";
  link.style.display = "none";
  // 逻辑：用隐藏链接触发下载，避免页面跳转。
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/** Return true when the target should ignore global shortcuts. */
function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.getAttribute("role") === "textbox"
  );
}

export type BoardPanelHeaderActionsProps = {
  item: DockItem;
  title: string;
  tabId: string;
};

/** Default node dimensions used when restoring from JSON snapshot. */
const REPAIR_NODE_WIDTH = 280;
const REPAIR_NODE_HEIGHT = 180;
/** Grid gap between restored nodes. */
const REPAIR_GRID_GAP = 24;
/** Columns in the repair grid layout. */
const REPAIR_GRID_COLS = 4;

/** Render header actions for board panels. */
export function BoardPanelHeaderActions({ item, title, tabId }: BoardPanelHeaderActionsProps) {
  const { t } = useTranslation('board');
  const isBoardPanel = item.component === "board-viewer";
  const sidebar = useOptionalSidebar();
  const isMobile = sidebar?.isMobile ?? false;
  const open = sidebar?.open ?? false;
  const openMobile = sidebar?.openMobile ?? false;
  const leftOpenFallback = getLeftSidebarOpen();
  const leftOpen = sidebar
    ? isMobile
      ? openMobile
      : open
    : leftOpenFallback ?? false;
  const canToggleSidebar = Boolean(sidebar) || leftOpenFallback !== null;
  const setOpen = sidebar?.setOpen;
  const setOpenMobile = sidebar?.setOpenMobile;
  const rightChatCollapsed = useTabRuntime(
    (state) => state.runtimeByTabId[tabId]?.rightChatCollapsed ?? false,
  );
  const runtimeStack = useTabRuntime((state) => state.runtimeByTabId[tabId]?.stack);
  const runtimeActiveStackId = useTabRuntime(
    (state) => state.runtimeByTabId[tabId]?.activeStackItemId,
  );
  const stackHidden = useTabRuntime((state) => Boolean(state.runtimeByTabId[tabId]?.stackHidden));
  const stack = Array.isArray(runtimeStack) ? runtimeStack : [];
  const activeStackItemId =
    typeof runtimeActiveStackId === "string"
      ? runtimeActiveStackId || stack.at(-1)?.id || ""
      : stack.at(-1)?.id || "";

  /** Export the current board panel to an image. */
  const handleExportBoard = useCallback(async () => {
    if (!isBoardPanel) return;
    const panelSelector = `[data-board-canvas][data-board-panel="${item.id}"]`;
    const target = document.querySelector(panelSelector) as HTMLElement | null;
    if (!target) {
      toast.error(t('panelHeader.noCanvas'));
      return;
    }
    const fileName = buildBoardExportFileName(item.params, title);
    try {
      // 逻辑：导出前先隐藏网格并等待渲染完成。
      setBoardExporting(target, true);
      await waitForAnimationFrames(2);
      // 逻辑：导出时过滤工具条/控件，避免截图污染。
      const blob = await captureBoardImageBlob(target);
      if (!blob) {
        toast.error(t('panelHeader.exportFailed'));
        return;
      }
      const saved = await downloadBlobAsFile(blob, fileName);
      if (!saved) return;
    } catch (error) {
      console.error("Export failed", error);
      toast.error(t('panelHeader.exportFailed'));
    } finally {
      setBoardExporting(target, false);
    }
  }, [isBoardPanel, item.id, item.params, title]);

  /** Repair board by reading index.tnboard.json and re-inserting elements. */
  const handleRepairBoard = useCallback(async () => {
    const boardFolderUri = (item.params as any)?.boardFolderUri as string | undefined;
    if (!boardFolderUri) {
      toast.error(t('panelHeader.repairNoBoardFolder'));
      return;
    }
    const engine = getBoardEngine(item.id);
    if (!engine) {
      toast.error(t('panelHeader.repairNoEngine'));
      return;
    }
    const jsonUri = boardFolderUri.replace(/\/$/, '') + '/index.tnboard.json';
    try {
      const result = await trpcClient.fs.readFile.query({
        uri: jsonUri,
      });
      if (!result.content) {
        toast.error(t('panelHeader.repairNoJsonFile'));
        return;
      }
      const snapshot = JSON.parse(result.content) as BoardJsonSnapshot;
      const allItems = [...(snapshot.nodes ?? []), ...(snapshot.connectors ?? [])];
      if (allItems.length === 0) {
        toast.error(t('panelHeader.repairEmptySnapshot'));
        return;
      }
      // 逻辑：JSON 快照不含 xywh 坐标，按网格布局分配默认位置。
      const existingIds = new Set(engine.doc.getElements().map((el) => el.id));
      let inserted = 0;
      let col = 0;
      let row = 0;
      for (const entry of allItems) {
        if (existingIds.has(entry.id)) continue;
        const x = col * (REPAIR_NODE_WIDTH + REPAIR_GRID_GAP);
        const y = row * (REPAIR_NODE_HEIGHT + REPAIR_GRID_GAP);
        if (entry.kind === 'node') {
          engine.doc.addElement({
            id: entry.id,
            type: entry.type,
            kind: 'node',
            xywh: [x, y, REPAIR_NODE_WIDTH, REPAIR_NODE_HEIGHT],
            props: entry.props ?? {},
          });
        } else if (entry.kind === 'connector') {
          engine.doc.addElement({
            id: entry.id,
            type: entry.type || 'connector',
            kind: 'connector',
            xywh: [0, 0, 0, 0],
            source: (entry.source ?? {}) as any,
            target: (entry.target ?? {}) as any,
            style: (entry.style as any) ?? undefined,
          });
        }
        inserted++;
        col++;
        if (col >= REPAIR_GRID_COLS) {
          col = 0;
          row++;
        }
      }
      if (inserted === 0) {
        toast.info(t('panelHeader.repairNoNewElements'));
      } else {
        toast.success(t('panelHeader.repairSuccess', { count: inserted }));
      }
    } catch (error) {
      console.error('[board repair] failed', error);
      toast.error(t('panelHeader.repairFailed'));
    }
  }, [item.id, item.params, t]);

  /** Toggle the left sidebar and right AI panel together. */
  const handleTogglePanels = useCallback(() => {
    if (!tabId) return;
    const shouldCollapse = leftOpen || !rightChatCollapsed;
    // 逻辑：任一侧可见时进入专注模式，收起左右栏；否则恢复显示。
    const nextLeftOpen = !shouldCollapse;
    if (sidebar) {
      if (isMobile) {
        setOpenMobile?.(nextLeftOpen);
      } else {
        setOpen?.(nextLeftOpen);
      }
    } else {
      emitSidebarOpenRequest(nextLeftOpen);
    }
    useTabRuntime.getState().setTabRightChatCollapsed(tabId, shouldCollapse);
    useTabRuntime.getState().setStackItemParams(tabId, item.id, { __boardFull: shouldCollapse });
  }, [
    isMobile,
    leftOpen,
    rightChatCollapsed,
    setOpen,
    setOpenMobile,
    sidebar,
    tabId,
    item.id,
  ]);

  const shouldCollapsePanels = leftOpen || !rightChatCollapsed;
  // 逻辑：左右面板都收起时视为画布全屏。
  const isBoardFull = !shouldCollapsePanels;
  const isActiveStackItem = activeStackItemId === item.id && !stackHidden;
  const shortcutLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Cmd+K";
    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    return isMac ? "Cmd+K" : "Ctrl+K";
  }, []);

  useEffect(() => {
    if (!isBoardPanel) return;
    if (!isActiveStackItem) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      if (isEditableTarget(event.target)) return;
      // 逻辑：拦截 Command+K，切换画布全屏状态。
      event.preventDefault();
      handleTogglePanels();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleTogglePanels, isActiveStackItem, isBoardPanel]);

  if (!isBoardPanel) return null;

  const toggleLabel = canToggleSidebar
    ? isBoardFull
      ? t('panelHeader.exitFullscreen')
      : t('panelHeader.enterFullscreen')
    : rightChatCollapsed
      ? t('panelHeader.showAIPanel')
      : t('panelHeader.hideAIPanel');
  const exportLabel = t('panelHeader.screenshot');
  const toggleShortcut = canToggleSidebar ? shortcutLabel : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={t('panelHeader.menu')}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleTogglePanels}>
          {isBoardFull ? (
            <Minimize2 className="mr-2 h-4 w-4" />
          ) : (
            <Maximize2 className="mr-2 h-4 w-4" />
          )}
          {toggleLabel}
          {toggleShortcut ? (
            <span className="ml-auto pl-4 text-xs text-muted-foreground">{toggleShortcut}</span>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleExportBoard()}>
          <Camera className="mr-2 h-4 w-4" />
          {exportLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleRepairBoard()}>
          <Wrench className="mr-2 h-4 w-4" />
          {t('panelHeader.repairBoard')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
