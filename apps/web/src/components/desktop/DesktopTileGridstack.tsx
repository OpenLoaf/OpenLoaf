"use client";

import * as React from "react";
import { motion } from "motion/react";
import { PencilLine, Pin, PinOff, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowingEffect } from "@tenas-ai/ui/glowing-effect";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { normalizeUrl } from "@/components/browser/browser-utils";
import { fetchWebMeta } from "./web-meta-client";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tenas-ai/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { Input } from "@tenas-ai/ui/input";
import { Button } from "@tenas-ai/ui/button";
import type { DesktopItem } from "./types";
import DesktopTileContent from "./DesktopTileContent";
import DesktopTileDeleteButton from "./DesktopTileDeleteButton";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

interface DesktopTileGridstackProps {
  item: DesktopItem;
  editMode: boolean;
  onEnterEditMode: () => void;
  /** Update a single desktop item. */
  onUpdateItem: (itemId: string, updater: (item: DesktopItem) => DesktopItem) => void;
  /** Remove a desktop item. */
  onDeleteItem: (itemId: string) => void;
  /** Request folder selection for 3d-folder widget. */
  onSelectFolder: (itemId: string) => void;
}

/** Render a Gridstack tile UI (no dnd-kit). */
export default function DesktopTileGridstack({
  item,
  editMode,
  onEnterEditMode,
  onUpdateItem,
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
  const webMetaFetchRef = React.useRef(false);
  const [isWebEditOpen, setIsWebEditOpen] = React.useState(false);
  const [webEditUrl, setWebEditUrl] = React.useState("");
  const [webEditTitle, setWebEditTitle] = React.useState("");
  const [webEditError, setWebEditError] = React.useState<string | null>(null);
  const tabParams = tabRuntime?.base?.params as Record<string, unknown> | undefined;
  const projectRootUri =
    typeof tabParams?.rootUri === "string" ? String(tabParams.rootUri) : undefined;
  const defaultRootUri = projectRootUri || workspace?.rootUri;

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

  const allowOverflow = widgetKey === "3d-folder";
  const isWebStack = item.kind === "widget" && item.widgetKey === "web-stack";
  const canFetchWebMeta =
    isWebStack && item.webMetaStatus === "loading" && Boolean(item.webUrl) && Boolean(defaultRootUri);

  const runWebMetaFetch = React.useCallback(
    async (targetUrl: string) => {
      if (!defaultRootUri) return;
      const normalized = normalizeUrl(targetUrl);
      if (!normalized) {
        onUpdateItem(item.id, (current) => {
          if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
          return { ...current, webMetaStatus: "failed" };
        });
        return;
      }
      try {
        const result = await fetchWebMeta({ url: normalized, rootUri: defaultRootUri });
        onUpdateItem(item.id, (current) => {
          if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
          if (current.webUrl && normalizeUrl(current.webUrl) !== normalized) return current;
          return {
            ...current,
            webTitle: result.title ?? current.webTitle,
            webDescription: result.description ?? current.webDescription,
            webLogo: result.logoPath ?? current.webLogo,
            webPreview: result.previewPath ?? current.webPreview,
            webMetaStatus: result.ok ? "ready" : "failed",
          };
        });
      } catch {
        onUpdateItem(item.id, (current) => {
          if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
          return { ...current, webMetaStatus: "failed" };
        });
      }
    },
    [defaultRootUri, item.id, onUpdateItem]
  );

  React.useEffect(() => {
    if (!canFetchWebMeta) return;
    if (webMetaFetchRef.current) return;
    webMetaFetchRef.current = true;
    void runWebMetaFetch(item.webUrl ?? "").finally(() => {
      webMetaFetchRef.current = false;
    });
  }, [canFetchWebMeta, item.webUrl, runWebMetaFetch]);

  const handleWebMetaRefresh = React.useCallback(() => {
    if (!isWebStack) return;
    onUpdateItem(item.id, (current) => {
      if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
      return { ...current, webMetaStatus: "loading" };
    });
  }, [isWebStack, item.id, onUpdateItem]);

  const handleOpenWebEdit = React.useCallback(() => {
    if (!isWebStack) return;
    setWebEditUrl(item.webUrl ?? "");
    setWebEditTitle(item.title ?? "");
    setWebEditError(null);
    setIsWebEditOpen(true);
  }, [isWebStack, item.title, item.webUrl]);

  const handleWebEditSubmit = React.useCallback(() => {
    const normalized = normalizeUrl(webEditUrl);
    if (!normalized) {
      setWebEditError("请输入有效网址");
      return;
    }
    const title = webEditTitle.trim() || item.title || "网页";
    onUpdateItem(item.id, (current) => {
      if (current.kind !== "widget" || current.widgetKey !== "web-stack") return current;
      return {
        ...current,
        title,
        webUrl: normalized,
        webTitle: undefined,
        webDescription: undefined,
        webLogo: undefined,
        webPreview: undefined,
        webMetaStatus: "loading",
      };
    });
    setIsWebEditOpen(false);
  }, [item.id, item.title, onUpdateItem, webEditTitle, webEditUrl]);

  const canSubmitWebEdit = Boolean(normalizeUrl(webEditUrl));

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
          blur={10}
          spread={60}
          glow={true}
          disabled={false}
          proximity={120}
          inactiveZone={0}
          borderWidth={3}
          className="opacity-100 mix-blend-multiply dark:opacity-70 dark:mix-blend-normal"
        />
      ) : null}
      <div className={cn("relative h-full w-full", editMode ? "pointer-events-none" : "")}>
        <DesktopTileContent item={item} />
      </div>
    </motion.div>
  );

  return (
    <div className="group relative h-full w-full min-w-0">
      {editMode ? (
        <div className="absolute -left-2 -top-2 z-10 flex items-center gap-1">
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
      {editMode && widgetKey === "flip-clock" ? (
        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-full border border-border bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleToggleFlipClock();
          }}
          aria-label={showSeconds ? "Switch to hour and minute" : "Switch to full time"}
          title={showSeconds ? "切换到小时:分" : "切换到完整时间"}
        >
          {showSeconds ? "时:分" : "带秒"}
        </button>
      ) : null}
      {editMode && item.kind === "widget" && item.widgetKey === "3d-folder" ? (
        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-full border border-border bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelectFolder(item.id);
          }}
          aria-label="Select folder"
          title="选择文件夹"
        >
          选择
        </button>
      ) : null}

      {isWebStack ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{tileBody}</ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            <ContextMenuItem
              icon={RotateCw}
              onClick={handleWebMetaRefresh}
              disabled={!item.webUrl}
            >
              刷新
            </ContextMenuItem>
            <ContextMenuItem icon={PencilLine} onClick={handleOpenWebEdit}>
              修改
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        tileBody
      )}
      {isWebStack ? (
        <Dialog open={isWebEditOpen} onOpenChange={setIsWebEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>修改网页</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">网页地址</div>
                <Input
                  value={webEditUrl}
                  onChange={(event) => setWebEditUrl(event.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">名称</div>
                <Input
                  value={webEditTitle}
                  onChange={(event) => setWebEditTitle(event.target.value)}
                  placeholder="自定义名称"
                />
              </div>
              {webEditError ? (
                <div className="text-xs text-destructive">{webEditError}</div>
              ) : null}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsWebEditOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={handleWebEditSubmit} disabled={!canSubmitWebEdit}>
                更新
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
