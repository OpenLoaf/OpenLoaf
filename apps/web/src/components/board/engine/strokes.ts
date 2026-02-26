/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { STROKE_NODE_TYPE } from "./types";
import type {
  CanvasNodeElement,
  CanvasPoint,
  CanvasStrokePoint,
  CanvasStrokeSettings,
  CanvasStrokeTool,
  StrokeNodeProps,
} from "./types";
import { computeStrokeBounds } from "../utils/stroke-path";
import { distanceToPolyline } from "../utils/connector-path";
import { MIN_ZOOM } from "./constants";
import type { CanvasDoc } from "./CanvasDoc";
import type { ViewportController } from "./ViewportController";

type StrokeSettingsState = {
  /** Pen tool settings. */
  penSettings: CanvasStrokeSettings;
  /** Highlighter tool settings. */
  highlighterSettings: CanvasStrokeSettings;
};

/** 将世界坐标点转换为节点局部坐标点。 */
function toLocalPoints(
  points: CanvasStrokePoint[],
  offsetX: number,
  offsetY: number
): CanvasStrokePoint[] {
  return points.map(([px, py, pressure]) => [px - offsetX, py - offsetY, pressure]);
}

/** Return the current pen settings. */
function getPenSettings(state: StrokeSettingsState): CanvasStrokeSettings {
  return { ...state.penSettings };
}

/** Update the pen settings. */
function setPenSettings(state: StrokeSettingsState, settings: Partial<CanvasStrokeSettings>): void {
  state.penSettings = { ...state.penSettings, ...settings };
}

/** Return the current highlighter settings. */
function getHighlighterSettings(state: StrokeSettingsState): CanvasStrokeSettings {
  return { ...state.highlighterSettings };
}

/** Update the highlighter settings. */
function setHighlighterSettings(
  state: StrokeSettingsState,
  settings: Partial<CanvasStrokeSettings>
): void {
  state.highlighterSettings = { ...state.highlighterSettings, ...settings };
}

/** Resolve stroke settings for the requested tool. */
function getStrokeSettings(state: StrokeSettingsState, tool: CanvasStrokeTool): CanvasStrokeSettings {
  return tool === "highlighter" ? getHighlighterSettings(state) : getPenSettings(state);
}

/** Add a new stroke node to the document. */
function addStrokeElement(
  doc: CanvasDoc,
  generateId: (prefix: string) => string,
  tool: CanvasStrokeTool,
  settings: CanvasStrokeSettings,
  point: CanvasStrokePoint
): string {
  const id = generateId(tool);
  const points = [point];
  const xywh = computeStrokeBounds(points, settings.size);
  const [x, y] = xywh;
  // 逻辑：将点转换为节点局部坐标，拖拽时只移动容器。
  const localPoints = toLocalPoints(points, x, y);
  doc.addElement({
    id,
    kind: "node",
    type: STROKE_NODE_TYPE,
    xywh,
    zIndex: 1,
    meta: {
      createdAt: Date.now(),
    },
    props: {
      tool,
      points: localPoints,
      color: settings.color,
      size: settings.size,
      opacity: settings.opacity,
    } satisfies StrokeNodeProps,
  } satisfies CanvasNodeElement<StrokeNodeProps>);
  return id;
}

/** Update an existing stroke node. */
function updateStrokeElement(
  doc: CanvasDoc,
  id: string,
  points: CanvasStrokePoint[],
  tool: CanvasStrokeTool,
  settings: CanvasStrokeSettings
): void {
  const xywh = computeStrokeBounds(points, settings.size);
  const [x, y] = xywh;
  const localPoints = toLocalPoints(points, x, y);
  doc.updateElement(id, {
    xywh,
    props: {
      tool,
      points: localPoints,
      color: settings.color,
      size: settings.size,
      opacity: settings.opacity,
    },
  });
}

/** Erase stroke nodes near a world point. */
function eraseStrokesAt(
  doc: CanvasDoc,
  viewport: ViewportController,
  point: CanvasPoint,
  radius: number
): string[] {
  const strokes = doc
    .getElements()
    .filter(
      (element): element is CanvasNodeElement<StrokeNodeProps> =>
        element.kind === "node" && element.type === STROKE_NODE_TYPE
    );
  if (strokes.length === 0) return [];
  const { zoom } = viewport.getState();
  const hitRadius = radius / Math.max(zoom, MIN_ZOOM);
  const removed: string[] = [];

  strokes.forEach(stroke => {
    if (stroke.locked) return;
    const { points, size } = stroke.props;
    if (points.length === 0) return;
    const padding = Math.max(size / 2, hitRadius);
    const [x, y, w, h] = stroke.xywh;
    if (
      point[0] < x - padding ||
      point[0] > x + w + padding ||
      point[1] < y - padding ||
      point[1] > y + h + padding
    ) {
      return;
    }
    if (points.length === 1) {
      const [px, py] = points[0];
      const distance = Math.hypot(point[0] - (px + x), point[1] - (py + y));
      if (distance <= padding) {
        removed.push(stroke.id);
      }
      return;
    }
    const distance = distanceToPolyline(
      point,
      points.map(pt => [pt[0] + x, pt[1] + y])
    );
    if (distance <= padding) {
      removed.push(stroke.id);
    }
  });

  if (removed.length > 0) {
    // 逻辑：擦除笔迹时只删除命中的 stroke 节点。
    doc.deleteElements(removed);
  }
  return removed;
}

export {
  addStrokeElement,
  updateStrokeElement,
  eraseStrokesAt,
  getPenSettings,
  setPenSettings,
  getHighlighterSettings,
  setHighlighterSettings,
  getStrokeSettings,
};
export type { StrokeSettingsState };
