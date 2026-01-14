import { cn } from "@udecode/cn";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CanvasRect, CanvasSnapshot } from "../engine/types";
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

/** Render the DOM-based node layer. */
export function CanvasDomLayer({ engine, snapshot, onCullingStatsChange }: CanvasDomLayerProps) {
  const { zoom, offset } = snapshot.viewport;
  const [isZooming, setIsZooming] = useState(false);
  const lastZoomRef = useRef(zoom);
  const zoomTimeoutRef = useRef<number | null>(null);
  const lastStatsRef = useRef<CanvasCullingStats | null>(null);
  const viewportBounds = getViewportBounds(snapshot.viewport, VIEWPORT_CULL_PADDING);
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

  useEffect(() => {
    if (lastZoomRef.current === zoom) return;
    // 逻辑：缩放期间启用 will-change，结束后移除以触发清晰重绘。
    lastZoomRef.current = zoom;
    setIsZooming(true);
    if (zoomTimeoutRef.current) {
      window.clearTimeout(zoomTimeoutRef.current);
    }
    zoomTimeoutRef.current = window.setTimeout(() => {
      setIsZooming(false);
      zoomTimeoutRef.current = null;
    }, 160);
  }, [zoom]);

  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        window.clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, []);

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
    if (!onCullingStatsChange) return;
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
    onCullingStatsChange(nextStats);
  }, [culledNodes, onCullingStatsChange, totalNodes, visibleNodes]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 origin-top-left",
        (snapshot.panning || isZooming) && "will-change-transform"
      )}
      style={{
        transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`,
      }}
    >
      {nodeViews}
    </div>
  );
}
