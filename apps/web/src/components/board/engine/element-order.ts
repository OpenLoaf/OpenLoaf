/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { CanvasElement } from "./types";

/** Return elements sorted by zIndex with stable fallback. */
function sortElementsByZIndex(elements: CanvasElement[]): CanvasElement[] {
  // 按 zIndex 排序，后续渲染与命中均以此顺序为准。
  return elements.slice().sort((a, b) => {
    const az = a.zIndex ?? 0;
    const bz = b.zIndex ?? 0;
    if (az === bz) return 0;
    return az - bz;
  });
}

/** Compute the next zIndex based on current elements. */
function getNextZIndex(elements: CanvasElement[]): number {
  if (elements.length === 0) return 1;
  return Math.max(...elements.map(element => element.zIndex ?? 0)) + 1;
}

/** Compute the minimum zIndex among elements. */
function getMinZIndex(elements: CanvasElement[]): number {
  if (elements.length === 0) return 0;
  return Math.min(...elements.map(element => element.zIndex ?? 0));
}

export { sortElementsByZIndex, getNextZIndex, getMinZIndex };
