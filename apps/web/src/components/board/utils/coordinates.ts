import type { CanvasPoint, CanvasViewportState } from "../engine/types";

type ViewportSource = {
  /** Viewport state used for coordinate conversion. */
  viewport: CanvasViewportState;
};

/** Convert a world point to screen coordinates. */
function toScreenPoint(point: CanvasPoint, source: ViewportSource): CanvasPoint {
  const { zoom, offset } = source.viewport;
  return [point[0] * zoom + offset[0], point[1] * zoom + offset[1]];
}

export { toScreenPoint };
