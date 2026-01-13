import type { CanvasSnapshot } from "../../engine/types";

export type GpuPalette = {
  grid: [number, number, number, number];
  nodeFill: [number, number, number, number];
  nodeStroke: [number, number, number, number];
  nodeSelected: [number, number, number, number];
  text: [number, number, number, number];
  textMuted: [number, number, number, number];
  connector: [number, number, number, number];
  connectorSelected: [number, number, number, number];
  connectorDraft: [number, number, number, number];
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

export type GpuSnapshotMessage = {
  type: "snapshot";
  frameId: number;
  snapshot: CanvasSnapshot;
  palette: GpuPalette;
  hideGrid?: boolean;
  renderNodes?: boolean;
};

export type GpuDisposeMessage = {
  type: "dispose";
  reason?: string;
};

export type GpuMessage =
  | GpuInitMessage
  | GpuResizeMessage
  | GpuSnapshotMessage
  | GpuDisposeMessage;

export type GpuWorkerEvent =
  | { type: "ready" }
  | { type: "error"; message: string };
