/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { CanvasPoint, CanvasViewportState } from "../engine/types";

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
