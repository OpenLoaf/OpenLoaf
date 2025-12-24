"use client";

import { useCallback, useEffect } from "react";
import type { RefObject } from "react";
import type { ReactFlowInstance } from "reactflow";

interface UseCanvasWheelZoomOptions {
  canvasRef: RefObject<HTMLDivElement | null>;
  flowRef: RefObject<ReactFlowInstance | null>;
  isCanvasActive: boolean;
}

/** Install middle-wheel zoom behavior on the canvas element. */
export function useCanvasWheelZoom({
  canvasRef,
  flowRef,
  isCanvasActive,
}: UseCanvasWheelZoomOptions) {
  /** Handle middle-wheel zoom on the canvas. */
  const handleCanvasWheel = useCallback(
    (event: WheelEvent) => {
      const inst = flowRef.current;
      if (!inst) return;
      const isMiddleWheel = (event.buttons & 4) === 4;
      if (!isMiddleWheel) return;
      const { x, y, zoom } = inst.getViewport();
      const delta = -event.deltaY * 0.002;
      const nextZoom = Math.min(4, Math.max(0.1, zoom + delta));
      // 逻辑：保持平移不变，仅调整缩放比例
      inst.setViewport({ x, y, zoom: nextZoom });
      event.preventDefault();
      event.stopPropagation();
    },
    [flowRef],
  );

  useEffect(() => {
    if (!isCanvasActive) return;
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleCanvasWheel);
    };
  }, [canvasRef, handleCanvasWheel, isCanvasActive]);
}
