"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import type { DesktopItem } from "./types";
import DesktopTile, { DesktopTilePreview, type DesktopMetrics } from "./DesktopTile";

const GRID_DROPZONE_ID = "__desktop-grid__";

function getItemSpan(item: DesktopItem, cols: number): { w: number; h: number } {
  if (item.kind !== "widget") return { w: 1, h: 1 };
  const base =
    item.size === "1x1"
      ? { w: 1, h: 1 }
      : item.size === "2x2"
        ? { w: 2, h: 2 }
        : { w: 4, h: 2 };

  const maxW = Math.max(1, cols);
  const w = Math.min(base.w, maxW);
  const h = base.w > maxW ? Math.max(2, base.h) : base.h;
  return { w, h };
}

function computeStartCellById(items: DesktopItem[], cols: number): Map<string, number> {
  // 模拟 dense 放置，记录每个组件的“起始格子”索引（row * cols + col）。
  const startCellById = new Map<string, number>();
  const occupied = new Set<string>();

  const isFree = (r: number, c: number) => !occupied.has(`${r}:${c}`);
  const mark = (r: number, c: number) => occupied.add(`${r}:${c}`);

  let maxRow = 0;
  for (const item of items) {
    const span = getItemSpan(item, cols);
    const w = Math.max(1, Math.min(cols, span.w));
    const h = Math.max(1, span.h);

    let placed = false;
    for (let r = 0; r < 400 && !placed; r += 1) {
      for (let c = 0; c <= cols - w; c += 1) {
        let ok = true;
        for (let rr = r; rr < r + h && ok; rr += 1) {
          for (let cc = c; cc < c + w; cc += 1) {
            if (!isFree(rr, cc)) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;

        for (let rr = r; rr < r + h; rr += 1) {
          for (let cc = c; cc < c + w; cc += 1) mark(rr, cc);
        }
        startCellById.set(item.id, r * cols + c);
        maxRow = Math.max(maxRow, r + h);
        placed = true;
        break;
      }
    }

    if (!placed) {
      startCellById.set(item.id, maxRow * cols);
      maxRow += h;
    }
  }

  return startCellById;
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDesiredCellIndexFromPointer(args: {
  pointer: { x: number; y: number };
  gridRect: DOMRect;
  metrics: DesktopMetrics;
}) {
  const { pointer, gridRect, metrics } = args;
  const usable = Math.max(0, gridRect.width - metrics.padding * 2);
  const colWidth =
    metrics.cols > 0 ? (usable - (metrics.cols - 1) * metrics.gap) / metrics.cols : metrics.cell;

  const x = pointer.x - gridRect.left - metrics.padding;
  const y = pointer.y - gridRect.top - metrics.padding;

  const col = clampInt(Math.floor(x / (colWidth + metrics.gap)), 0, Math.max(0, metrics.cols - 1));
  const row = Math.max(0, Math.floor(y / (metrics.cell + metrics.gap)));
  return row * metrics.cols + col;
}

function DesktopEndDropzone({ metrics }: { metrics: DesktopMetrics }) {
  const rows = Math.max(4, Math.ceil(480 / metrics.cell));
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        gridRow: `span ${rows} / span ${rows}`,
      }}
    />
  );
}

interface DesktopGridProps {
  items: DesktopItem[];
  editMode: boolean;
  onSetEditMode: (nextEditMode: boolean) => void;
  onChangeItems: (nextItems: DesktopItem[]) => void;
  onDeleteItem: (itemId: string) => void;
}

/** Render a responsive desktop grid; edit mode enables drag sorting (supports dropping into blank end area). */
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

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = React.useState<number>(0);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      setContainerWidth(entry?.contentRect?.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = React.useMemo<DesktopMetrics>(() => {
    // 根据容器宽度自适应列数与格子密度。
    const width = containerWidth;
    const small = width > 0 && width < 520;
    const cell = small ? 72 : 84;
    const gap = small ? 12 : 16;
    const padding = small ? 16 : 24;

    const usable = Math.max(0, width - padding * 2);
    const rawCols = usable > 0 ? Math.floor((usable + gap) / (cell + gap)) : 6;
    const cols = Math.max(4, Math.min(10, rawCols || 6));
    return { cols, cell, gap, padding };
  }, [containerWidth]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: editMode ? { distance: 4 } : { delay: 320, tolerance: 6 },
    })
  );

  const { setNodeRef: setGridDroppableRef } = useDroppable({ id: GRID_DROPZONE_ID });
  const setGridRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      gridRef.current = node;
      setGridDroppableRef(node);
    },
    [setGridDroppableRef]
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overlaySize, setOverlaySize] = React.useState<{ width: number; height: number } | null>(
    null
  );

  const activeItem = React.useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [activeId, items]
  );

  const overlayFallbackSize = React.useMemo(() => {
    if (!activeItem) return null;

    const base =
      activeItem.kind === "widget"
        ? activeItem.size === "1x1"
          ? { w: 1, h: 1 }
          : activeItem.size === "2x2"
            ? { w: 2, h: 2 }
            : { w: 4, h: 2 }
        : { w: 1, h: 1 };

    const w = Math.min(base.w, Math.max(1, metrics.cols));
    const h = base.w > metrics.cols && activeItem.kind === "widget" ? Math.max(2, base.h) : base.h;

    // 列宽是 1fr，fallback 宽度按实际列宽计算，避免 overlay 变窄。
    const usable = Math.max(0, containerWidth - metrics.padding * 2);
    const colWidth =
      metrics.cols > 0 ? (usable - (metrics.cols - 1) * metrics.gap) / metrics.cols : metrics.cell;

    const width = w * colWidth + (w - 1) * metrics.gap;
    const height = h * metrics.cell + (h - 1) * metrics.gap;
    return { width, height };
  }, [activeItem, containerWidth, metrics.cell, metrics.cols, metrics.gap, metrics.padding]);

  const lastPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    lastPointerRef.current = args.pointerCoordinates ?? null;
    const collisions = pointerWithin(args);
    if (collisions.length > 0) {
      // 优先把具体组件作为 over，避免 grid 过度“吸附”。
      const nonGrid = collisions.filter((c) => c.id !== GRID_DROPZONE_ID);
      const grid = collisions.filter((c) => c.id === GRID_DROPZONE_ID);
      return [...nonGrid, ...grid];
    }
    const fallback = rectIntersection(args);
    if (fallback.length > 0) return fallback;
    return closestCenter(args);
  }, []);

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const id = event.active?.id;
      if (typeof id !== "string") return;
      onSetEditMode(true);
      setActiveId(id);
      const rect = event.active?.rect?.current?.initial;
      if (rect && typeof rect.width === "number" && typeof rect.height === "number") {
        setOverlaySize({ width: rect.width, height: rect.height });
      } else {
        setOverlaySize(null);
      }
    },
    [onSetEditMode]
  );

  const rafRef = React.useRef<number | null>(null);
  const requestReorder = React.useCallback(
    (nextItems: DesktopItem[]) => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        onChangeItems(nextItems);
      });
    },
    [onChangeItems]
  );

  React.useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const reorderByDesiredCell = React.useCallback(
    (args: { activeId: string; desiredCellIndex: number }) => {
      const current = itemsRef.current;
      const oldIndex = current.findIndex((item) => item.id === args.activeId);
      if (oldIndex < 0) return;

      const active = current[oldIndex]!;
      const rest = current.filter((item) => item.id !== args.activeId);
      const startCellById = computeStartCellById(rest, metrics.cols);

      let insertIndex = rest.length;
      for (let i = 0; i < rest.length; i += 1) {
        const startCell = startCellById.get(rest[i]!.id);
        if (startCell == null) continue;
        if (startCell >= args.desiredCellIndex) {
          insertIndex = i;
          break;
        }
      }

      const next = [...rest.slice(0, insertIndex), active, ...rest.slice(insertIndex)];
      if (next.length !== current.length) return;
      if (next.every((item, idx) => item.id === current[idx]!.id)) return;
      requestReorder(next);
    },
    [metrics.cols, requestReorder]
  );

  const handleDragMove = React.useCallback(
    (event: DragMoveEvent) => {
      if (!editMode) return;
      const active = event.active?.id;
      const over = event.over?.id;
      if (typeof active !== "string") return;
      if (typeof over !== "string") return;

      if (over !== GRID_DROPZONE_ID) return;
      const pointer = lastPointerRef.current;
      const gridEl = gridRef.current;
      if (!pointer || !gridEl) return;
      const gridRect = gridEl.getBoundingClientRect();
      const desiredCellIndex = getDesiredCellIndexFromPointer({ pointer, gridRect, metrics });
      reorderByDesiredCell({ activeId: active, desiredCellIndex });
    },
    [editMode, metrics, reorderByDesiredCell]
  );

  const handleDragOver = React.useCallback(
    (event: DragOverEvent) => {
      if (!editMode) return;
      const active = event.active?.id;
      const over = event.over?.id;
      if (typeof active !== "string") return;
      if (typeof over !== "string") return;
      if (active === over) return;

      const current = itemsRef.current;
      const oldIndex = current.findIndex((item) => item.id === active);
      if (oldIndex < 0) return;

      if (over === GRID_DROPZONE_ID) {
        const pointer = lastPointerRef.current;
        const gridEl = gridRef.current;
        if (!pointer || !gridEl) return;
        const gridRect = gridEl.getBoundingClientRect();
        const desiredCellIndex = getDesiredCellIndexFromPointer({ pointer, gridRect, metrics });
        reorderByDesiredCell({ activeId: active, desiredCellIndex });
        return;
      }

      // 预览 over 在具体组件上时，按组件顺序重排。
      const newIndex = current.findIndex((item) => item.id === over);
      if (newIndex < 0) return;
      requestReorder(arrayMove(current, oldIndex, newIndex));
    },
    [editMode, metrics, onChangeItems, reorderByDesiredCell, requestReorder]
  );

  const handleDragEnd = React.useCallback(() => {
    setActiveId(null);
    setOverlaySize(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragCancel={handleDragEnd}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
        <div ref={containerRef} className="relative">
          <div
            className="grid grid-flow-row-dense content-start"
            style={{
              gridTemplateColumns: `repeat(${metrics.cols}, minmax(0, 1fr))`,
              gridAutoRows: `${metrics.cell}px`,
              gap: `${metrics.gap}px`,
              padding: `${metrics.padding}px`,
            }}
            ref={setGridRef}
            onPointerDown={(event) => {
              if (!editMode) return;
              const target = event.target instanceof Element ? event.target : null;
              if (!target) return;
              if (target.closest('[data-desktop-tile="true"]')) return;
              onSetEditMode(false);
            }}
          >
            {items.map((item) => (
              <DesktopTile
                key={item.id}
                item={item}
                editMode={editMode}
                onEnterEditMode={() => onSetEditMode(true)}
                onDeleteItem={onDeleteItem}
                metrics={metrics}
                isOverlay={false}
              />
            ))}

            {/* 允许拖到网格底部空白处，形成新行（移动到末尾）。 */}
            <DesktopEndDropzone metrics={metrics} />
          </div>
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <DesktopTilePreview item={activeItem} metrics={metrics} size={overlaySize ?? overlayFallbackSize} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
