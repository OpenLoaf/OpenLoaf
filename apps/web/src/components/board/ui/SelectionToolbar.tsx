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

import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@udecode/cn";

import type {
  CanvasPoint,
  CanvasRect,
  CanvasToolbarItem,
} from "../engine/types";
import { toScreenPoint } from "../utils/coordinates";
import { HoverPanel, PanelItem, toolbarSurfaceClassName } from "./ToolbarParts";
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
        "pointer-events-auto nodrag nopan absolute z-20 -translate-x-1/2 rounded-xl",
        "p-2",
        toolbarSurfaceClassName,
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
  /** Currently open panel id. */
  openPanelId: string | null;
  /** Update panel open state. */
  setOpenPanelId: (panelId: string | null) => void;
  /** Whether to render a trailing divider. */
  showDivider?: boolean;
};

/** Render a group of toolbar items with optional divider. */
function ToolbarGroup({ items, openPanelId, setOpenPanelId, showDivider }: ToolbarGroupProps) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map(item => {
        const hasPanel = Boolean(item.panel);
        const isPanelOpen = openPanelId === item.id;
        const panelContent = item.panel
          ? typeof item.panel === "function"
            ? item.panel({ closePanel: () => setOpenPanelId(null) })
            : item.panel
          : null;
        const isActive = Boolean(item.active) || isPanelOpen;
        return (
          <div key={item.id} className="relative">
            <PanelItem
              title={item.label}
              size="sm"
              active={isActive}
              onClick={() => {
                if (hasPanel) {
                  setOpenPanelId(isPanelOpen ? null : item.id);
                  return;
                }
                setOpenPanelId(null);
                item.onSelect?.();
              }}
              showLabel={item.showLabel}
              className={item.id === "delete" ? "text-destructive hover:bg-destructive/10" : ""}
            >
              {item.icon}
            </PanelItem>
            {panelContent ? (
              <HoverPanel
                open={isPanelOpen}
                className={cn("w-max", item.panelClassName)}
              >
                {panelContent}
              </HoverPanel>
            ) : null}
          </div>
        );
      })}
      {showDivider ? <span className="mx-1 h-5 w-px bg-[#e3e8ef] dark:bg-slate-700" /> : null}
    </>
  );
}

export { SelectionToolbarContainer, ToolbarGroup };
