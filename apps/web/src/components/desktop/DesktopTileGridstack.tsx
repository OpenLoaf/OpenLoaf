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

import * as React from "react";
import { motion } from "motion/react";
import { PencilLine, Pin, PinOff, RotateCw, Layers, Trash2, Settings } from "lucide-react";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@openloaf/api/common";
import { cn } from "@/lib/utils";
import { GlowingEffect } from "@openloaf/ui/glowing-effect";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { normalizeUrl } from "@/components/browser/browser-utils";
import { fetchWebMeta } from "@/lib/web-meta";
import { Button } from "@openloaf/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import type { DesktopItem, DesktopScope } from "./types";
import { getWidgetVariants, getWidgetVariantConfig } from "./widget-variants";
import DesktopTileContent from "./DesktopTileContent";
import DesktopTileDeleteButton from "./DesktopTileDeleteButton";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { createBrowserTabId } from "@/hooks/tab-id";

interface DesktopTileGridstackProps {
  item: DesktopItem;
  /** Desktop scope (workspace or project). */
  scope: DesktopScope;
  editMode: boolean;
  onEnterEditMode: () => void;
  /** Update a single desktop item. */
  onUpdateItem: (itemId: string, updater: (item: DesktopItem) => DesktopItem) => void;
  /** Update a desktop item and persist changes when needed. */
  onPersistItemUpdate?: (itemId: string, updater: (item: DesktopItem) => DesktopItem) => void;
  /** Remove a desktop item. */
  onDeleteItem: (itemId: string) => void;
  /** Request folder selection for 3d-folder widget. */
  onSelectFolder: (itemId: string) => void;
}

/** Render a Gridstack tile UI (no dnd-kit). */
export default function DesktopTileGridstack({
  item,
  scope,
  editMode,
  onEnterEditMode,
  onUpdateItem,
  onPersistItemUpdate,
  onDeleteItem,
  onSelectFolder,
}: DesktopTileGridstackProps) {
  const longPressTimerRef = React.useRef<number | null>(null);
  const pointerStartRef = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const { basic } = useBasicConfig();
  const { workspace } = useWorkspace();
  const tabs = useTabs((state) => state.tabs);
  const activeTabId = useTabs((state) => state.activeTabId);
  const tabRuntime = useTabRuntime((state) =>
    activeTabId ? state.runtimeByTabId[activeTabId] : undefined
  );
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  // 逻辑：Flip Clock 默认展示秒数。
  const showSeconds =
    item.kind === "widget" && item.widgetKey === "flip-clock"
      ? (item.flipClock?.showSeconds ?? true)
      : true;
  // 逻辑：固定状态用于锁定拖拽与占位。
  const isPinned = item.pinned ?? false;
  // 逻辑：仅在动画等级为高时显示七彩发光。
  const enableGlow = !editMode && basic.uiAnimationLevel === "high";
  const widgetKey = item.kind === "widget" ? item.widgetKey : null;
  // 逻辑：读取 widget 的 variant 配置列表。
  const variants = widgetKey ? getWidgetVariants(widgetKey) : undefined;
  const hasVariants = Boolean(variants?.length);
  const webMetaFetchRef = React.useRef(false);
  const tabParams = tabRuntime?.base?.params as Record<string, unknown> | undefined;
  const projectId =
    typeof tabParams?.projectId === "string"
      ? String(tabParams.projectId)
      : typeof activeTab?.chatParams?.projectId === "string"
        ? String(activeTab.chatParams.projectId)
        : undefined;
  const workspaceId = workspace?.id ?? activeTab?.workspaceId;
  const projectRootUri =
    typeof tabParams?.rootUri === "string" ? String(tabParams.rootUri) : undefined;
  const defaultRootUri = projectRootUri || workspace?.rootUri;
  // 网页组件修改对话框状态。
  const [isWebDialogOpen, setIsWebDialogOpen] = React.useState(false);
  const [webUrlInput, setWebUrlInput] = React.useState("");
  const [webTitleInput, setWebTitleInput] = React.useState("");
  const [webError, setWebError] = React.useState<string | null>(null);
  // 视频文件选择对话框状态。
  const [isVideoFileDialogOpen, setIsVideoFileDialogOpen] = React.useState(false);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  }, []);

  React.useEffect(() => clearLongPress, [clearLongPress]);

  /** Toggle pin state in edit mode. */
  const handleTogglePin = React.useCallback(() => {
    onUpdateItem(item.id, (current) => ({
      ...current,
      pinned: !(current.pinned ?? false),
    }));
  }, [item.id, onUpdateItem]);

  /** Toggle flip clock seconds display in edit mode. */
  const handleToggleFlipClock = React.useCallback(() => {
    if (widgetKey !== "flip-clock") return;
    onUpdateItem(item.id, (current) => {
      if (current.kind !== "widget" || current.widgetKey !== "flip-clock") return current;
      const currentShowSeconds = current.flipClock?.showSeconds ?? true;
      const nextShowSeconds = !currentShowSeconds;
      // 逻辑：切换成时分时尝试缩小一列，切回秒数时再扩展一列。
      const delta = nextShowSeconds ? 1 : -1;
      const nextW = Math.max(
        current.constraints.minW,
        Math.min(current.constraints.maxW, current.layout.w + delta)
      );
      return {
        ...current,
        flipClock: { showSeconds: nextShowSeconds },
        layout: { ...current.layout, w: nextW },
      };
    });
  }, [item.id, widgetKey, onUpdateItem]);

  /** Switch widget variant via context menu. */
  const handleVariantChange = React.useCallback(
    (variantKey: string) => {
      if (!widgetKey) return;
      const config = getWidgetVariantConfig(widgetKey, variantKey);
      if (!config) return;
      const applyUpdate = onPersistItemUpdate ?? onUpdateItem;
      applyUpdate(item.id, (current) => {
        if (current.kind !== "widget") return current;
        const { constraints } = config;
        // 逻辑：切换 variant 时同步更新约束和尺寸。
        const nextW = Math.max(constraints.minW, Math.min(constraints.maxW, constraints.defaultW));
        const nextH = Math.max(constraints.minH, Math.min(constraints.maxH, constraints.defaultH));
        return {
          ...current,
          variant: variantKey,
          constraints,
          layout: { ...current.layout, w: nextW, h: nextH },
          // 逻辑：同步 flipClock 设置以保持向后兼容。
          flipClock:
            current.widgetKey === "flip-clock"
              ? { showSeconds: variantKey === "hms" }
              : current.flipClock,
        };
      });
    },
    [item.id, onPersistItemUpdate, onUpdateItem, widgetKey]
  );

  const allowOverflow = widgetKey === "3d-folder";
  const isWebStack = item.kind === "widget" && item.widgetKey === "web-stack";
  const webUrl = item.kind === "widget" ? item.webUrl : undefined;
  const webTitle = item.kind === "widget" ? item.webTitle : undefined;
  const webMetaStatus = item.kind === "widget" ? item.webMetaStatus : undefined;
  const canFetchWebMeta =
    isWebStack && webMetaStatus === "loading" && Boolean(webUrl) && Boolean(defaultRootUri);

  // 中文注释：元数据抓取结果需要持久化时优先使用持久化更新回调。
  const applyWebMetaUpdate = onPersistItemUpdate ?? onUpdateItem;

  const runWebMetaFetch = React.useCallback(
    async (targetUrl: string) => {
      if (!defaultRootUri) return;
      const normalized = normalizeUrl(targetUrl);
      if (!normalized) {
        applyWebMetaUpdate(item.id, (current) => {
          if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
          return { ...current, webMetaStatus: "failed" };
        });
        return;
      }
      try {
        const result = await fetchWebMeta({ url: normalized, rootUri: defaultRootUri });
        applyWebMetaUpdate(item.id, (current) => {
          if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
          if (current.webUrl && normalizeUrl(current.webUrl) !== normalized) return current;
          return {
            ...current,
            webTitle: result.title ?? current.webTitle,
            webDescription: result.description ?? current.webDescription,
            webLogo: result.logoPath ?? undefined,
            webPreview: result.previewPath ?? current.webPreview,
            webMetaStatus: result.ok ? "ready" : "failed",
          };
        });
      } catch {
        applyWebMetaUpdate(item.id, (current) => {
          if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
          return { ...current, webMetaStatus: "failed" };
        });
      }
    },
    [applyWebMetaUpdate, defaultRootUri, item.id]
  );

  React.useEffect(() => {
    if (!canFetchWebMeta) return;
    if (webMetaFetchRef.current) return;
    webMetaFetchRef.current = true;
    void runWebMetaFetch(webUrl ?? "").finally(() => {
      webMetaFetchRef.current = false;
    });
  }, [canFetchWebMeta, runWebMetaFetch, webUrl]);

  const handleWebMetaRefresh = React.useCallback(() => {
    if (!isWebStack) return;
    onUpdateItem(item.id, (current) => {
      if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
      return { ...current, webMetaStatus: "loading" };
    });
  }, [isWebStack, item.id, onUpdateItem]);

  /** Sync web edit dialog open state and input values. */
  const handleWebDialogOpenChange = React.useCallback(
    (open: boolean) => {
      setIsWebDialogOpen(open);
      if (open) {
        if (!isWebStack || item.kind !== "widget") return;
        setWebUrlInput(webUrl ?? "");
        setWebTitleInput(item.title || webTitle || "");
        setWebError(null);
        return;
      }
      setWebError(null);
    },
    [isWebStack, item.kind, item.title, webTitle, webUrl]
  );

  /** Save web widget edits and trigger metadata refresh when url changes. */
  const handleWebEditSubmit = React.useCallback(() => {
    if (!isWebStack) return;
    setWebError(null);
    const normalized = normalizeUrl(webUrlInput);
    if (!normalized) {
      setWebError("请输入有效网址");
      return;
    }
    if (!defaultRootUri) {
      setWebError("未找到工作区目录");
      return;
    }
    let hostname = "";
    try {
      hostname = new URL(normalized).hostname;
    } catch {
      hostname = normalized;
    }
    const nextTitle = webTitleInput.trim() || hostname || "网页";
    const applyUpdate = onPersistItemUpdate ?? onUpdateItem;
    applyUpdate(item.id, (current) => {
      if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
      const currentNormalized = normalizeUrl(current.webUrl ?? "");
      const shouldRefresh = normalized !== currentNormalized;
      return {
        ...current,
        title: nextTitle,
        webUrl: normalized,
        webMetaStatus: shouldRefresh ? "loading" : current.webMetaStatus,
        webTitle: shouldRefresh ? undefined : current.webTitle,
        webDescription: shouldRefresh ? undefined : current.webDescription,
        webLogo: shouldRefresh ? undefined : current.webLogo,
        webPreview: shouldRefresh ? undefined : current.webPreview,
      };
    });
    handleWebDialogOpenChange(false);
  }, [
    defaultRootUri,
    handleWebDialogOpenChange,
    isWebStack,
    item.id,
    onPersistItemUpdate,
    onUpdateItem,
    webTitleInput,
    webUrlInput,
  ]);
  const handleWebOpen = React.useCallback(() => {
    if (!isWebStack) return;
    const normalizedUrl = normalizeUrl(webUrl ?? "");
    if (!activeTabId || !normalizedUrl) return;
    const tab = useTabs.getState().getTabById(activeTabId);
    if (!tab) return;
    const viewKey = createBrowserTabId();
    useTabRuntime.getState().pushStackItem(
      activeTabId,
      {
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        component: BROWSER_WINDOW_COMPONENT,
        params: { __customHeader: true, __open: { url: normalizedUrl, title: item.title, viewKey } },
      } as any,
      100
    );
    onUpdateItem(item.id, (current) => {
      if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
      return { ...current, webMetaStatus: "loading" };
    });
  }, [activeTabId, isWebStack, item.id, item.title, onUpdateItem, webUrl]);

  /** Handle video file selection from the file dialog. */
  const handleVideoFileSelect = React.useCallback(
    (targetUri: string) => {
      const applyUpdate = onPersistItemUpdate ?? onUpdateItem;
      applyUpdate(item.id, (current) => {
        if (current.kind !== "widget" || current.widgetKey !== "video") return current;
        return { ...current, videoFileRef: targetUri };
      });
      setIsVideoFileDialogOpen(false);
    },
    [item.id, onPersistItemUpdate, onUpdateItem]
  );

  // 逻辑：根据 widget 类型计算配置回调。
  const isThreeDFolder = item.kind === "widget" && item.widgetKey === "3d-folder";
  const isVideo = item.kind === "widget" && item.widgetKey === "video";
  const handleConfigure = React.useMemo(() => {
    if (isThreeDFolder) return () => onSelectFolder(item.id);
    if (isWebStack) return () => handleWebDialogOpenChange(true);
    if (isVideo) return () => setIsVideoFileDialogOpen(true);
    return undefined;
  }, [isThreeDFolder, isWebStack, isVideo, item.id, onSelectFolder, handleWebDialogOpenChange]);

  const tileBody = (
    <motion.div
      animate={{ scale: 1, boxShadow: "none" }}
      transition={{ type: "spring", stiffness: 450, damping: 32 }}
      className={cn(
        "desktop-tile-handle relative h-full w-full select-none rounded-2xl",
        allowOverflow ? "overflow-visible" : "overflow-hidden",
        "bg-card border border-border/40 dark:bg-card",
        "bg-slate-50/90",
        isPinned ? "ring-2 ring-primary/40" : ""
      )}
      title={widgetKey === "3d-folder" ? undefined : item.title}
      aria-label={item.title}
      data-desktop-tile="true"
      onPointerDownCapture={(event) => {
        if (editMode) return;
        if (event.button !== 0) return;

        const pointerId = event.pointerId;
        pointerStartRef.current = { id: pointerId, x: event.clientX, y: event.clientY };

        const tolerance = 6;
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          onEnterEditMode();
        }, 320);

        const onPointerMove = (moveEvent: PointerEvent) => {
          const start = pointerStartRef.current;
          if (!start) return;
          if (moveEvent.pointerId !== start.id) return;
          const dx = moveEvent.clientX - start.x;
          const dy = moveEvent.clientY - start.y;
          if (Math.hypot(dx, dy) <= tolerance) return;
          clearLongPress();
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          window.removeEventListener("pointercancel", onPointerUp);
        };

        const onPointerUp = (upEvent: PointerEvent) => {
          const start = pointerStartRef.current;
          if (!start) return;
          if (upEvent.pointerId !== start.id) return;
          clearLongPress();
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          window.removeEventListener("pointercancel", onPointerUp);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
      }}
    >
      {enableGlow ? (
        <GlowingEffect
          blur={20}
          spread={100}
          glow={true}
          disabled={false}
          proximity={160}
          inactiveZone={0}
          borderWidth={5}
          movementDuration={1}
          className="brightness-125 dark:brightness-110"
        />
      ) : null}
        <div className={cn("relative h-full w-full", editMode ? "pointer-events-none" : "")}>
          <DesktopTileContent
            item={item}
            scope={scope}
            webContext={{ projectId, workspaceId }}
            onWebOpen={handleWebOpen}
            onConfigure={handleConfigure}
          />
        </div>
      </motion.div>
  );

  return (
    <div className="group relative h-full w-full min-w-0">
      {editMode ? (
        <div className="absolute -left-2 -top-2 z-20 flex items-center gap-1">
          {isPinned ? null : <DesktopTileDeleteButton onDelete={() => onDeleteItem(item.id)} />}
          <button
            type="button"
            className={cn(
              "desktop-edit-action-button flex size-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm",
              isPinned ? "text-red-500" : "",
              isPinned
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
            )}
            data-wiggle="loop"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleTogglePin();
            }}
            aria-label={isPinned ? "Unpin widget" : "Pin widget"}
            title={isPinned ? "取消固定" : "固定"}
          >
            {isPinned ? (
              <PinOff className="desktop-edit-action-icon size-3.5" />
            ) : (
              <Pin className="desktop-edit-action-icon size-3.5" />
            )}
          </button>
        </div>
      ) : null}

      <ContextMenu>
        <ContextMenuTrigger asChild>{tileBody}</ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          {hasVariants && variants ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Layers className="mr-2 size-4" />
                模式
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuRadioGroup
                  value={item.kind === "widget" ? (item.variant ?? "") : ""}
                  onValueChange={handleVariantChange}
                >
                  {variants.map((v) => (
                    <ContextMenuRadioItem key={v.key} value={v.key}>
                      {v.label}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : null}
          {(isWebStack || isThreeDFolder || isVideo) && hasVariants ? <ContextMenuSeparator /> : null}
          {isWebStack ? (
            <>
              <ContextMenuItem icon={PencilLine} onClick={() => handleWebDialogOpenChange(true)}>
                修改
              </ContextMenuItem>
              <ContextMenuItem
                icon={RotateCw}
                onClick={handleWebMetaRefresh}
                disabled={!webUrl}
              >
                刷新
              </ContextMenuItem>
            </>
          ) : null}
          {isThreeDFolder ? (
            <ContextMenuItem icon={Settings} onClick={() => onSelectFolder(item.id)}>
              选择文件夹
            </ContextMenuItem>
          ) : null}
          {isVideo ? (
            <ContextMenuItem icon={Settings} onClick={() => setIsVideoFileDialogOpen(true)}>
              选择视频
            </ContextMenuItem>
          ) : null}
          {(hasVariants || isWebStack || isThreeDFolder || isVideo) ? <ContextMenuSeparator /> : null}
          <ContextMenuItem
            icon={Trash2}
            variant="destructive"
            onClick={() => onDeleteItem(item.id)}
            disabled={isPinned}
          >
            删除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isWebStack ? (
        <Dialog open={isWebDialogOpen} onOpenChange={handleWebDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>修改网页组件</DialogTitle>
              <DialogDescription>输入网页地址与名称，自动抓取 logo 与预览图。</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">网页地址</div>
                <Input
                  value={webUrlInput}
                  onChange={(e) => setWebUrlInput(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">名称（可选）</div>
                <Input
                  value={webTitleInput}
                  onChange={(e) => setWebTitleInput(e.target.value)}
                  placeholder="自定义名称"
                />
              </div>
              {webError ? (
                <div className="text-xs text-destructive">{webError}</div>
              ) : null}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => handleWebDialogOpenChange(false)}>
                取消
              </Button>
              <Button type="button" onClick={handleWebEditSubmit}>
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {isVideo ? (
        <ProjectFileSystemTransferDialog
          open={isVideoFileDialogOpen}
          onOpenChange={setIsVideoFileDialogOpen}
          mode="select"
          selectTarget="file"
          onSelectTarget={handleVideoFileSelect}
        />
      ) : null}
    </div>
  );
}
