import type { CanvasPoint, CanvasSnapshot } from "../engine/types";

/** Convert a world point to screen coordinates. */
function toScreenPoint(point: CanvasPoint, snapshot: CanvasSnapshot): CanvasPoint {
  const { zoom, offset } = snapshot.viewport;
  return [point[0] * zoom + offset[0], point[1] * zoom + offset[1]];
}

export { toScreenPoint };
