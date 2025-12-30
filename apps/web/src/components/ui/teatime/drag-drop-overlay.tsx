"use client";

import type { ReactNode } from "react";

type DragDropOverlayProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  radiusClassName?: string;
};

/** Drag-and-drop overlay with unified style. */
export function DragDropOverlay({
  open,
  title,
  description,
  radiusClassName = "rounded-[inherit]",
}: DragDropOverlayProps) {
  if (!open) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-50 grid place-items-center overflow-hidden ${radiusClassName}`}
    >
      <div
        className={`absolute inset-0 bg-background/35 backdrop-blur-xl ${radiusClassName}`}
      />
      <div className="relative mx-6 w-full max-w-md rounded-2xl border bg-background/70 px-5 py-4 shadow-lg backdrop-blur-xl">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
    </div>
  );
}
