import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { CanvasEngine } from "../../engine/CanvasEngine";

type UseAutoResizeNodeOptions = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Target node element id. */
  elementId: string;
  /** Minimum height in canvas units. */
  minHeight?: number;
  /** Whether auto resize is enabled. */
  enabled?: boolean;
};

type UseAutoResizeNodeResult = {
  /** Ref for the node root container. */
  containerRef: RefObject<HTMLDivElement>;
  /** Force a resize measurement. */
  requestResize: () => void;
};

/** Auto resize a node by its rendered content height. */
export function useAutoResizeNode({
  engine,
  elementId,
  minHeight = 0,
  enabled = true,
}: UseAutoResizeNodeOptions): UseAutoResizeNodeResult {
  /** Container ref used for measuring content height. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Animation frame id for resize scheduling. */
  const frameRef = useRef<number | null>(null);
  /** Resize observer for container changes. */
  const observerRef = useRef<ResizeObserver | null>(null);

  /** Request a resize measurement. */
  const requestResize = useCallback(() => {
    if (!enabled) return;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      const node = engine.doc.getElementById(elementId);
      if (!node || node.kind !== "node") return;
      // 逻辑：用容器内容高度驱动节点高度，避免内容被裁切。
      const measuredHeight = Math.max(container.offsetHeight, minHeight);
      const [x, y, width, height] = node.xywh;
      if (Math.abs(height - measuredHeight) < 1) return;
      engine.doc.updateElement(node.id, {
        xywh: [x, y, width, measuredHeight],
      });
    });
  }, [elementId, enabled, engine, minHeight]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      requestResize();
      return;
    }
    const observer = new ResizeObserver(() => requestResize());
    observer.observe(container);
    observerRef.current = observer;
    requestResize();
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [enabled, requestResize]);

  useEffect(() => {
    return () => {
      if (frameRef.current === null) return;
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  return { containerRef, requestResize };
}
