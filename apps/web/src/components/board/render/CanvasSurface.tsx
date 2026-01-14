"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CanvasSnapshot, CanvasViewportState } from "../engine/types";
import type {
  GpuMessage,
  GpuPalette,
  GpuStateSnapshot,
  GpuWorkerEvent,
} from "./webgpu/gpu-protocol";

const PALETTE_LIGHT: GpuPalette = {
  grid: [148, 163, 184, 0.2],
  nodeFill: [255, 255, 255, 1],
  nodeStroke: [226, 232, 240, 1],
  nodeSelected: [56, 189, 248, 1],
  text: [15, 23, 42, 1],
  textMuted: [100, 116, 139, 1],
  connector: [71, 85, 105, 1],
  connectorSelected: [15, 23, 42, 1],
  connectorDraft: [100, 116, 139, 1],
  selectionFill: [37, 99, 235, 0.08],
  selectionStroke: [37, 99, 235, 0.6],
  guide: [37, 99, 235, 0.7],
};

const PALETTE_DARK: GpuPalette = {
  grid: [148, 163, 184, 0.12],
  nodeFill: [15, 23, 42, 1],
  nodeStroke: [51, 65, 85, 1],
  nodeSelected: [56, 189, 248, 1],
  text: [226, 232, 240, 1],
  textMuted: [148, 163, 184, 1],
  connector: [148, 163, 184, 1],
  connectorSelected: [226, 232, 240, 1],
  connectorDraft: [148, 163, 184, 1],
  selectionFill: [37, 99, 235, 0.12],
  selectionStroke: [96, 165, 250, 0.7],
  guide: [96, 165, 250, 0.7],
};

const PALETTE_KEYS: Array<keyof GpuPalette> = [
  "grid",
  "nodeFill",
  "nodeStroke",
  "nodeSelected",
  "text",
  "textMuted",
  "connector",
  "connectorSelected",
  "connectorDraft",
  "selectionFill",
  "selectionStroke",
  "guide",
];

// 逻辑：DOM 常驻时禁用 GPU 节点绘制，避免重复渲染。
const RENDER_GPU_NODES = false;

function resolvePalette(): GpuPalette {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const isDark = root.classList.contains("dark") || (!root.classList.contains("light") && prefersDark);
  return isDark ? PALETTE_DARK : PALETTE_LIGHT;
}

function buildWorker(): Worker {
  return new Worker(
    new URL("./webgpu/board-renderer.worker.ts", import.meta.url),
    { type: "module" }
  );
}

/** Build the GPU state payload from the latest snapshot. */
function buildState(snapshot: CanvasSnapshot): GpuStateSnapshot {
  return {
    selectedIds: snapshot.selectedIds,
    editingNodeId: snapshot.editingNodeId,
    connectorDraft: snapshot.connectorDraft,
    connectorStyle: snapshot.connectorStyle,
    pendingInsert: snapshot.pendingInsert,
    pendingInsertPoint: snapshot.pendingInsertPoint,
    selectionBox: snapshot.selectionBox,
    alignmentGuides: snapshot.alignmentGuides,
  };
}

/** Return true when two string arrays share the same values. */
function isStringArrayEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Return true when two GPU state snapshots are equivalent. */
function isStateEqual(a: GpuStateSnapshot | null, b: GpuStateSnapshot): boolean {
  if (!a) return false;
  return (
    isStringArrayEqual(a.selectedIds, b.selectedIds) &&
    a.editingNodeId === b.editingNodeId &&
    a.connectorDraft === b.connectorDraft &&
    a.connectorStyle === b.connectorStyle &&
    a.pendingInsert === b.pendingInsert &&
    a.pendingInsertPoint === b.pendingInsertPoint &&
    a.selectionBox === b.selectionBox &&
    a.alignmentGuides === b.alignmentGuides
  );
}

/** Return true when two viewport snapshots are equivalent. */
function isViewportEqual(
  a: CanvasViewportState | null,
  b: CanvasViewportState
): boolean {
  if (!a) return false;
  return (
    a.zoom === b.zoom &&
    a.offset[0] === b.offset[0] &&
    a.offset[1] === b.offset[1] &&
    a.size[0] === b.size[0] &&
    a.size[1] === b.size[1]
  );
}

/** Return true when two palettes share the same values. */
function isPaletteEqual(a: GpuPalette | null, b: GpuPalette): boolean {
  if (!a) return false;
  return PALETTE_KEYS.every((key) => {
    const left = a[key];
    const right = b[key];
    return (
      left[0] === right[0] &&
      left[1] === right[1] &&
      left[2] === right[2] &&
      left[3] === right[3]
    );
  });
}

type CanvasSurfaceProps = {
  /** Current snapshot for rendering. */
  snapshot: CanvasSnapshot;
  /** Hide background grid when rendering. */
  hideGrid?: boolean;
  /** Receive GPU stats from the renderer. */
  onStats?: (stats: { imageTextures: number }) => void;
};

/** Render the canvas surface layer with WebGPU. */
export function CanvasSurface({ snapshot, hideGrid, onStats }: CanvasSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const pendingFrameRef = useRef<number | null>(null);
  const latestSnapshotRef = useRef(snapshot);
  const latestHideGridRef = useRef(hideGrid ?? false);
  const lastDocRevisionRef = useRef<number | null>(null);
  const lastStateRef = useRef<GpuStateSnapshot | null>(null);
  const lastViewportRef = useRef<CanvasViewportState | null>(null);
  const lastPaletteRef = useRef<GpuPalette | null>(null);
  const lastHideGridRef = useRef<boolean | null>(null);
  /** Latest stats callback for worker events. */
  const onStatsRef = useRef(onStats);

  /** Schedule a coalesced GPU update frame. */
  const scheduleFrame = useCallback(() => {
    if (!workerRef.current || !readyRef.current) return;
    if (pendingFrameRef.current !== null) return;
    pendingFrameRef.current = window.requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      const worker = workerRef.current;
      if (!worker) return;
      const latestSnapshot = latestSnapshotRef.current;
      const palette = resolvePalette();
      const state = buildState(latestSnapshot);
      const docRevision = latestSnapshot.docRevision;
      const hideGridValue = latestHideGridRef.current;

      if (lastDocRevisionRef.current !== docRevision) {
        worker.postMessage({
          type: "scene",
          scene: {
            elements: latestSnapshot.elements,
            anchors: latestSnapshot.anchors,
          },
        } satisfies GpuMessage);
        lastDocRevisionRef.current = docRevision;
      }

      if (!isStateEqual(lastStateRef.current, state)) {
        worker.postMessage({ type: "state", state } satisfies GpuMessage);
        lastStateRef.current = state;
      }

      const viewChanged =
        !isViewportEqual(lastViewportRef.current, latestSnapshot.viewport) ||
        !isPaletteEqual(lastPaletteRef.current, palette) ||
        lastHideGridRef.current !== hideGridValue;

      if (viewChanged) {
        worker.postMessage({
          type: "view",
          viewport: latestSnapshot.viewport,
          palette,
          hideGrid: hideGridValue,
          renderNodes: RENDER_GPU_NODES,
        } satisfies GpuMessage);
        lastViewportRef.current = latestSnapshot.viewport;
        lastPaletteRef.current = palette;
        lastHideGridRef.current = hideGridValue;
      }
    });
  }, []);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    latestHideGridRef.current = hideGrid ?? false;
  }, [hideGrid]);

  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const worker = buildWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<GpuWorkerEvent>) => {
      if (event.data.type === "ready") {
        readyRef.current = true;
        lastDocRevisionRef.current = null;
        lastStateRef.current = null;
        lastViewportRef.current = null;
        lastPaletteRef.current = null;
        lastHideGridRef.current = null;
        scheduleFrame();
        return;
      }
      if (event.data.type === "stats") {
        onStatsRef.current?.(event.data);
        return;
      }
      if (event.data.type === "error") {
        console.error("[board] webgpu worker error", event.data.message);
      }
    };

    const offscreen = canvas.transferControlToOffscreen();
    const dpr = window.devicePixelRatio || 1;
    const size: [number, number] = [
      Math.max(1, Math.floor(latestSnapshotRef.current.viewport.size[0])),
      Math.max(1, Math.floor(latestSnapshotRef.current.viewport.size[1])),
    ];

    const initMessage: GpuMessage = {
      type: "init",
      canvas: offscreen,
      size,
      dpr,
    };
    worker.postMessage(initMessage, [offscreen]);

    return () => {
      readyRef.current = false;
      worker.postMessage({ type: "dispose", reason: "unmount" } satisfies GpuMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const worker = workerRef.current;
    if (!canvas || !worker) return;
    const dpr = window.devicePixelRatio || 1;
    const size: [number, number] = [
      Math.max(1, Math.floor(snapshot.viewport.size[0])),
      Math.max(1, Math.floor(snapshot.viewport.size[1])),
    ];
    canvas.style.width = `${size[0]}px`;
    canvas.style.height = `${size[1]}px`;

    const resizeMessage: GpuMessage = {
      type: "resize",
      size,
      dpr,
    };
    worker.postMessage(resizeMessage);
  }, [snapshot.viewport.size[0], snapshot.viewport.size[1]]);

  useEffect(() => {
    scheduleFrame();
  }, [hideGrid, scheduleFrame, snapshot]);

  useEffect(() => {
    return () => {
      if (pendingFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
    />
  );
}
