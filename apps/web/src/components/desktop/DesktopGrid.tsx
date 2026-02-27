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

import * as React from "react";
import { GridStack, type GridStackNode } from "gridstack";
import type { DesktopItem, DesktopItemLayout, DesktopScope } from "./types";
import { useBasicConfig } from "@/hooks/use-basic-config";
import {
  getBreakpointConfig,
  getBreakpointForWidth,
  getItemLayoutForBreakpoint,
  updateItemLayoutForBreakpoint,
  reflowItemsFromBreakpoint,
  type DesktopBreakpoint,
} from "./desktop-breakpoints";
import DesktopTileGridstack from "./DesktopTileGridstack";

type GridstackElement = HTMLDivElement & { gridstackNode?: GridStackNode };

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

type FontSizeSelection = "small" | "medium" | "large" | "xlarge";

/** Normalize font size selection from config. */
function normalizeFontSizeSelection(value: unknown): FontSizeSelection {
  if (value === "small" || value === "medium" || value === "large" || value === "xlarge") {
    return value;
  }
  return "medium";
}

/** Resolve scale factor for a font size selection. */
function getFontSizeScale(value: FontSizeSelection): number {
  return value === "small"
    ? 0.875
    : value === "medium"
      ? 1
      : value === "large"
        ? 1.125
        : 1.25;
}

function clampItemToCols(item: DesktopItem, cols: number, layout: DesktopItemLayout): DesktopItem {
  const w = Math.max(1, Math.min(cols, layout.w));
  const h = Math.max(1, layout.h);
  const x = Math.max(0, Math.min(cols - w, layout.x));
  const y = Math.max(0, layout.y);
  if (sameLayout(item.layout, { x, y, w, h })) return item;
  return { ...item, layout: { x, y, w, h } };
}

interface DesktopGridProps {
  items: DesktopItem[];
  /** Desktop scope (workspace or project). */
  scope: DesktopScope;
  editMode: boolean;
  /** Active breakpoint when editing. */
  activeBreakpoint: DesktopBreakpoint;
  /** Notify view-mode breakpoint changes. */
  onViewBreakpointChange?: (breakpoint: DesktopBreakpoint) => void;
  onSetEditMode: (nextEditMode: boolean) => void;
  /** Update a single desktop item. */
  onUpdateItem: (itemId: string, updater: (item: DesktopItem) => DesktopItem) => void;
  /** Update a desktop item and persist changes when needed. */
  onPersistItemUpdate?: (itemId: string, updater: (item: DesktopItem) => DesktopItem) => void;
  onChangeItems: (nextItems: DesktopItem[]) => void;
  onDeleteItem: (itemId: string) => void;
  /** Request folder selection for 3d-folder widget. */
  onSelectFolder: (itemId: string) => void;
  /** Signal value for triggering compact. */
  compactSignal: number;
}

/** Render a responsive Gridstack desktop grid; edit mode enables drag & resize. */
export default function DesktopGrid({
  items,
  scope,
  editMode,
  activeBreakpoint,
  onViewBreakpointChange,
  onSetEditMode,
  onUpdateItem,
  onPersistItemUpdate,
  onChangeItems,
  onDeleteItem,
  onSelectFolder,
  compactSignal,
}: DesktopGridProps) {
  const { basic } = useBasicConfig();
  // 中文注释：动画等级为低时禁用 Gridstack 动画。
  const enableGridAnimation = basic.uiAnimationLevel !== "low";
  // 中文注释：首屏初始化完成前隐藏网格，避免布局闪烁。
  const [isGridReady, setIsGridReady] = React.useState(false);
  const didSetReadyRef = React.useRef(false);
  // 中文注释：仅首次初始化时隐藏网格，避免编辑模式切换时闪一下。
  const hasShownGridRef = React.useRef(false);
  const lastWidthRef = React.useRef(0);
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
  // 已注册到 Gridstack 的 item id 集合。
  const registeredIdsRef = React.useRef(new Set<string>());
  // 逻辑：恢复布局后短暂屏蔽 change 事件，避免被 Gridstack 的最终布局覆盖。
  const suppressChangeRef = React.useRef(false);
  // 记录上次 compact 信号，避免首次挂载/切换编辑态时自动整理。
  const lastCompactSignalRef = React.useRef<number>(compactSignal);

  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextWidth = entry?.contentRect?.width ?? 0;
      if (nextWidth > 0) lastWidthRef.current = nextWidth;
      setContainerWidth(nextWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveWidth = containerWidth || lastWidthRef.current;

  const resolvedBreakpoint = React.useMemo(
    () =>
      effectiveWidth > 0
        ? getBreakpointForWidth(effectiveWidth)
        : "lg",
    [effectiveWidth]
  );

  const breakpointRef = React.useRef(resolvedBreakpoint);
  React.useEffect(() => {
    breakpointRef.current = resolvedBreakpoint;
  }, [resolvedBreakpoint]);

  React.useEffect(() => {
    onViewBreakpointChange?.(resolvedBreakpoint);
  }, [onViewBreakpointChange, resolvedBreakpoint]);

  // 逻辑：依据字号档位缩放网格尺寸，避免大字号导致布局溢出。
  const fontScale = React.useMemo(() => {
    const normalized = normalizeFontSizeSelection(basic.uiFontSize);
    return getFontSizeScale(normalized);
  }, [basic.uiFontSize]);

  const metrics = React.useMemo<DesktopMetrics>(() => {
    const config = getBreakpointConfig(resolvedBreakpoint);
    /** Scale grid metric with current font size. */
    const scaleMetric = (value: number) => Math.max(1, Math.round(value * fontScale));
    return {
      cols: config.columns,
      cell: scaleMetric(config.rowHeight),
      gap: scaleMetric(config.gap),
      padding: scaleMetric(config.padding),
    };
  }, [fontScale, resolvedBreakpoint]);

  React.useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    if (!hasShownGridRef.current) {
      setIsGridReady(false);
    }
    didSetReadyRef.current = false;
    // 逻辑：重建 Gridstack 时重置注册状态，确保组件重新注册并展示。
    registeredIdsRef.current = new Set();

    const grid = GridStack.init(
      {
        column: metrics.cols,
        cellHeight: metrics.cell,
        margin: metrics.gap,
        float: true,
        animate: enableGridAnimation,
        draggable: { handle: ".desktop-tile-handle" },
        // 只保留右下角的 resize 交互区（不显示四周箭头）。
        resizable: { handles: "se" },
      },
      el
    );

    gridRef.current = grid;
    grid.setStatic(!editModeRef.current);

    /** Handle layout changes from Gridstack. */
    const onChange = (_event: Event, nodes: GridStackNode[]) => {
      if (syncingRef.current) return;
      // 布局变化只在编辑态持久化；响应式缩放导致的自动重排不应写回 state。
      if (!editModeRef.current) return;
      if (suppressChangeRef.current) return;

      const nodeById = new Map<string, GridStackNode>();
      for (const node of nodes) {
        const id = typeof node.id === "string" ? node.id : node.id != null ? String(node.id) : null;
        if (!id) continue;
        nodeById.set(id, node);
      }

      const current = itemsRef.current;
      const active = breakpointRef.current;
      let changed = false;
      let next = current.map((item) => {
        const node = nodeById.get(item.id);
        if (!node) return item;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const w = node.w ?? 1;
        const h = node.h ?? 1;
        const nextLayout = { x, y, w, h };
        const currentLayout = getItemLayoutForBreakpoint(item, active);
        if (sameLayout(currentLayout, nextLayout)) return item;
        changed = true;
        return updateItemLayoutForBreakpoint(item, active, nextLayout);
      });

      // lg 编辑时自动级联 reflow 到非 customized 的 sm/md。
      if (changed && active === "lg") {
        next = reflowItemsFromBreakpoint(next, "lg");
      }

      if (changed) onChangeItems(next);
    };

    /** Sync layout state from Gridstack nodes. */
    const syncItemsFromGrid = () => {
      const nodeById = new Map<string, GridStackNode>();
      for (const node of grid.engine?.nodes ?? []) {
        const id = node.id != null ? String(node.id) : null;
        if (!id) continue;
        nodeById.set(id, node);
      }

      let changed = false;
      const active = breakpointRef.current;
      let next = itemsRef.current.map((item) => {
        const node = nodeById.get(item.id);
        if (!node) return item;
        const nextLayout = {
          x: node.x ?? 0,
          y: node.y ?? 0,
          w: node.w ?? 1,
          h: node.h ?? 1,
        };
        const currentLayout = getItemLayoutForBreakpoint(item, active);
        if (sameLayout(currentLayout, nextLayout)) return item;
        changed = true;
        return updateItemLayoutForBreakpoint(item, active, nextLayout);
      });

      // lg 编辑时自动级联 reflow 到非 customized 的 sm/md。
      if (changed && active === "lg") {
        next = reflowItemsFromBreakpoint(next, "lg");
      }

      if (changed) onChangeItems(next);
    };

    /** Sync layout after drag stop. */
    const onDragStop = () => {
      if (!editModeRef.current) return;
      syncItemsFromGrid();
    };

    /** Sync layout after resize stop. */
    const onResizeStop = () => {
      if (!editModeRef.current) return;
      syncItemsFromGrid();
    };

    grid.on("change", onChange);
    grid.on("dragstop", onDragStop);
    grid.on("resizestop", onResizeStop);

    return () => {
      grid.off("change");
      grid.off("dragstop");
      grid.off("resizestop");
      grid.destroy(false);
      gridRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableGridAnimation]);

  React.useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    if (enableGridAnimation) {
      el.classList.add("grid-stack-animate");
    } else {
      el.classList.remove("grid-stack-animate");
    }
  }, [enableGridAnimation]);


  React.useEffect(() => {
    const grid = gridRef.current;
    const containerEl = gridContainerRef.current;
    if (!grid || !containerEl) return;

    // 断点切换时临时禁用碰撞检测，确保 item 能精确放到目标断点的存储位置。
    // 编辑态下 Gridstack 的碰撞检测会把 item 推开，导致恢复 lg 布局时位置错乱。
    suppressChangeRef.current = true;
    syncingRef.current = true;
    // 逻辑：断点切换时临时禁用动画，避免动画期间的中间态 change 事件
    // 覆盖正确的目标布局（编辑模式下 onChange 会处理 change 事件）。
    const hadAnimation = containerEl.classList.contains('grid-stack-animate');
    if (hadAnimation) containerEl.classList.remove('grid-stack-animate');
    grid.setStatic(true);

    // 逻辑：grid.column() 内部会调用 engine.columnChanged()，
    // 而 columnChanged() 自己管理 batchUpdate()/batchUpdate(false)。
    // 如果在外层 batchUpdate 内调用 column()，嵌套 batch 会导致：
    // 1. 内层 batchUpdate(false) 提前结束 batchMode，后续 update() 不再被 batch
    // 2. 外层 batchUpdate(false) 时 _prevFloat 已被删除，float 变为 undefined
    //    → _packNodes() 按非浮动模式执行重力堆叠，破坏目标布局
    // 因此必须在 batchUpdate() 之前完成 column/cellHeight/margin 的更新。
    grid.column(metrics.cols, 'none');
    grid.cellHeight(metrics.cell);
    grid.margin(metrics.gap);

    grid.batchUpdate();

    // 仅用于渲染/更新 grid 的"视图布局"，不写回 items，避免窗口尺寸变化污染原始布局。
    const viewItems = items.map((item) => {
      const layout = getItemLayoutForBreakpoint(item, resolvedBreakpoint);
      return clampItemToCols(
        { ...item, layout },
        metrics.cols,
        layout
      );
    });

    // 逻辑：新添加的 DOM 需要主动注册到 Gridstack，确保使用完整的尺寸。
    const registeredIds = registeredIdsRef.current;
    const nextIds = new Set(viewItems.map((item) => item.id));
    for (const id of registeredIds) {
      if (!nextIds.has(id)) registeredIds.delete(id);
    }

    for (const item of viewItems) {
      const el = itemElByIdRef.current.get(item.id);
      if (!el) continue;
      if (!registeredIds.has(item.id)) {
        grid.makeWidget(el);
        registeredIds.add(item.id);
      }
      // 逻辑：固定组件禁止拖拽/缩放，且不允许其他组件挤占。
      const pinned = item.pinned ?? false;
      grid.update(el, {
        ...item.layout,
        noMove: pinned,
        noResize: pinned,
        locked: pinned,
      });
    }

    grid.batchUpdate(false);
    // 恢复编辑态的可交互状态。
    grid.setStatic(!editMode);
    syncingRef.current = false;
    // 逻辑：先等一帧让位置跳转生效，再恢复动画和取消事件抑制。
    // setTimeout(0) 太早——动画期间 Gridstack 会触发 change 事件，
    // 把中间态位置写回 lg 布局，导致编辑模式下缩放后无法恢复。
    requestAnimationFrame(() => {
      if (hadAnimation) containerEl.classList.add('grid-stack-animate');
      suppressChangeRef.current = false;
    });

    if (!didSetReadyRef.current) {
      didSetReadyRef.current = true;
      requestAnimationFrame(() => {
        setIsGridReady(true);
        if (!hasShownGridRef.current) {
          hasShownGridRef.current = true;
        }
      });
    }
  }, [editMode, items, metrics.cell, metrics.cols, metrics.gap, resolvedBreakpoint]);

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (compactSignal === lastCompactSignalRef.current) return;
    lastCompactSignalRef.current = compactSignal;
    if (!editMode) return;
    // 逻辑：仅在编辑态手动触发整理，允许用户保留空白布局。
    suppressChangeRef.current = true;
    grid.compact("list");
    const active = breakpointRef.current;
    const nodeById = new Map<string, GridStackNode>();
    for (const node of grid.engine?.nodes ?? []) {
      const id = node.id != null ? String(node.id) : null;
      if (!id) continue;
      nodeById.set(id, node);
    }

    let changed = false;
    const next = itemsRef.current.map((item) => {
      const node = nodeById.get(item.id);
      if (!node) return item;
      const nextLayout = {
        x: node.x ?? 0,
        y: node.y ?? 0,
        w: node.w ?? 1,
        h: node.h ?? 1,
      };
      const currentLayout = getItemLayoutForBreakpoint(item, active);
      if (sameLayout(currentLayout, nextLayout)) return item;
      changed = true;
      return updateItemLayoutForBreakpoint(item, active, nextLayout);
    });

    if (changed) onChangeItems(next);
    window.setTimeout(() => {
      suppressChangeRef.current = false;
    }, 0);
  }, [compactSignal, editMode, onChangeItems]);

  return (
    <div ref={wrapperRef} className="relative min-h-full w-full">
      <div
        className="grid-stack"
        ref={gridContainerRef}
        style={{
          padding: metrics.padding,
          opacity: isGridReady ? 1 : 0,
        }}
      >
        {items.map((item) => {
          const layout = getItemLayoutForBreakpoint(item, resolvedBreakpoint);
          const viewItem = clampItemToCols({ ...item, layout }, metrics.cols, layout);
          return (
            <div
              key={item.id}
              ref={(node) => {
                if (node) itemElByIdRef.current.set(item.id, node);
                else itemElByIdRef.current.delete(item.id);
              }}
              className="grid-stack-item"
              onContextMenu={(event) => {
                if (editMode) return;
                event.stopPropagation();
              }}
              style={
                item.kind === "widget" && item.widgetKey === "3d-folder"
                  ? { overflow: "visible" }
                  : undefined
              }
              {...({
                "gs-id": item.id,
                "gs-x": viewItem.layout.x,
                "gs-y": viewItem.layout.y,
                "gs-w": viewItem.layout.w,
                "gs-h": viewItem.layout.h,
                ...(item.pinned
                  ? {
                      "gs-no-move": "true",
                      "gs-no-resize": "true",
                      "gs-locked": "true",
                    }
                  : null),
                ...(item.kind === "widget"
                  ? {
                      "gs-min-w": item.constraints.minW,
                      "gs-min-h": item.constraints.minH,
                      "gs-max-w": item.constraints.maxW,
                      "gs-max-h": item.constraints.maxH,
                    }
                  : null),
                ...(item.kind === "icon" ? { "gs-no-resize": "true" } : null),
              } as Record<string, unknown>)}
            >
              <div className="grid-stack-item-content !overflow-x-visible !overflow-y-visible bg-transparent">
              <DesktopTileGridstack
                item={item}
                scope={scope}
                editMode={editMode}
                onEnterEditMode={() => onSetEditMode(true)}
                onUpdateItem={onUpdateItem}
                onPersistItemUpdate={onPersistItemUpdate}
                onDeleteItem={(itemId) => {
                  const el = itemElByIdRef.current.get(itemId);
                  if (el && gridRef.current) gridRef.current.removeWidget(el, false);
                  onDeleteItem(itemId);
                  }}
                  onSelectFolder={onSelectFolder}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
