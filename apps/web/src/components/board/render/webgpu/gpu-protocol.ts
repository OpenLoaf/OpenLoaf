/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type {
  CanvasAlignmentGuide,
  CanvasElement,
  CanvasInsertRequest,
  CanvasPoint,
  CanvasSelectionBox,
  CanvasViewportState,
} from "../../engine/types";

export type GpuPalette = {
  nodeFill: [number, number, number, number];
  nodeStroke: [number, number, number, number];
  nodeSelected: [number, number, number, number];
  text: [number, number, number, number];
  textMuted: [number, number, number, number];
  selectionFill: [number, number, number, number];
  selectionStroke: [number, number, number, number];
  guide: [number, number, number, number];
};

export type GpuInitMessage = {
  type: "init";
  canvas: OffscreenCanvas;
  size: [number, number];
  dpr: number;
};

export type GpuResizeMessage = {
  type: "resize";
  size: [number, number];
  dpr: number;
};

export type GpuSceneSnapshot = {
  /** Renderable elements for GPU drawing. */
  elements: CanvasElement[];
};

export type GpuStateSnapshot = {
  /** Selected element ids for highlighting. */
  selectedIds: string[];
  /** Node id currently in edit mode. */
  editingNodeId: string | null;
  /** Pending insert request for ghost preview. */
  pendingInsert: CanvasInsertRequest | null;
  /** Pending insert cursor point in world space. */
  pendingInsertPoint: CanvasPoint | null;
  /** Selection box for rectangle selection. */
  selectionBox: CanvasSelectionBox | null;
  /** Alignment guides for snapping feedback. */
  alignmentGuides: CanvasAlignmentGuide[];
};

export type GpuSceneMessage = {
  type: "scene";
  scene: GpuSceneSnapshot;
};

export type GpuStateMessage = {
  type: "state";
  state: GpuStateSnapshot;
};

export type GpuViewMessage = {
  type: "view";
  viewport: CanvasViewportState;
  palette: GpuPalette;
  renderNodes?: boolean;
};

export type GpuDisposeMessage = {
  type: "dispose";
  reason?: string;
};

export type GpuMessage =
  | GpuInitMessage
  | GpuResizeMessage
  | GpuSceneMessage
  | GpuStateMessage
  | GpuViewMessage
  | GpuDisposeMessage;

export type GpuWorkerEvent =
  | { type: "ready" }
  | { type: "stats"; imageTextures: number }
  | { type: "error"; message: string };
