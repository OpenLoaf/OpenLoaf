import { cn } from "@udecode/cn";
import type { CanvasElement, CanvasRect, CanvasSnapshot } from "../engine/types";
import {
  MINIMAP_HEIGHT,
  MINIMAP_PADDING_MIN,
  MINIMAP_PADDING_RATIO,
  MINIMAP_WIDTH,
  MIN_ZOOM_EPS,
} from "../engine/constants";

type MiniMapProps = {
  /** Snapshot for rendering the minimap. */
  snapshot: CanvasSnapshot;
  /** Whether the minimap should be visible. */
  visible: boolean;
};

/** Render a lightweight minimap for viewport context. */
export function MiniMap({ snapshot, visible }: MiniMapProps) {
  const mapWidth = MINIMAP_WIDTH;
  const mapHeight = MINIMAP_HEIGHT;
  const elementsBounds = computeElementsBounds(snapshot.elements);
  const viewportBounds = getViewportBounds(snapshot.viewport);
  const worldBounds = mergeBounds(elementsBounds, viewportBounds);
  const padding = Math.max(
    MINIMAP_PADDING_MIN,
    Math.min(worldBounds.w, worldBounds.h) * MINIMAP_PADDING_RATIO
  );
  const paddedBounds: CanvasRect = {
    x: worldBounds.x - padding,
    y: worldBounds.y - padding,
    w: worldBounds.w + padding * 2,
    h: worldBounds.h + padding * 2,
  };
  const scaleX = mapWidth / Math.max(paddedBounds.w, 1);
  const scaleY = mapHeight / Math.max(paddedBounds.h, 1);
  const scale = Math.min(scaleX, scaleY);
  const elementRects = snapshot.elements.map(element =>
    mapRectToMiniMap(
      {
        x: element.xywh[0],
        y: element.xywh[1],
        w: element.xywh[2],
        h: element.xywh[3],
      },
      paddedBounds,
      scale
    )
  );
  const viewRect = mapRectToMiniMap(viewportBounds, paddedBounds, scale);

  return (
    <div
      data-board-minimap
      className={cn(
        "pointer-events-none absolute left-4 top-4 z-30 transition-opacity duration-200 ease-out",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="rounded-lg bg-background p-2 shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur">
        <svg
          width={mapWidth}
          height={mapHeight}
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="block"
        >
          <rect
            x={0}
            y={0}
            width={mapWidth}
            height={mapHeight}
            fill="var(--canvas-minimap-bg)"
            rx={10}
            ry={10}
          />
          {elementRects.map((rect, index) => (
            <rect
              key={`${rect.x}-${rect.y}-${index}`}
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
              fill="var(--canvas-minimap-node)"
              stroke="var(--canvas-minimap-node-stroke)"
              strokeWidth={1}
              rx={2}
              ry={2}
            />
          ))}
          <rect
            x={viewRect.x}
            y={viewRect.y}
            width={viewRect.w}
            height={viewRect.h}
            fill="none"
            stroke="var(--canvas-minimap-mask-stroke)"
            strokeWidth={1.4}
            rx={4}
            ry={4}
          />
        </svg>
      </div>
    </div>
  );
}

/** Compute bounds for all elements. */
function computeElementsBounds(elements: CanvasElement[]): CanvasRect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  elements.forEach(element => {
    const [x, y, w, h] = element.xywh;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Compute the current viewport bounds in world coordinates. */
function getViewportBounds(viewport: CanvasSnapshot["viewport"]): CanvasRect {
  const safeZoom = Math.max(viewport.zoom, MIN_ZOOM_EPS);
  const x = -viewport.offset[0] / safeZoom;
  const y = -viewport.offset[1] / safeZoom;
  const w = viewport.size[0] / safeZoom;
  const h = viewport.size[1] / safeZoom;
  return { x, y, w, h };
}

/** Merge two bounds into a single rect. */
function mergeBounds(a: CanvasRect | null, b: CanvasRect): CanvasRect {
  if (!a) return { ...b };
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Map a world rect into minimap coordinates. */
function mapRectToMiniMap(rect: CanvasRect, bounds: CanvasRect, scale: number): CanvasRect {
  return {
    x: (rect.x - bounds.x) * scale,
    y: (rect.y - bounds.y) * scale,
    w: rect.w * scale,
    h: rect.h * scale,
  };
}
