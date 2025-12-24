"use client";

import { memo } from "react";
import type { PointerEventHandler, ReactNode } from "react";
import { cn } from "@udecode/cn";

export interface NodeToolbarPanelProps {
  children: ReactNode;
  className?: string;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
}

/**
 * Render a reusable toolbar panel container with consistent padding and border.
 * Use this to keep node tool panels visually aligned and easy to style.
 */
const NodeToolbarPanel = memo(function NodeToolbarPanel({
  children,
  className,
  onPointerDown,
}: NodeToolbarPanelProps) {
  return (
    <div
      className={cn("rounded-md bg-background p-1.5 ring-1 ring-border", className)}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
});

export default NodeToolbarPanel;
