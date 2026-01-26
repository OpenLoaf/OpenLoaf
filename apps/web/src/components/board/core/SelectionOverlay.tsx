import { LayoutGrid, Layers, ArrowDown, ArrowUp, Copy, Lock, Trash2, Unlock, Maximize2, MoveDiagonal2 } from "lucide-react";
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  CanvasElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
  CanvasViewportState,
} from "../engine/types";
import { CanvasEngine } from "../engine/CanvasEngine";
import {
  MULTI_SELECTION_HANDLE_SIZE,
  MULTI_SELECTION_OUTLINE_PADDING,
  GUIDE_MARGIN,
  MIN_ZOOM,
  SNAP_PIXEL,
} from "../engine/constants";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";
import { snapResizeRectSE } from "../utils/alignment-guides";
import { SelectionToolbarContainer, ToolbarGroup } from "../ui/SelectionToolbar";
import { useBoardContext } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";

type SingleSelectionToolbarProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Target node element. */
  element: CanvasNodeElement;
  /** Snapshot for positioning. */
  snapshot: CanvasSnapshot;
  /** Open node inspector. */
  onInspect: (elementId: string) => void;
};

/** Render a toolbar for a single selected node. */
export function SingleSelectionToolbar({
  engine,
  element,
  snapshot,
  onInspect,
}: SingleSelectionToolbarProps) {
  const { fileContext } = useBoardContext();
  // 逻辑：画布锁定时隐藏节点工具条。
  if (snapshot.locked) return null;
  const definition = engine.nodes.getDefinition(element.type);
  const items = definition?.toolbar?.({
    element,
    selected: true,
    fileContext,
    openInspector: onInspect,
    updateNodeProps: patch => {
      engine.doc.updateNodeProps(element.id, patch);
      engine.commitHistory();
    },
    ungroupSelection: () => engine.ungroupSelection(),
    uniformGroupSize: groupId => engine.uniformGroupSize(groupId),
    layoutGroup: (groupId, direction) => engine.layoutGroup(groupId, direction),
    getGroupLayoutAxis: groupId => engine.getGroupLayoutAxis(groupId),
  });

  const hasOverlap = hasNodeOverlap(element, snapshot.elements);
  const isTopMost = isNodeTopMost(element, snapshot.elements);
  const isBottomMost = isNodeBottomMost(element, snapshot.elements);
  const commonItems = buildCommonToolbarItems(engine, element, {
    showBringToFront: hasOverlap && !isTopMost,
    showSendToBack: hasOverlap && isTopMost && !isBottomMost,
  });
  const customItems = items ?? [];
  if (customItems.length === 0 && commonItems.length === 0) return null;

  const bounds = computeSelectionBounds([element], snapshot.viewport.zoom);

  return (
    <SelectionToolbarContainer
      bounds={bounds}
      offsetClass="-translate-y-full -mt-3"
      onPointerDown={event => {
        // 逻辑：避免拖拽节点时误触工具条。
        event.stopPropagation();
      }}
    >
      <div className="flex items-center gap-1">
        <ToolbarGroup
          items={customItems}
          showDivider={customItems.length > 0 && commonItems.length > 0}
        />
        <ToolbarGroup items={commonItems} />
      </div>
    </SelectionToolbarContainer>
  );
}

type MultiSelectionToolbarProps = {
  /** Snapshot used for selection state. */
  snapshot: CanvasSnapshot;
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Open inspector handler. */
  onInspect: (elementId: string) => void;
};

/** Tolerance in px when checking layout spacing/alignment. */
const LAYOUT_SPACING_TOLERANCE = 2;

/** Render a toolbar for multi-selected nodes. */
export function MultiSelectionToolbar({
  snapshot,
  engine,
  onInspect,
}: MultiSelectionToolbarProps) {
  const { fileContext } = useBoardContext();
  // 逻辑：画布锁定时隐藏节点工具条。
  if (snapshot.locked) return null;
  const selectedNodes = snapshot.selectedIds
    .map(id => snapshot.elements.find(element => element.id === id))
    .filter((element): element is CanvasNodeElement => element?.kind === "node");
  if (selectedNodes.length <= 1) return null;

  const firstNode = selectedNodes[0];
  if (!firstNode) return null;
  const sameType = selectedNodes.every(node => node.type === firstNode.type);
  const definition = sameType ? engine.nodes.getDefinition(firstNode.type) : null;
  const customItems = definition?.toolbar
    ? definition.toolbar({
      element: firstNode,
      selected: true,
      fileContext,
      openInspector: onInspect,
      updateNodeProps: patch => {
        engine.doc.updateNodeProps(firstNode.id, patch);
        engine.commitHistory();
      },
      ungroupSelection: () => engine.ungroupSelection(),
      uniformGroupSize: groupId => engine.uniformGroupSize(groupId),
      layoutGroup: (groupId, direction) => engine.layoutGroup(groupId, direction),
      getGroupLayoutAxis: groupId => engine.getGroupLayoutAxis(groupId),
    })
    : [];

  const layoutAxis = getSelectionLayoutAxis(selectedNodes);
  const isUniformRow =
    layoutAxis === "row"
    && hasUniformSpacing(selectedNodes, "row", LAYOUT_SPACING_TOLERANCE);
  const isUniformColumn =
    layoutAxis === "column"
    && hasUniformSpacing(selectedNodes, "column", LAYOUT_SPACING_TOLERANCE);
  const layoutLabel = isUniformRow
    ? "竖向排列"
    : isUniformColumn
      ? "横向排列"
      : "自动布局";
  const layoutDirection = isUniformRow
    ? "column"
    : isUniformColumn
      ? "row"
      : resolveAutoLayoutDirection(selectedNodes, layoutAxis, snapshot.viewport.zoom);

  const bounds = computeSelectionBounds(selectedNodes, snapshot.viewport.zoom);

  return (
    <SelectionToolbarContainer
      bounds={bounds}
      offsetClass="-translate-y-full -mt-3"
      onPointerDown={event => {
        // 逻辑：避免多选工具条触发画布拖拽。
        event.stopPropagation();
      }}
    >
      <div className="flex items-center gap-1">
        <ToolbarGroup
          items={customItems}
          showDivider={customItems.length > 0}
        />
        <ToolbarGroup
          items={[
            {
              id: "group",
              label: "编组",
              icon: <Layers size={14} />,
              onSelect: () => engine.groupSelection(),
            },
            {
              id: "layout",
              label: layoutLabel,
              icon: <LayoutGrid size={14} />,
              onSelect: () => engine.layoutSelection(layoutDirection),
            },
            {
              id: "delete",
              label: "删除",
              icon: <Trash2 size={14} />,
              onSelect: () => engine.deleteSelection(),
            },
          ]}
        />
      </div>
    </SelectionToolbarContainer>
  );
}

type MultiSelectionOutlineProps = {
  /** Snapshot used for selection state. */
  snapshot: CanvasSnapshot;
  /** Canvas engine instance. */
  engine: CanvasEngine;
};

/** Render outline box for multi-selected nodes. */
export function MultiSelectionOutline({ snapshot, engine }: MultiSelectionOutlineProps) {
  // 逻辑：视图状态单独订阅，避免多选框跟随缩放时触发全局渲染。
  const viewState = useBoardViewState(engine);
  const selectedElements = snapshot.selectedIds
    .map(id => snapshot.elements.find(element => element.id === id))
    .filter((element): element is CanvasElement =>
      Boolean(element && element.kind === "node")
    );
  if (selectedElements.length <= 1) return null;
  const selectedNodes = selectedElements.filter(
    (element): element is CanvasNodeElement => element.kind === "node"
  );
  // 逻辑：仅允许可缩放节点参与多选缩放，避免笔迹等节点被拉伸。
  const resizableNodes = selectedNodes.filter(node => {
    const definition = engine.nodes.getDefinition(node.type);
    return definition?.capabilities?.resizable !== false;
  });

  const bounds = computeSelectionBounds(selectedElements, viewState.viewport.zoom);
  const { zoom, offset } = viewState.viewport;
  const left = bounds.x * zoom + offset[0];
  const top = bounds.y * zoom + offset[1];
  const width = bounds.w * zoom;
  const height = bounds.h * zoom;
  const padding = MULTI_SELECTION_OUTLINE_PADDING;
  const handleSize = MULTI_SELECTION_HANDLE_SIZE;

  return (
    <>
      <div
        data-board-selection-outline
        className="pointer-events-none absolute z-10 rounded-lg border border-dashed border-slate-400/70 dark:border-slate-300/60"
        style={{
          left: left - padding,
          top: top - padding,
          width: width + padding * 2,
          height: height + padding * 2,
        }}
      />
      {resizableNodes.length > 0 ? (
        <MultiSelectionResizeHandle
          engine={engine}
          nodes={resizableNodes}
          bounds={bounds}
          viewport={viewState.viewport}
          size={handleSize}
          padding={padding}
        />
      ) : null}
    </>
  );
}

type SingleSelectionResizeHandleProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Target node element. */
  element: CanvasNodeElement;
  /** Snapshot for positioning. */
  snapshot: CanvasSnapshot;
};

/** Render a resize handle for a single selected node. */
export function SingleSelectionResizeHandle({
  engine,
  element,
  snapshot,
}: SingleSelectionResizeHandleProps) {
  const definition = engine.nodes.getDefinition(element.type);
  const canResize = definition?.capabilities?.resizable !== false;
  if (!canResize || snapshot.locked || element.locked) return null;

  // 逻辑：视图变化时单独更新控制柄位置，避免全量快照渲染。
  const viewState = useBoardViewState(engine);
  const { zoom, offset } = viewState.viewport;
  const left = element.xywh[0] * zoom + offset[0];
  const top = element.xywh[1] * zoom + offset[1];
  const width = element.xywh[2] * zoom;
  const height = element.xywh[3] * zoom;
  const size = 16;
  const padding = 6;
  const x = left + width - size - padding;
  const y = top + height - size - padding;

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (engine.isLocked()) return;
    event.stopPropagation();
    event.preventDefault();

    const container = engine.getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startPoint: [number, number] = [
      event.clientX - rect.left,
      event.clientY - rect.top,
    ];
    const startWorld = engine.screenToWorld(startPoint);
    const [startX, startY, startW, startH] = element.xywh;
    const minSize = definition?.capabilities?.minSize ?? { w: 80, h: 60 };
    const maxSize = definition?.capabilities?.maxSize;
    const resizeMode = definition?.capabilities?.resizeMode ?? "free";
    const useRatioRange = resizeMode === "ratio-range" && Boolean(maxSize);
    const useUniformResize =
      resizeMode === "uniform" || (resizeMode === "ratio-range" && !maxSize);

    engine.setDraggingElementId(element.id);
    engine.setAlignmentGuides([]);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextPoint: [number, number] = [
        moveEvent.clientX - rect.left,
        moveEvent.clientY - rect.top,
      ];
      const nextWorld = engine.screenToWorld(nextPoint);
      const dx = nextWorld[0] - startWorld[0];
      const dy = nextWorld[1] - startWorld[1];
      const useWidth = Math.abs(dx) >= Math.abs(dy);
      let nextW = startW + dx;
      let nextH = startH + dy;
      if (useUniformResize) {
        // 逻辑：等比例缩放时按统一比例计算，确保宽高比不变。
        const rawScale = useWidth
          ? (startW + dx) / startW
          : (startH + dy) / startH;
        const minScale = Math.max(
          minSize.w / startW,
          minSize.h / startH
        );
        const maxScale = maxSize
          ? Math.min(maxSize.w / startW, maxSize.h / startH)
          : Number.POSITIVE_INFINITY;
        const scale = Math.min(maxScale, Math.max(minScale, rawScale));
        nextW = startW * scale;
        nextH = startH * scale;
      } else if (useRatioRange && maxSize) {
        // 逻辑：按拖拽主轴在 min/max 区间线性插值宽高比。
        const minRatio = minSize.w / Math.max(minSize.h, 1);
        const maxRatio = maxSize.w / Math.max(maxSize.h, 1);
        if (useWidth) {
          const clampedW = Math.min(maxSize.w, Math.max(minSize.w, nextW));
          const widthRange = maxSize.w - minSize.w;
          const t = widthRange === 0 ? 0 : (clampedW - minSize.w) / widthRange;
          const ratio = minRatio + (maxRatio - minRatio) * t;
          nextW = clampedW;
          nextH = clampedW / Math.max(ratio, 0.001);
        } else {
          const clampedH = Math.min(maxSize.h, Math.max(minSize.h, nextH));
          const heightRange = maxSize.h - minSize.h;
          const t = heightRange === 0 ? 0 : (clampedH - minSize.h) / heightRange;
          const ratio = minRatio + (maxRatio - minRatio) * t;
          nextH = clampedH;
          nextW = clampedH * ratio;
        }
      }
      // 逻辑：保持最小尺寸，避免节点缩放到不可操作。
      const baseRect = {
        x: startX,
        y: startY,
        w: Math.max(minSize.w, nextW),
        h: Math.max(minSize.h, nextH),
      };
      const clampedRect = maxSize
        ? {
            x: baseRect.x,
            y: baseRect.y,
            w: Math.min(maxSize.w, baseRect.w),
            h: Math.min(maxSize.h, baseRect.h),
          }
        : baseRect;
      const { zoom } = engine.viewport.getState();
      // 逻辑：缩放下按屏幕像素换算吸附阈值。
      const threshold = SNAP_PIXEL / Math.max(zoom, MIN_ZOOM);
      const margin = GUIDE_MARGIN / Math.max(zoom, MIN_ZOOM);
      const others = engine.doc
        .getElements()
        .filter(
          current => current.kind === "node" && current.id !== element.id
        )
        .map(current => {
          const [x, y, width, height] = current.xywh;
          return { x, y, w: width, h: height };
        });

      if (useUniformResize || useRatioRange) {
        // 逻辑：等比例/比例区间缩放时不参与吸附，避免破坏比例。
        engine.doc.updateElement(element.id, {
          xywh: [clampedRect.x, clampedRect.y, clampedRect.w, clampedRect.h],
        });
        engine.setAlignmentGuides([]);
        return;
      }
      const snapped = snapResizeRectSE(clampedRect, others, threshold, margin, minSize);
      engine.doc.updateElement(element.id, {
        xywh: [snapped.rect.x, snapped.rect.y, snapped.rect.w, snapped.rect.h],
      });
      engine.setAlignmentGuides(snapped.guides);
    };

    const handlePointerUp = () => {
      engine.setDraggingElementId(null);
      engine.setAlignmentGuides([]);
      engine.commitHistory();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <button
      type="button"
      aria-label="Resize"
      data-resize-handle
      onPointerDown={handlePointerDown}
      className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-md border border-slate-300/70 bg-background/90 text-slate-500 shadow-[0_6px_12px_rgba(15,23,42,0.12)] transition hover:text-slate-800 dark:border-slate-300/60 dark:text-slate-200"
      style={{ left: x, top: y, width: size, height: size }}
    >
      <MoveDiagonal2 size={14} className="pointer-events-none" />
    </button>
  );
}

type MultiSelectionResizeHandleProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Selected node elements. */
  nodes: CanvasNodeElement[];
  /** Selection bounds in world space. */
  bounds: CanvasRect;
  /** Viewport state for positioning. */
  viewport: CanvasViewportState;
  /** Handle size in px. */
  size: number;
  /** Outline padding in px. */
  padding: number;
};

/** Render and handle multi-selection resize control. */
function MultiSelectionResizeHandle({
  engine,
  nodes,
  bounds,
  viewport,
  size,
  padding,
}: MultiSelectionResizeHandleProps) {
  /** Drag state captured on pointer down. */
  const startRef = useRef<{
    startWorld: CanvasPoint;
    startBounds: CanvasRect;
    startRects: Map<string, [number, number, number, number]>;
  } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (engine.isLocked()) return;
    event.preventDefault();
    event.stopPropagation();

    const container = engine.getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const screenPoint: [number, number] = [
      event.clientX - rect.left,
      event.clientY - rect.top,
    ];
    const startWorld = engine.screenToWorld(screenPoint);
    const startRects = new Map<string, [number, number, number, number]>();
    nodes.forEach(node => {
      startRects.set(node.id, [...node.xywh]);
    });
    startRef.current = {
      startWorld,
      startBounds: { ...bounds },
      startRects,
    };

    engine.setDraggingElementId(nodes[0]?.id ?? null);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!startRef.current) return;
      const nextScreen: [number, number] = [
        moveEvent.clientX - rect.left,
        moveEvent.clientY - rect.top,
      ];
      const nextWorld = engine.screenToWorld(nextScreen);
      const dx = nextWorld[0] - startRef.current.startWorld[0];
      const dy = nextWorld[1] - startRef.current.startWorld[1];
      const startBounds = startRef.current.startBounds;
      const nextW = Math.max(40, startBounds.w + dx);
      const nextH = Math.max(40, startBounds.h + dy);
      let scaleX = nextW / Math.max(startBounds.w, 1);
      let scaleY = nextH / Math.max(startBounds.h, 1);

      // 逻辑：根据节点最小/最大尺寸约束缩放比例。
      const scaleLimits = getGroupScaleLimits(engine, nodes, startRef.current.startRects);
      scaleX = clamp(scaleX, scaleLimits.minX, scaleLimits.maxX);
      scaleY = clamp(scaleY, scaleLimits.minY, scaleLimits.maxY);

      engine.doc.transact(() => {
        startRef.current?.startRects.forEach((rectValue, id) => {
          const [x, y, w, h] = rectValue;
          const nextX = startBounds.x + (x - startBounds.x) * scaleX;
          const nextY = startBounds.y + (y - startBounds.y) * scaleY;
          const nextWidth = w * scaleX;
          const nextHeight = h * scaleY;
          engine.doc.updateElement(id, {
            xywh: [nextX, nextY, nextWidth, nextHeight],
          });
        });
      });
    };

    const handlePointerUp = () => {
      engine.setDraggingElementId(null);
      engine.commitHistory();
      startRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleLeft = bounds.x * viewport.zoom + viewport.offset[0] - padding;
  const handleTop = bounds.y * viewport.zoom + viewport.offset[1] - padding;
  const handleWidth = bounds.w * viewport.zoom + padding * 2;
  const handleHeight = bounds.h * viewport.zoom + padding * 2;
  const x = handleLeft + handleWidth - size / 2;
  const y = handleTop + handleHeight - size / 2;

  return (
    <button
      type="button"
      aria-label="Resize selection"
      data-multi-resize-handle
      onPointerDown={handlePointerDown}
      className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-md border border-slate-400/70 bg-background/90 text-slate-500 shadow-[0_6px_12px_rgba(15,23,42,0.12)] transition hover:text-slate-800 dark:border-slate-300/60 dark:text-slate-200"
      style={{ left: x, top: y, width: size, height: size }}
    >
      <Maximize2 size={14} className="pointer-events-none rotate-90" />
    </button>
  );
}

/** Clamp a value between bounds. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Compute scale limits for a multi-selection resize. */
function getGroupScaleLimits(
  engine: CanvasEngine,
  nodes: CanvasNodeElement[],
  startRects: Map<string, [number, number, number, number]>
) {
  let minX = 0.1;
  let minY = 0.1;
  let maxX = 6;
  let maxY = 6;
  nodes.forEach(node => {
    const definition = engine.nodes.getDefinition(node.type);
    const minSize = definition?.capabilities?.minSize;
    const maxSize = definition?.capabilities?.maxSize;
    const rect = startRects.get(node.id);
    if (!rect) return;
    const [, , w, h] = rect;
    if (minSize) {
      minX = Math.max(minX, minSize.w / Math.max(w, 1));
      minY = Math.max(minY, minSize.h / Math.max(h, 1));
    }
    if (maxSize) {
      maxX = Math.min(maxX, maxSize.w / Math.max(w, 1));
      maxY = Math.min(maxY, maxSize.h / Math.max(h, 1));
    }
  });
  return { minX, minY, maxX, maxY };
}

/** Build shared toolbar items for every node. */
function buildCommonToolbarItems(
  engine: CanvasEngine,
  element: CanvasNodeElement,
  options?: { showBringToFront?: boolean; showSendToBack?: boolean }
) {
  // 逻辑：确保操作目标锁定到当前节点。
  const focusSelection = () => {
    engine.selection.setSelection([element.id]);
  };
  const isLocked = element.locked === true;
  const items = [
    {
      id: "duplicate",
      label: "复制",
      icon: <Copy size={14} />,
      onSelect: () => {
        focusSelection();
        engine.copySelection();
        engine.pasteClipboard();
      },
    },
    ...(options?.showBringToFront
      ? [
          {
            id: "bring-to-front",
            label: "置顶",
            icon: <ArrowUp size={14} />,
            onSelect: () => {
              focusSelection();
              engine.bringNodeToFront(element.id);
            },
          },
        ]
      : []),
    ...(options?.showSendToBack
      ? [
          {
            id: "send-to-back",
            label: "置底",
            icon: <ArrowDown size={14} />,
            onSelect: () => {
              focusSelection();
              engine.sendNodeToBack(element.id);
            },
          },
        ]
      : []),
    {
      id: "lock",
      label: isLocked ? "解锁" : "锁定",
      icon: isLocked ? <Unlock size={14} /> : <Lock size={14} />,
      onSelect: () => {
        focusSelection();
        engine.setElementLocked(element.id, !isLocked);
      },
    },
    ...(!isLocked
      ? [
          {
            id: "delete",
            label: "删除",
            icon: <Trash2 size={14} />,
            onSelect: () => {
              focusSelection();
              engine.deleteSelection();
            },
          },
        ]
      : []),
  ];
  return items;
}

/** Compute bounds for a list of selected elements. */
function computeSelectionBounds(elements: CanvasElement[], zoom: number): CanvasRect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  elements.forEach(element => {
    const bounds = resolveSelectionBounds(element, zoom);
    const [x, y, w, h] = [bounds.x, bounds.y, bounds.w, bounds.h];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Resolve bounds for selection calculations. */
function resolveSelectionBounds(element: CanvasElement, zoom: number): CanvasRect {
  const [x, y, w, h] = element.xywh;
  if (element.kind !== "node" || !isGroupNodeType(element.type)) {
    return { x, y, w, h };
  }
  // 逻辑：组节点使用屏幕像素外扩，保证缩放下交互一致。
  const padding = getGroupOutlinePadding(zoom);
  return {
    x: x - padding,
    y: y - padding,
    w: w + padding * 2,
    h: h + padding * 2,
  };
}

type LayoutAxis = "row" | "column" | "mixed";

/** Detect the layout axis for a list of nodes. */
function getSelectionLayoutAxis(nodes: CanvasNodeElement[]): LayoutAxis {
  if (nodes.length < 2) return "mixed";

  let maxLeft = Number.NEGATIVE_INFINITY;
  let minRight = Number.POSITIVE_INFINITY;
  let maxTop = Number.NEGATIVE_INFINITY;
  let minBottom = Number.POSITIVE_INFINITY;
  nodes.forEach(node => {
    const [x, y, w, h] = node.xywh;
    maxLeft = Math.max(maxLeft, x);
    minRight = Math.min(minRight, x + w);
    maxTop = Math.max(maxTop, y);
    minBottom = Math.min(minBottom, y + h);
  });
  // 逻辑：通过横纵向重叠关系判断布局方向。
  const overlapX = maxLeft <= minRight + LAYOUT_SPACING_TOLERANCE;
  const overlapY = maxTop <= minBottom + LAYOUT_SPACING_TOLERANCE;
  if (overlapY && !overlapX) return "row";
  if (overlapX && !overlapY) return "column";
  return "mixed";
}

/** Resolve which layout direction to apply when auto layout is requested. */
function resolveAutoLayoutDirection(
  nodes: CanvasNodeElement[],
  axis: LayoutAxis,
  zoom: number
): "row" | "column" {
  if (axis === "row" || axis === "column") return axis;
  const bounds = computeSelectionBounds(nodes, zoom);
  return bounds.w >= bounds.h ? "row" : "column";
}

/** Check whether nodes are aligned and evenly spaced along the given axis. */
function hasUniformSpacing(
  nodes: CanvasNodeElement[],
  axis: "row" | "column",
  tolerance: number
): boolean {
  if (nodes.length < 2) return false;
  const sorted = [...nodes].sort((a, b) =>
    axis === "row" ? a.xywh[0] - b.xywh[0] : a.xywh[1] - b.xywh[1]
  );

  let minGap = Number.POSITIVE_INFINITY;
  let maxGap = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const gap = axis === "row"
      ? current.xywh[0] - (previous.xywh[0] + previous.xywh[2])
      : current.xywh[1] - (previous.xywh[1] + previous.xywh[3]);
    if (gap < -tolerance) return false;
    minGap = Math.min(minGap, gap);
    maxGap = Math.max(maxGap, gap);
  }

  const crossPositions = nodes.map(node => (axis === "row" ? node.xywh[1] : node.xywh[0]));
  const minCross = Math.min(...crossPositions);
  const maxCross = Math.max(...crossPositions);

  // 逻辑：需要主轴间距一致且交叉轴对齐。
  if (maxCross - minCross > tolerance) return false;
  return maxGap - minGap <= tolerance;
}

/** Check whether the selected node overlaps any other node. */
function hasNodeOverlap(target: CanvasNodeElement, elements: CanvasElement[]): boolean {
  const [tx, ty, tw, th] = target.xywh;
  const tRight = tx + tw;
  const tBottom = ty + th;
  return elements.some(element => {
    if (element.kind !== "node" || element.id === target.id) return false;
    const [x, y, w, h] = element.xywh;
    const right = x + w;
    const bottom = y + h;
    return tx < right && tRight > x && ty < bottom && tBottom > y;
  });
}

/** Check whether the node is already on top. */
function isNodeTopMost(target: CanvasNodeElement, elements: CanvasElement[]): boolean {
  const maxZ = elements
    .filter(element => element.kind === "node")
    .reduce((current, element) => Math.max(current, element.zIndex ?? 0), 0);
  return (target.zIndex ?? 0) >= maxZ;
}

/** Check whether the node is already at the bottom. */
function isNodeBottomMost(target: CanvasNodeElement, elements: CanvasElement[]): boolean {
  const minZ = elements
    .filter(element => element.kind === "node")
    .reduce((current, element) => Math.min(current, element.zIndex ?? 0), 0);
  return (target.zIndex ?? 0) <= minZ;
}
