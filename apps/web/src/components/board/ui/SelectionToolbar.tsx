"use client";

import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@udecode/cn";

import type {
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
  CanvasToolbarItem,
} from "../engine/types";
import { toScreenPoint } from "../utils/coordinates";
import { PanelItem } from "./ToolbarParts";

type SelectionToolbarContainerProps = {
  /** Snapshot used for positioning. */
  snapshot: CanvasSnapshot;
  /** Anchor bounds in world coordinates. */
  bounds: CanvasRect;
  /** Tailwind offset class when toolbar is below. */
  offsetClass: string;
  /** Tailwind offset class when toolbar is above. */
  offsetClassAbove: string;
  /** Pointer down handler to prevent canvas drag. */
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** Toolbar contents. */
  children: ReactNode;
};

/** Shared container for selection toolbars. */
function SelectionToolbarContainer({
  snapshot,
  bounds,
  offsetClass,
  offsetClassAbove,
  onPointerDown,
  children,
}: SelectionToolbarContainerProps) {
  const { zoom, offset, size } = snapshot.viewport;
  const screenTop = bounds.y * zoom + offset[1];
  // 逻辑：命中视口顶部区域时工具条显示在下方。
  const showBelow = screenTop <= size[1] * 0.15;
  const anchor: CanvasPoint = showBelow
    ? [bounds.x + bounds.w / 2, bounds.y + bounds.h]
    : [bounds.x + bounds.w / 2, bounds.y];
  const screen = toScreenPoint(anchor, snapshot);

  return (
    <div
      data-node-toolbar
      className={cn(
        "pointer-events-auto nodrag nopan absolute z-20 -translate-x-1/2 rounded-md",
        "bg-background p-2 ring-1 ring-border shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
        showBelow ? offsetClass : offsetClassAbove
      )}
      style={{ left: screen[0], top: screen[1] }}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}

type ToolbarGroupProps = {
  /** Items to render in the toolbar group. */
  items: CanvasToolbarItem[];
  /** Whether to render a trailing divider. */
  showDivider?: boolean;
};

/** Render a group of toolbar items with optional divider. */
function ToolbarGroup({ items, showDivider }: ToolbarGroupProps) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map(item => (
        <PanelItem
          key={item.id}
          title={item.label}
          size="sm"
          onClick={() => item.onSelect()}
          className={item.id === "delete" ? "text-destructive hover:bg-destructive/10" : ""}
        >
          {item.icon}
        </PanelItem>
      ))}
      {showDivider ? <span className="mx-1 h-5 w-px bg-border" /> : null}
    </>
  );
}

export { SelectionToolbarContainer, ToolbarGroup };
