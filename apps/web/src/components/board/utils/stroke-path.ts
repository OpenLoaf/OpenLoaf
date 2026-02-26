/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { getStroke, type StrokeOptions } from "perfect-freehand";
import type { CanvasPoint, CanvasStrokePoint, CanvasStrokeTool } from "../engine/types";

type StrokePathOptions = {
  /** Stroke size in pixels. */
  size: number;
  /** Stroke tool type. */
  tool: CanvasStrokeTool;
};

const BASE_STROKE_OPTIONS: StrokeOptions = {
  smoothing: 0.7,
  streamline: 0.2,
  simulatePressure: true,
};

const PEN_STROKE_OPTIONS: StrokeOptions = {
  ...BASE_STROKE_OPTIONS,
  thinning: 0.6,
  start: { cap: true, taper: 0 },
  end: { cap: true, taper: 0 },
};

const HIGHLIGHTER_STROKE_OPTIONS: StrokeOptions = {
  ...BASE_STROKE_OPTIONS,
  thinning: 0,
  start: { cap: true, taper: 0 },
  end: { cap: true, taper: 0 },
};

/** Build stroke outline points in screen space. */
export function buildStrokeOutline(
  points: CanvasStrokePoint[],
  options: StrokePathOptions
): CanvasPoint[] {
  if (points.length === 0) return [];
  const strokeOptions =
    options.tool === "highlighter" ? HIGHLIGHTER_STROKE_OPTIONS : PEN_STROKE_OPTIONS;
  const strokePoints = points.map(([x, y, pressure]) =>
    pressure === undefined ? { x, y } : { x, y, pressure }
  );
  // 逻辑：将画笔点转换为库可识别的格式，避免可选压力值引发类型错误。
  const outline = getStroke(strokePoints, {
    ...strokeOptions,
    size: options.size,
    last: true,
  }) as CanvasPoint[];
  return outline;
}

/** Compute stroke bounds in world coordinates. */
export function computeStrokeBounds(
  points: CanvasStrokePoint[],
  size: number
): [number, number, number, number] {
  if (points.length === 0) {
    return [0, 0, 0, 0];
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxPressure = 1;

  points.forEach(point => {
    const [x, y, pressure] = point;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    if (pressure !== undefined) {
      maxPressure = Math.max(maxPressure, pressure);
    }
  });

  // 逻辑：用最大压力换算半径，确保包围盒覆盖粗细变化。
  const radius = (size * maxPressure) / 2;
  const left = minX - radius;
  const top = minY - radius;
  const width = maxX - minX + radius * 2;
  const height = maxY - minY + radius * 2;
  return [left, top, width, height];
}
