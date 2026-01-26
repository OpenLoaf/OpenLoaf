"use client";

import { useCallback, useEffect, useMemo } from "react";
import { Camera, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import type { DockItem } from "@tenas-ai/api/common";
import { Button } from "@tenas-ai/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";
import { useOptionalSidebar } from "@tenas-ai/ui/sidebar";
import {
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import { emitSidebarOpenRequest, getLeftSidebarOpen } from "@/lib/sidebar-state";
import { useTabs } from "@/hooks/use-tabs";
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
  const saveFile = window.tenasElectron?.saveFile;
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

/** Render header actions for board panels. */
export function BoardPanelHeaderActions({ item, title, tabId }: BoardPanelHeaderActionsProps) {
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
  const setTabRightChatCollapsed = useTabs((state) => state.setTabRightChatCollapsed);
  const setStackItemParams = useTabs((state) => state.setStackItemParams);
  const rightChatCollapsed = useTabs(
    (state) => state.tabs.find((tab) => tab.id === tabId)?.rightChatCollapsed ?? false
  );
  const activeStackItemId = useTabs((state) => {
    const tab = state.tabs.find((target) => target.id === tabId);
    const stack = tab?.stack ?? [];
    return state.activeStackItemIdByTabId[tabId] ?? stack.at(-1)?.id ?? "";
  });
  const stackHidden = useTabs((state) => Boolean(state.stackHiddenByTabId[tabId]));

  /** Export the current board panel to an image. */
  const handleExportBoard = useCallback(async () => {
    if (!isBoardPanel) return;
    const panelSelector = `[data-board-canvas][data-board-panel="${item.id}"]`;
    const target = document.querySelector(panelSelector) as HTMLElement | null;
    if (!target) {
      toast.error("未找到可导出的画布");
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
        toast.error("导出失败：无法生成图片");
        return;
      }
      const saved = await downloadBlobAsFile(blob, fileName);
      if (!saved) return;
    } catch (error) {
      console.error("导出失败", error);
      toast.error("导出失败");
    } finally {
      setBoardExporting(target, false);
    }
  }, [isBoardPanel, item.id, item.params, title]);

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
    setTabRightChatCollapsed(tabId, shouldCollapse);
    setStackItemParams(tabId, item.id, { __boardFull: shouldCollapse });
  }, [
    isMobile,
    leftOpen,
    rightChatCollapsed,
    setOpen,
    setOpenMobile,
    sidebar,
    setTabRightChatCollapsed,
    setStackItemParams,
    tabId,
    item.id,
  ]);

  if (!isBoardPanel) return null;

  const shouldCollapsePanels = leftOpen || !rightChatCollapsed;
  // 逻辑：左右面板都收起时视为画布全屏。
  const isBoardFull = !shouldCollapsePanels;
  const isActiveStackItem = activeStackItemId === item.id && !stackHidden;
  const shortcutLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Cmd+F";
    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    return isMac ? "Cmd+F" : "Ctrl+F";
  }, []);
  const toggleLabel = canToggleSidebar
    ? isBoardFull
      ? "退出全屏"
      : "进入全屏"
    : rightChatCollapsed
      ? "显示 AI 面板"
      : "收起 AI 面板";
  const toggleTooltip = canToggleSidebar ? `${toggleLabel} (${shortcutLabel})` : toggleLabel;
  const exportLabel = "截图画布";

  useEffect(() => {
    if (!isBoardPanel) return;
    if (!isActiveStackItem) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "f") return;
      if (isEditableTarget(event.target)) return;
      // 逻辑：拦截 Command+F，切换画布全屏状态。
      event.preventDefault();
      handleTogglePanels();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleTogglePanels, isActiveStackItem, isBoardPanel]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            aria-label={toggleLabel}
            onClick={handleTogglePanels}
          >
            {isBoardFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{toggleTooltip}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            aria-label={exportLabel}
            onClick={() => void handleExportBoard()}
          >
            <Camera className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{exportLabel}</TooltipContent>
      </Tooltip>
    </>
  );
}
