"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { DesktopItem } from "./types";
import DesktopTileContent from "./DesktopTileContent";
import DesktopTileDeleteButton from "./DesktopTileDeleteButton";

interface DesktopTileGridstackProps {
  item: DesktopItem;
  editMode: boolean;
  onEnterEditMode: () => void;
  onDeleteItem: (itemId: string) => void;
}

/** Render a Gridstack tile UI (no dnd-kit). */
export default function DesktopTileGridstack({
  item,
  editMode,
  onEnterEditMode,
  onDeleteItem,
}: DesktopTileGridstackProps) {
  const longPressTimerRef = React.useRef<number | null>(null);
  const pointerStartRef = React.useRef<{ id: number; x: number; y: number } | null>(null);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  }, []);

  React.useEffect(() => clearLongPress, [clearLongPress]);

  return (
    <div className="relative h-full w-full min-w-0">
      {editMode ? (
        <DesktopTileDeleteButton onDelete={() => onDeleteItem(item.id)} />
      ) : null}

      <motion.div
        animate={{ scale: 1, boxShadow: "0 4px 10px rgba(0,0,0,0.08)" }}
        transition={{ type: "spring", stiffness: 450, damping: 32 }}
        className={cn(
          "desktop-tile-handle group relative h-full w-full select-none overflow-hidden rounded-2xl",
          "bg-card border border-border/60"
        )}
        title={item.title}
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
        <div className={cn("h-full w-full", editMode ? "pointer-events-none" : "")}>
          <DesktopTileContent item={item} />
        </div>
      </motion.div>
    </div>
  );
}
