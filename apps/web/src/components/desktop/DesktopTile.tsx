"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { DesktopItem } from "./types";
import DesktopTileContent from "./DesktopTileContent";
import DesktopTileDeleteButton from "./DesktopTileDeleteButton";

export interface DesktopMetrics {
  cols: number;
  cell: number;
  gap: number;
  padding: number;
}

function getItemSpan(item: DesktopItem, cols: number): { w: number; h: number } {
  if (item.kind !== "widget") return { w: 1, h: 1 };
  const base =
    item.size === "1x1"
      ? { w: 1, h: 1 }
      : item.size === "2x2"
        ? { w: 2, h: 2 }
        : { w: 4, h: 2 };

  const maxW = Math.max(1, cols);
  const w = Math.min(base.w, maxW);
  const h = base.w > maxW ? Math.max(2, base.h) : base.h;
  return { w, h };
}

interface DesktopTileProps {
  item: DesktopItem;
  editMode: boolean;
  onEnterEditMode: () => void;
  onDeleteItem: (itemId: string) => void;
  metrics: DesktopMetrics;
  isOverlay: boolean;
}

/** Render a grid tile with sortable drag support. */
export default function DesktopTile({
  item,
  editMode,
  onEnterEditMode,
  onDeleteItem,
  metrics,
  isOverlay,
}: DesktopTileProps) {
  const longPressTimerRef = React.useRef<number | null>(null);
  const pointerStartRef = React.useRef<{ id: number; x: number; y: number } | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      disabled: isOverlay || !editMode,
    });

  const span = React.useMemo(() => getItemSpan(item, metrics.cols), [item, metrics.cols]);

  const style: React.CSSProperties = {
    touchAction: "none",
    // 避免 dnd-kit 的 scaleX/scaleY 在 grid + 可变尺寸 item 下导致视觉“放大/缩小”异常；这里只保留位移。
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : null
    ),
    transition: transition ?? "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    gridColumn: `span ${span.w} / span ${span.w}`,
    gridRow: `span ${span.h} / span ${span.h}`,
  };

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  }, []);

  React.useEffect(() => clearLongPress, [clearLongPress]);

  return (
    <div ref={setNodeRef} style={style} className="relative min-w-0">
      {editMode && !isOverlay ? (
        <DesktopTileDeleteButton onDelete={() => onDeleteItem(item.id)} />
      ) : null}

      <motion.div
        animate={
          isDragging
            ? { scale: 1, boxShadow: "0 10px 24px rgba(0,0,0,0.20)" }
            : { scale: 1, boxShadow: "0 6px 14px rgba(0,0,0,0.14)" }
        }
        transition={{ type: "spring", stiffness: 450, damping: 32 }}
        className={cn(
          "group relative h-full w-full select-none overflow-hidden rounded-2xl bg-card/80 supports-[backdrop-filter]:bg-card/60",
          "border border-border/60"
        )}
        title={item.title}
        aria-label={item.title}
        data-desktop-tile="true"
        {...attributes}
        {...listeners}
        onPointerDownCapture={(event) => {
          if (isOverlay) return;
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
        {/* 拖拽中本体叠加半透明遮罩，增强层次感。 */}
        {isDragging && !isOverlay ? (
          <div className="pointer-events-none absolute inset-0 z-10 bg-background/15" />
        ) : null}

        <DesktopTileContent item={item} />
      </motion.div>
    </div>
  );
}

interface DesktopTilePreviewProps {
  item: DesktopItem;
  metrics: DesktopMetrics;
  size?: { width: number; height: number } | null;
}

/** Render DragOverlay preview content. */
export function DesktopTilePreview({ item, metrics, size }: DesktopTilePreviewProps) {
  void metrics;

  const width = size?.width;
  const height = size?.height;

  return (
    <div style={{ width, height }}>
      <motion.div
        animate={{ scale: 1.06, boxShadow: "0 14px 30px rgba(0,0,0,0.24)" }}
        transition={{ type: "spring", stiffness: 450, damping: 32 }}
        className={cn(
          "relative h-full w-full select-none overflow-hidden rounded-2xl bg-card/80 supports-[backdrop-filter]:bg-card/60",
          "border border-border/60"
        )}
      >
        <DesktopTileContent item={item} />
      </motion.div>
    </div>
  );
}
