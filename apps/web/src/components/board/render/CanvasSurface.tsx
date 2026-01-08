import { useEffect, useRef } from "react";
import { CanvasRenderer } from "./CanvasRenderer";
import type { CanvasSnapshot } from "../engine/types";

type CanvasSurfaceProps = {
  /** Current snapshot for rendering. */
  snapshot: CanvasSnapshot;
  /** Hide background grid when rendering. */
  hideGrid?: boolean;
};

/** Render the canvas surface layer. */
export function CanvasSurface({ snapshot, hideGrid }: CanvasSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    rendererRef.current = new CanvasRenderer(canvasRef.current);
    return () => {
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.render(snapshot, { hideGrid });
  }, [snapshot, hideGrid]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
    />
  );
}
