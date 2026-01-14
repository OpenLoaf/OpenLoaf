import { cn } from "@udecode/cn";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CanvasRect, CanvasSnapshot, CanvasViewState } from "../engine/types";
import { CanvasEngine } from "../engine/CanvasEngine";
import { MIN_ZOOM_EPS } from "../engine/constants";

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

/** Compute the viewport bounds in world coordinates with padding. */
function getViewportBounds(
  viewport: CanvasSnapshot["viewport"],
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

  const viewportBounds = getViewportBounds(cullingView.viewport, VIEWPORT_CULL_PADDING);
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
    const definition = engine.nodes.getDefinition(element.type);
    if (!definition) return;
    totalNodes += 1;
    const View = definition.view;
    const [x, y, w, h] = element.xywh;
    // 逻辑：只渲染视窗附近的节点，减少 DOM 开销。
    if (!isRectVisible({ x, y, w, h }, viewportBounds)) return;
    visibleNodes += 1;
    const selected = selectedNodeIds.has(element.id);
    const isDragging =
      snapshot.draggingId === element.id || (draggingGroup && selected);
    const isEditing = element.id === snapshot.editingNodeId;

    nodeViews.push(
      <div
        key={element.id}
        data-board-node
        data-board-editor={isEditing || undefined}
        data-node-type={element.type}
        data-selected={selected || undefined}
        className="pointer-events-auto absolute select-none"
        style={{
          left: x,
          top: y,
          width: w,
          height: h,
          transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
          transformOrigin: "center",
        }}
      >
        <div
          className={cn(
            "h-full w-full transition-transform duration-150 ease-out",
            isDragging &&
              "scale-[1.02] drop-shadow-[0_18px_40px_var(--canvas-drag-shadow)]"
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
