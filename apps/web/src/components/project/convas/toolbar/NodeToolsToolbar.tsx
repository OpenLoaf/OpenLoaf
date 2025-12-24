"use client";

import { memo } from "react";
import { cn } from "@udecode/cn";
import { PanelItem } from "./ToolbarParts";

export interface NodeToolItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  tone?: "danger";
}

export interface NodeToolsToolbarProps {
  items: NodeToolItem[];
  size?: "md" | "sm";
  className?: string;
  containerClassName?: string;
}

/** Render a compact toolbar for node actions. */
const NodeToolsToolbar = memo(function NodeToolsToolbar({
  items,
  size = "sm",
  className,
  containerClassName,
}: NodeToolsToolbarProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto nodrag nopan rounded-md bg-background p-2 ring-1 ring-border",
        containerClassName,
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={cn("flex items-center gap-1", className)}>
        {items.map((item) => (
          <PanelItem
            key={item.id}
            title={item.title}
            size={size}
            onClick={item.onClick}
            active={item.active}
            className={item.tone === "danger" ? "text-destructive hover:bg-destructive/10" : ""}
          >
            {item.icon}
          </PanelItem>
        ))}
      </div>
    </div>
  );
});

export default NodeToolsToolbar;
