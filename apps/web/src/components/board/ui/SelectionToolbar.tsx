"use client";

import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@udecode/cn";

import type {
  CanvasPoint,
  CanvasRect,
  CanvasToolbarItem,
} from "../engine/types";
import { toScreenPoint } from "../utils/coordinates";
import { PanelItem } from "./ToolbarParts";
import { useBoardEngine } from "../core/BoardProvider";
import { useBoardViewState } from "../core/useBoardViewState";

type SelectionToolbarContainerProps = {
  /** Anchor bounds in world coordinates. */
  bounds: CanvasRect;
  /** Tailwind offset class for toolbar positioning. */
  offsetClass: string;
  /** Pointer down handler to prevent canvas drag. */
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** Toolbar contents. */
  children: ReactNode;
};

/** Shared container for selection toolbars. */
function SelectionToolbarContainer({
  bounds,
  offsetClass,
  onPointerDown,
  children,
}: SelectionToolbarContainerProps) {
  // 逻辑：视图变化时独立刷新位置，避免依赖全量快照更新。
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  // 逻辑：工具条固定在节点上方，不再自动切换上下位置。
  const anchor: CanvasPoint = [bounds.x + bounds.w / 2, bounds.y];
  const screen = toScreenPoint(anchor, viewState);

  return (
    <div
      data-node-toolbar
      className={cn(
        "pointer-events-auto nodrag nopan absolute z-20 -translate-x-1/2 rounded-md",
        "bg-card p-2 ring-1 ring-border shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
        offsetClass
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
          showLabel={item.showLabel}
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
