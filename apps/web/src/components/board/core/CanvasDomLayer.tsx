/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { cn } from "@udecode/cn";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CanvasRect,
  CanvasSnapshot,
  CanvasViewState,
  CanvasViewportState,
} from "../engine/types";
import { CanvasEngine } from "../engine/CanvasEngine";
import { MIN_ZOOM_EPS } from "../engine/constants";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";

type CanvasCullingStats = {
  /** Total renderable node count. */
  totalNodes: number;
  /** Node count inside the viewport. */
  visibleNodes: number;
  /** Node count culled by the viewport. */
  culledNodes: number;
};

type CanvasDomLayerProps = {
  /** Engine reference used for node resolution. */
  engine: CanvasEngine;
  /** Current snapshot used for rendering nodes. */
  snapshot: CanvasSnapshot;
  /** Notify when culling stats change. */
  onCullingStatsChange?: (stats: CanvasCullingStats) => void;
};

/** Screen-space padding for viewport culling in pixels. */
const VIEWPORT_CULL_PADDING = 240;
/** Throttle interval for viewport-driven culling updates. */
const VIEWPORT_CULL_UPDATE_MS = 80;
/** Minimum node count before enabling viewport culling. */
const CULLING_NODE_THRESHOLD = 120;
/** Cell size for the node spatial index in world space. */
const GRID_CELL_SIZE = 512;

type GridIndex = {
  /** Size of each grid cell in world units. */
  cellSize: number;
  /** Map of cell keys to node id sets. */
  cells: Map<string, Set<string>>;
};

/** Compute the viewport bounds in world coordinates with padding. */
function getViewportBounds(
  viewport: CanvasViewportState,
  padding: number
): CanvasRect {
  const safeZoom = Math.max(viewport.zoom, MIN_ZOOM_EPS);
  const paddingWorld = padding / safeZoom;
  const x = -viewport.offset[0] / safeZoom - paddingWorld;
  const y = -viewport.offset[1] / safeZoom - paddingWorld;
  const w = viewport.size[0] / safeZoom + paddingWorld * 2;
  const h = viewport.size[1] / safeZoom + paddingWorld * 2;
  return { x, y, w, h };
}

/** Return true when the node rect intersects the viewport bounds. */
function isRectVisible(rect: CanvasRect, bounds: CanvasRect): boolean {
  return !(
    rect.x + rect.w < bounds.x ||
    rect.x > bounds.x + bounds.w ||
    rect.y + rect.h < bounds.y ||
    rect.y > bounds.y + bounds.h
  );
}

/** Return the bounding rect for a node element. */
function getNodeBounds(
  element: Extract<CanvasSnapshot["elements"][number], { kind: "node" }>,
  groupPadding: number
): CanvasRect {
  const [x, y, w, h] = element.xywh;
  const padding = isGroupNodeType(element.type) ? groupPadding : 0;
  const paddedX = x - padding;
  const paddedY = y - padding;
  const paddedW = w + padding * 2;
  const paddedH = h + padding * 2;
  if (!element.rotate) {
    return { x: paddedX, y: paddedY, w: paddedW, h: paddedH };
  }
  const rad = (element.rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // 逻辑：旋转节点先转成包围盒，避免裁剪漏掉可见区域。
  const halfW = (Math.abs(paddedW * cos) + Math.abs(paddedH * sin)) / 2;
  const halfH = (Math.abs(paddedW * sin) + Math.abs(paddedH * cos)) / 2;
  const cx = paddedX + paddedW / 2;
  const cy = paddedY + paddedH / 2;
  return {
    x: cx - halfW,
    y: cy - halfH,
    w: halfW * 2,
    h: halfH * 2,
  };
}

/** Build a spatial index for node elements. */
function buildGridIndex(
  elements: CanvasSnapshot["elements"],
  cellSize: number,
  groupPadding: number
): GridIndex {
  const cells = new Map<string, Set<string>>();
  elements.forEach((element) => {
    if (element.kind !== "node") return;
    const bounds = getNodeBounds(element, groupPadding);
    const minX = Math.floor(bounds.x / cellSize);
    const maxX = Math.floor((bounds.x + bounds.w) / cellSize);
    const minY = Math.floor(bounds.y / cellSize);
    const maxY = Math.floor((bounds.y + bounds.h) / cellSize);
    for (let gx = minX; gx <= maxX; gx += 1) {
      for (let gy = minY; gy <= maxY; gy += 1) {
        const key = `${gx}:${gy}`;
        let bucket = cells.get(key);
        if (!bucket) {
          bucket = new Set<string>();
          cells.set(key, bucket);
        }
        bucket.add(element.id);
      }
    }
  });
  return { cellSize, cells };
}

/** Collect candidate node ids for a viewport bounds. */
function collectCandidateIds(index: GridIndex, bounds: CanvasRect): Set<string> {
  const result = new Set<string>();
  const minX = Math.floor(bounds.x / index.cellSize);
  const maxX = Math.floor((bounds.x + bounds.w) / index.cellSize);
  const minY = Math.floor(bounds.y / index.cellSize);
  const maxY = Math.floor((bounds.y + bounds.h) / index.cellSize);
  for (let gx = minX; gx <= maxX; gx += 1) {
    for (let gy = minY; gy <= maxY; gy += 1) {
      const bucket = index.cells.get(`${gx}:${gy}`);
      if (!bucket) continue;
      bucket.forEach((id) => {
        result.add(id);
      });
    }
  }
  return result;
}

/** Return true when two string arrays share the same values. */
function isStringArrayEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Render the DOM-based node layer. */
function CanvasDomLayerBase({
  engine,
  snapshot,
  onCullingStatsChange,
}: CanvasDomLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const viewStateRef = useRef<CanvasViewState>(engine.getViewState());
  const pendingViewRef = useRef<CanvasViewState | null>(null);
  const pendingCullingRef = useRef<CanvasViewState | null>(null);
  const lastZoomRef = useRef(viewStateRef.current.viewport.zoom);
  const zoomTimeoutRef = useRef<number | null>(null);
  const transformRafRef = useRef<number | null>(null);
  const cullingTimerRef = useRef<number | null>(null);
  const isZoomingRef = useRef(false);
  const lastStatsRef = useRef<CanvasCullingStats | null>(null);
  const onCullingStatsRef = useRef(onCullingStatsChange);
  const [cullingView, setCullingView] = useState<CanvasViewState>(
    viewStateRef.current
  );
  const gridIndexRef = useRef<GridIndex | null>(null);
  const lastDocRevisionRef = useRef<number | null>(null);

  const applyTransform = useCallback((view: CanvasViewState) => {
    const layer = layerRef.current;
    if (!layer) return;
    const { zoom, offset } = view.viewport;
    layer.style.transform = `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`;
    layer.style.willChange =
      view.panning || isZoomingRef.current ? "transform" : "";
  }, []);

  const scheduleTransform = useCallback(
    (view: CanvasViewState) => {
      pendingViewRef.current = view;
      if (transformRafRef.current !== null) return;
      transformRafRef.current = window.requestAnimationFrame(() => {
        transformRafRef.current = null;
        const next = pendingViewRef.current;
        if (!next) return;
        applyTransform(next);
      });
    },
    [applyTransform]
  );

  const scheduleCullingUpdate = useCallback((view: CanvasViewState) => {
    if (!gridIndexRef.current) return;
    pendingCullingRef.current = view;
    if (cullingTimerRef.current !== null) return;
    cullingTimerRef.current = window.setTimeout(() => {
      cullingTimerRef.current = null;
      if (!pendingCullingRef.current) return;
      setCullingView(pendingCullingRef.current);
    }, VIEWPORT_CULL_UPDATE_MS);
  }, []);

  useEffect(() => {
    onCullingStatsRef.current = onCullingStatsChange;
  }, [onCullingStatsChange]);

  useEffect(() => {
    if (lastDocRevisionRef.current === snapshot.docRevision) return;
    const nodeCount = snapshot.elements.reduce((count, element) => {
      if (element.kind !== "node") return count;
      return count + 1;
    }, 0);
    if (nodeCount < CULLING_NODE_THRESHOLD) {
      // 逻辑：节点数量较少时跳过裁剪，避免滚动触发重渲染。
      gridIndexRef.current = null;
      pendingCullingRef.current = null;
      if (cullingTimerRef.current) {
        window.clearTimeout(cullingTimerRef.current);
        cullingTimerRef.current = null;
      }
      lastDocRevisionRef.current = snapshot.docRevision;
      return;
    }
    // 逻辑：文档变更时重建空间索引，避免拖拽/缩放重复全量扫描。
    const groupPadding = getGroupOutlinePadding(viewStateRef.current.viewport.zoom);
    gridIndexRef.current = buildGridIndex(snapshot.elements, GRID_CELL_SIZE, groupPadding);
    lastDocRevisionRef.current = snapshot.docRevision;
    setCullingView(viewStateRef.current);
  }, [snapshot.docRevision, snapshot.elements]);

  useEffect(() => {
    const handleViewChange = () => {
      const next = engine.getViewState();
      viewStateRef.current = next;
      if (lastZoomRef.current !== next.viewport.zoom) {
        lastZoomRef.current = next.viewport.zoom;
        isZoomingRef.current = true;
        if (zoomTimeoutRef.current) {
          window.clearTimeout(zoomTimeoutRef.current);
        }
        zoomTimeoutRef.current = window.setTimeout(() => {
          isZoomingRef.current = false;
          scheduleTransform(viewStateRef.current);
          zoomTimeoutRef.current = null;
        }, 160);
        if (!gridIndexRef.current) {
          setCullingView(next);
        }
      }
      // 逻辑：视图变化优先更新 transform，并节流裁剪刷新。
      scheduleTransform(next);
      scheduleCullingUpdate(next);
    };

    handleViewChange();
    const unsubscribe = engine.subscribeView(handleViewChange);
    return () => {
      unsubscribe();
      if (zoomTimeoutRef.current) {
        window.clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = null;
      }
      if (transformRafRef.current !== null) {
        window.cancelAnimationFrame(transformRafRef.current);
        transformRafRef.current = null;
      }
      if (cullingTimerRef.current) {
        window.clearTimeout(cullingTimerRef.current);
        cullingTimerRef.current = null;
      }
    };
  }, [engine, scheduleCullingUpdate, scheduleTransform]);

  const shouldCull = Boolean(gridIndexRef.current);
  const viewportBounds = shouldCull
    ? getViewportBounds(cullingView.viewport, VIEWPORT_CULL_PADDING)
    : null;
  const groupPadding = getGroupOutlinePadding(cullingView.viewport.zoom);
  const candidateIds =
    shouldCull && gridIndexRef.current && viewportBounds
      ? collectCandidateIds(gridIndexRef.current, viewportBounds)
      : null;
  const selectedNodeIds = new Set(
    snapshot.selectedIds.filter(id => {
      const element = snapshot.elements.find(item => item.id === id);
      return element?.kind === "node";
    })
  );
  const draggingGroup =
    snapshot.draggingId !== null &&
    selectedNodeIds.size > 1 &&
    selectedNodeIds.has(snapshot.draggingId);

  const nodeViews: ReactNode[] = [];
  let totalNodes = 0;
  let visibleNodes = 0;
  snapshot.elements.forEach((element) => {
    if (element.kind !== "node") return;
    if (shouldCull && candidateIds && !candidateIds.has(element.id)) return;
    const definition = engine.nodes.getDefinition(element.type);
    if (!definition) return;
    totalNodes += 1;
    const View = definition.view;
    const [x, y, w, h] = element.xywh;
    // 逻辑：只渲染视窗附近的节点，减少 DOM 开销。
    if (
      shouldCull &&
      viewportBounds &&
      !isRectVisible(getNodeBounds(element, groupPadding), viewportBounds)
    ) {
      return;
    }
    visibleNodes += 1;
    const selected = selectedNodeIds.has(element.id);
    const isDragging =
      snapshot.draggingId === element.id || (draggingGroup && selected);
    const isEditing = element.id === snapshot.editingNodeId;
    const padding = isGroupNodeType(element.type) ? groupPadding : 0;
    const paddedX = x - padding;
    const paddedY = y - padding;
    const paddedW = w + padding * 2;
    const paddedH = h + padding * 2;

    nodeViews.push(
      <div
        key={element.id}
        data-board-node
        data-board-editor={isEditing || undefined}
        data-node-type={element.type}
        data-selected={selected || undefined}
        className={cn(
          "absolute select-none",
          isGroupNodeType(element.type) ? "pointer-events-none" : "pointer-events-auto"
        )}
        style={{
          left: paddedX,
          top: paddedY,
          width: paddedW,
          height: paddedH,
          transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
          transformOrigin: "center",
        }}
      >
        <div
          className={cn(
            "h-full w-full transition-transform duration-150 ease-out"
          )}
        >
          <View
            element={element}
            selected={selected}
            editing={isEditing}
            onSelect={() => engine.selection.setSelection([element.id])}
            onUpdate={patch => engine.doc.updateNodeProps(element.id, patch)}
          />
        </div>
      </div>
    );
  });
  const culledNodes = totalNodes - visibleNodes;

  useEffect(() => {
    if (!onCullingStatsRef.current) return;
    const nextStats: CanvasCullingStats = { totalNodes, visibleNodes, culledNodes };
    const prev = lastStatsRef.current;
    if (
      prev &&
      prev.totalNodes === nextStats.totalNodes &&
      prev.visibleNodes === nextStats.visibleNodes &&
      prev.culledNodes === nextStats.culledNodes
    ) {
      return;
    }
    lastStatsRef.current = nextStats;
    // 逻辑：仅在统计变化时通知，避免重复触发渲染。
    onCullingStatsRef.current?.(nextStats);
  }, [culledNodes, totalNodes, visibleNodes]);

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 origin-top-left"
      style={{
        transform: `translate(${cullingView.viewport.offset[0]}px, ${cullingView.viewport.offset[1]}px) scale(${cullingView.viewport.zoom})`,
      }}
    >
      {nodeViews}
    </div>
  );
}

/** Compare props for DOM layer rendering. */
function areDomLayerPropsEqual(
  prev: CanvasDomLayerProps,
  next: CanvasDomLayerProps
): boolean {
  if (prev.engine !== next.engine) return false;
  if (prev.snapshot.elements !== next.snapshot.elements) return false;
  if (prev.snapshot.draggingId !== next.snapshot.draggingId) return false;
  if (prev.snapshot.editingNodeId !== next.snapshot.editingNodeId) return false;
  if (!isStringArrayEqual(prev.snapshot.selectedIds, next.snapshot.selectedIds)) {
    return false;
  }
  return true;
}

export const CanvasDomLayer = memo(CanvasDomLayerBase, areDomLayerPropsEqual);
