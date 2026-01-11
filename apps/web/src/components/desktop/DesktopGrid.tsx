"use client";

import * as React from "react";
import { GridStack, type GridStackNode } from "gridstack";
import type { DesktopItem } from "./types";
import DesktopTileGridstack from "./DesktopTileGridstack";

function sameLayout(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

interface DesktopMetrics {
  cols: number;
  cell: number;
  gap: number;
  padding: number;
}

function clampItemToCols(item: DesktopItem, cols: number): DesktopItem {
  const w = Math.max(1, Math.min(cols, item.layout.w));
  const h = Math.max(1, item.layout.h);
  const x = Math.max(0, Math.min(cols - w, item.layout.x));
  const y = Math.max(0, item.layout.y);
  if (sameLayout(item.layout, { x, y, w, h })) return item;
  return { ...item, layout: { x, y, w, h } };
}

interface DesktopGridProps {
  items: DesktopItem[];
  editMode: boolean;
  onSetEditMode: (nextEditMode: boolean) => void;
  onChangeItems: (nextItems: DesktopItem[]) => void;
  onDeleteItem: (itemId: string) => void;
}

/** Render a responsive Gridstack desktop grid; edit mode enables drag & resize. */
export default function DesktopGrid({
  items,
  editMode,
  onSetEditMode,
  onChangeItems,
  onDeleteItem,
}: DesktopGridProps) {
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const editModeRef = React.useRef(editMode);
  React.useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const gridContainerRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<GridStack | null>(null);
  const syncingRef = React.useRef(false);
  const itemElByIdRef = React.useRef(new Map<string, HTMLDivElement>());

  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      setContainerWidth(entry?.contentRect?.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = React.useMemo<DesktopMetrics>(() => {
    const width = containerWidth;
    const small = width > 0 && width < 520;
    // 最小单元高度：需要容纳 icon + title（含边框），避免在窄屏下被裁切。
    const cell = small ? 80 : 84;
    const gap = small ? 12 : 16;
    const padding = small ? 16 : 24;

    const usable = Math.max(0, width - padding * 2);
    const rawCols = usable > 0 ? Math.floor((usable + gap) / (cell + gap)) : 6;
    const cols = Math.max(4, Math.min(10, rawCols || 6));
    return { cols, cell, gap, padding };
  }, [containerWidth]);

  React.useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const grid = GridStack.init(
      {
        column: metrics.cols,
        cellHeight: metrics.cell,
        margin: metrics.gap,
        float: true,
        animate: true,
        draggable: { handle: ".desktop-tile-handle" },
        // 只保留右下角的 resize 交互区（不显示四周箭头）。
        resizable: { handles: "se" },
      },
      el
    );

    gridRef.current = grid;
    grid.setStatic(!editMode);

    const onChange = (_event: Event, nodes: GridStackNode[]) => {
      if (syncingRef.current) return;
      // 布局变化只在编辑态持久化；响应式缩放导致的自动重排不应写回 state。
      if (!editModeRef.current) return;

      const nodeById = new Map<string, GridStackNode>();
      for (const node of nodes) {
        const id = typeof node.id === "string" ? node.id : node.id != null ? String(node.id) : null;
        if (!id) continue;
        nodeById.set(id, node);
      }

      const current = itemsRef.current;
      let changed = false;
      const next = current.map((item) => {
        const node = nodeById.get(item.id);
        if (!node) return item;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const w = node.w ?? 1;
        const h = node.h ?? 1;
        const nextLayout = { x, y, w, h };
        if (sameLayout(item.layout, nextLayout)) return item;
        changed = true;
        return { ...item, layout: nextLayout };
      });

      if (changed) onChangeItems(next);
    };

    grid.on("change", onChange);

    return () => {
      grid.off("change");
      grid.destroy(false);
      gridRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.setStatic(!editMode);
  }, [editMode]);

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    syncingRef.current = true;
    grid.batchUpdate();
    grid.column(metrics.cols, "move");
    grid.cellHeight(metrics.cell);
    grid.margin(metrics.gap);
    grid.batchUpdate(false);
    syncingRef.current = false;
  }, [metrics.cell, metrics.cols, metrics.gap]);

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // 仅用于渲染/更新 grid 的“视图布局”，不写回 items，避免窗口尺寸变化污染原始布局。
    const viewItems = items.map((item) => clampItemToCols(item, metrics.cols));

    syncingRef.current = true;
    grid.batchUpdate();
    for (const item of viewItems) {
      const el = itemElByIdRef.current.get(item.id);
      if (!el) continue;
      grid.update(el, { ...item.layout });
    }
    grid.batchUpdate(false);
    syncingRef.current = false;
  }, [items, metrics.cols]);

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <div
        className="grid-stack"
        ref={gridContainerRef}
        style={{ padding: metrics.padding }}
        onPointerDown={(event) => {
          if (!editMode) return;
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          if (target.closest('[data-desktop-tile="true"]')) return;
          onSetEditMode(false);
        }}
      >
        {items.map((item) => {
          const viewItem = clampItemToCols(item, metrics.cols);
          return (
            <div
              key={item.id}
              ref={(node) => {
                if (node) itemElByIdRef.current.set(item.id, node);
                else itemElByIdRef.current.delete(item.id);
              }}
              className="grid-stack-item"
              {...({
                "gs-id": item.id,
                "gs-x": viewItem.layout.x,
                "gs-y": viewItem.layout.y,
                "gs-w": viewItem.layout.w,
                "gs-h": viewItem.layout.h,
                ...(item.kind === "icon" ? { "gs-no-resize": "true" } : null),
              } as Record<string, unknown>)}
            >
              <div className="grid-stack-item-content !overflow-x-visible !overflow-y-visible bg-transparent">
                <DesktopTileGridstack
                  item={item}
                  editMode={editMode}
                  onEnterEditMode={() => onSetEditMode(true)}
                  onDeleteItem={(itemId) => {
                    const el = itemElByIdRef.current.get(itemId);
                    if (el && gridRef.current) gridRef.current.removeWidget(el, false);
                    onDeleteItem(itemId);
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
