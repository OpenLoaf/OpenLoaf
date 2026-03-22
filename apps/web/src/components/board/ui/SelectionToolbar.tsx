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
  /** When true, position in world coordinates with counter-scaling (rendered inside a transform layer). */
  worldMode?: boolean;
  /** Current viewport zoom — required when worldMode is true. */
  zoom?: number;
};

/** Shared container for selection toolbars. */
function SelectionToolbarContainer({
  bounds,
  offsetClass,
  onPointerDown,
  children,
  worldMode,
  zoom = 1,
}: SelectionToolbarContainerProps) {
  // 逻辑：视图变化时独立刷新位置，避免依赖全量快照更新。
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);

  if (worldMode) {
    // 世界坐标模式：工具栏在 transform 层内，位置使用世界坐标，通过 counter-scale 保持恒定屏幕尺寸。
    // 锚点放在节点上边缘中心，transformOrigin 0 0 保证此世界坐标点在缩放时不漂移。
    // 内层 div 用 -translate-x-1/2 -translate-y-full 实现居中 + 上移。
    const anchorX = bounds.x + bounds.w / 2;
    const anchorY = bounds.y;
    return (
      <div
        className="absolute"
        style={{
          left: anchorX,
          top: anchorY,
          transform: `scale(${1 / zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        <div
          data-node-toolbar
          className={cn(
            "pointer-events-auto nodrag nopan -translate-x-1/2 rounded-full",
            "px-2 py-1.5",
            toolbarSurfaceClassName,
            offsetClass,
          )}
          onPointerDown={onPointerDown}
          onMouseDown={event => event.preventDefault()}
        >
          {children}
        </div>
      </div>
    );
  }

  // 屏幕坐标模式（旧逻辑，用于多选工具栏等）。
  const anchor: CanvasPoint = [bounds.x + bounds.w / 2, bounds.y];
  const screen = toScreenPoint(anchor, viewState);

  return (
    <div
      data-node-toolbar
      className={cn(
        "pointer-events-auto nodrag nopan absolute z-20 -translate-x-1/2 rounded-full",
        "px-2 py-1.5",
        toolbarSurfaceClassName,
        offsetClass
      )}
      style={{ left: screen[0], top: screen[1] }}
      onPointerDown={onPointerDown}
      onMouseDown={event => event.preventDefault()}
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
  /** Compact mode: icon-only items grouped tightly in a pill container. */
  compact?: boolean;
};

/** Render a group of toolbar items with optional divider. */
function ToolbarGroup({ items, openPanelId, setOpenPanelId, showDivider, compact }: ToolbarGroupProps) {
  if (items.length === 0) return null;

  // 逻辑：关闭面板时触发 onPanelClose 回调（如保存颜色历史）。
  const closePanelWithCallback = (nextId: string | null) => {
    if (openPanelId && openPanelId !== nextId) {
      const closingItem = items.find(i => i.id === openPanelId);
      closingItem?.onPanelClose?.();
    }
    setOpenPanelId(nextId);
  };

  const renderItem = (item: CanvasToolbarItem) => {
    const hasPanel = Boolean(item.panel);
    const isPanelOpen = openPanelId === item.id;
    const panelContent = item.panel
      ? typeof item.panel === "function"
        ? item.panel({ closePanel: () => closePanelWithCallback(null) })
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
              closePanelWithCallback(isPanelOpen ? null : item.id);
              return;
            }
            closePanelWithCallback(null);
            item.onSelect?.();
          }}
          showLabel={item.showLabel}
          className={item.className}
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
  };

  return (
    <>
      {compact ? (
        <div className="flex items-center gap-0 rounded-full bg-muted/40 p-0.5">
          {items.map(renderItem)}
        </div>
      ) : (
        items.map(renderItem)
      )}
      {showDivider ? <span className="mx-1 h-5 w-px bg-ol-divider" /> : null}
    </>
  );
}

export { SelectionToolbarContainer, ToolbarGroup };
