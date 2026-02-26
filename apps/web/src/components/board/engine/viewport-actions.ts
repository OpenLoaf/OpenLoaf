/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { CanvasPoint, CanvasRect } from "./types";
import { DEFAULT_FIT_PADDING, MIN_ZOOM } from "./constants";
import type { CanvasDoc } from "./CanvasDoc";
import type { ViewportController } from "./ViewportController";

type WheelGuardOptions = {
  /** DOM selectors that should ignore wheel events. */
  ignoreSelectors: string[];
  /** Custom pan handler used for soft limits. */
  onPan?: (dx: number, dy: number) => void;
};

/** Compute the viewport center in world coordinates. */
function getViewportCenterWorld(viewport: ViewportController): CanvasPoint {
  const { size } = viewport.getState();
  return viewport.toWorld([size[0] / 2, size[1] / 2]);
}

/** Fit the viewport to include all node elements. */
function fitToElements(
  doc: CanvasDoc,
  viewport: ViewportController,
  padding = DEFAULT_FIT_PADDING
): void {
  const elements = doc
    .getElements()
    .filter(element => element.kind === "node");
  if (elements.length === 0) {
    // 逻辑：无元素时回到默认视口。
    viewport.setViewport(1, [0, 0]);
    return;
  }

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

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const { size } = viewport.getState();
  if (size[0] <= 0 || size[1] <= 0) return;
  const targetWidth = width + padding * 2;
  const targetHeight = height + padding * 2;

  const scaleX = size[0] / targetWidth;
  const scaleY = size[1] / targetHeight;
  const limits = viewport.getZoomLimits();
  const nextZoom = clampZoom(Math.min(scaleX, scaleY), limits.min, limits.max);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;
  const offset: CanvasPoint = [
    size[0] / 2 - centerX * nextZoom,
    size[1] / 2 - centerY * nextZoom,
  ];

  viewport.setViewport(nextZoom, offset);
}

/** Compute the viewport zoom/offset to fit a target rectangle. */
function computeViewportForRect(
  viewport: ViewportController,
  rect: CanvasRect,
  padding = DEFAULT_FIT_PADDING
): { zoom: number; offset: CanvasPoint } | null {
  const { size } = viewport.getState();
  if (size[0] <= 0 || size[1] <= 0) return null;
  if (rect.w <= 0 || rect.h <= 0) return null;

  const targetWidth = Math.max(1, rect.w + padding * 2);
  const targetHeight = Math.max(1, rect.h + padding * 2);
  const scaleX = size[0] / targetWidth;
  const scaleY = size[1] / targetHeight;
  const limits = viewport.getZoomLimits();
  const nextZoom = clampZoom(Math.min(scaleX, scaleY), limits.min, limits.max);
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const offset: CanvasPoint = [
    size[0] / 2 - centerX * nextZoom,
    size[1] / 2 - centerY * nextZoom,
  ];
  return { zoom: nextZoom, offset };
}

/** Handle wheel events for zooming and panning. */
function handleWheel(
  event: WheelEvent,
  container: HTMLElement,
  viewport: ViewportController,
  options: WheelGuardOptions
): void {
  const target = event.target as HTMLElement | null;
  if (target) {
    const shouldIgnore = options.ignoreSelectors.some(selector =>
      target.closest(selector)
    );
    if (shouldIgnore) return;
  }
  event.preventDefault();

  const rect = container.getBoundingClientRect();
  const anchor: CanvasPoint = [
    event.clientX - rect.left,
    event.clientY - rect.top,
  ];

  if (event.ctrlKey || event.metaKey) {
    // 逻辑：按住 Ctrl/Meta 时缩放视图，以指针位置为锚点。
    const { zoom } = viewport.getState();
    const speed = 0.0065;
    const nextZoom = zoom * Math.exp(-event.deltaY * speed);
    viewport.setZoom(nextZoom, anchor);
    return;
  }

  // 逻辑：普通滚轮用于平移视口。
  const pan = options.onPan ?? ((dx, dy) => viewport.panBy(dx, dy));
  pan(-event.deltaX, -event.deltaY);
}

/** Clamp a zoom value into the allowed range. */
function clampZoom(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Compute hit radius based on zoom. */
function scaleByZoom(value: number, zoom: number): number {
  return value / Math.max(zoom, MIN_ZOOM);
}

export {
  getViewportCenterWorld,
  fitToElements,
  computeViewportForRect,
  handleWheel,
  clampZoom,
  scaleByZoom,
};
