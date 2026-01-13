import { useEffect, useRef } from "react";
import type { CanvasSnapshot } from "../engine/types";
import type { GpuMessage, GpuPalette, GpuWorkerEvent } from "./webgpu/gpu-protocol";

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

type CanvasSurfaceProps = {
  /** Current snapshot for rendering. */
  snapshot: CanvasSnapshot;
  /** Hide background grid when rendering. */
  hideGrid?: boolean;
};

/** Render the canvas surface layer with WebGPU. */
export function CanvasSurface({ snapshot, hideGrid }: CanvasSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const frameRef = useRef(0);
  const pendingFrameRef = useRef<number | null>(null);
  const latestSnapshotRef = useRef(snapshot);
  const latestHideGridRef = useRef(hideGrid ?? false);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    latestHideGridRef.current = hideGrid ?? false;
  }, [hideGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const worker = buildWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<GpuWorkerEvent>) => {
      if (event.data.type === "ready") {
        readyRef.current = true;
        const palette = resolvePalette();
        const message: GpuMessage = {
          type: "snapshot",
          frameId: frameRef.current++,
          snapshot: latestSnapshotRef.current,
          palette,
          hideGrid: latestHideGridRef.current,
          renderNodes: RENDER_GPU_NODES,
        };
        worker.postMessage(message);
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
    if (!workerRef.current || !readyRef.current) return;
    if (pendingFrameRef.current !== null) return;
    pendingFrameRef.current = window.requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      const worker = workerRef.current;
      if (!worker) return;
      const palette = resolvePalette();
      const message: GpuMessage = {
        type: "snapshot",
        frameId: frameRef.current++,
        snapshot: latestSnapshotRef.current,
        palette,
        hideGrid: latestHideGridRef.current,
        renderNodes: RENDER_GPU_NODES,
      };
      worker.postMessage(message);
    });
  }, [snapshot, hideGrid]);

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
