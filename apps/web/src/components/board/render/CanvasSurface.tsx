import { useEffect, useRef } from "react";
import { CanvasRenderer } from "./CanvasRenderer";
import type { CanvasSnapshot } from "../engine/types";

type CanvasSurfaceProps = {
  /** Current snapshot for rendering. */
  snapshot: CanvasSnapshot;
};

/** Render the canvas surface layer. */
export function CanvasSurface({ snapshot }: CanvasSurfaceProps) {
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
    rendererRef.current?.render(snapshot);
  }, [snapshot]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
    />
  );
}
