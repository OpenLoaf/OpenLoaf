"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { useBasicConfig } from "@/hooks/use-basic-config";
import type { DesktopItem } from "./types";
import DesktopTileContent from "./DesktopTileContent";
import DesktopTileDeleteButton from "./DesktopTileDeleteButton";

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

  return (
    <div className="group relative h-full w-full min-w-0">
      {editMode ? (
        <div className="absolute -left-2 -top-2 z-10 flex items-center gap-1">
          {isPinned ? null : <DesktopTileDeleteButton onDelete={() => onDeleteItem(item.id)} />}
          <button
            type="button"
            className={cn(
              "flex size-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm",
              isPinned ? "text-red-500" : "",
              isPinned
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
            )}
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
            {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
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
    </div>
  );
}
