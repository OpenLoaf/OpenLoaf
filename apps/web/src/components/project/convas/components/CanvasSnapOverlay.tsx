"use client";

import { memo } from "react";
import { shallow } from "zustand/shallow";
import { type ReactFlowState, useStore } from "reactflow";
import type { SnapLine } from "../utils/canvas-snap";

interface CanvasSnapOverlayProps {
  lines: SnapLine[];
}

const SNAP_LINE_THICKNESS = 1;

/** Render snapping guide lines in screen space. */
const CanvasSnapOverlay = memo(function CanvasSnapOverlay({ lines }: CanvasSnapOverlayProps) {
  const transform = useStore((state: ReactFlowState) => state.transform, shallow);
  if (lines.length === 0) return null;
  const [offsetX, offsetY, zoom] = transform;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {lines.map((line, index) => {
        const x1 = offsetX + line.x1 * zoom;
        const y1 = offsetY + line.y1 * zoom;
        const x2 = offsetX + line.x2 * zoom;
        const y2 = offsetY + line.y2 * zoom;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        const isVertical = width < height;
        const style = {
          left,
          top,
          width: isVertical ? SNAP_LINE_THICKNESS : Math.max(1, width),
          height: isVertical ? Math.max(1, height) : SNAP_LINE_THICKNESS,
          backgroundColor: "var(--canvas-guide)",
        };
        return <div key={`snap-line-${index}`} className="absolute" style={style} />;
      })}
    </div>
  );
});

export default CanvasSnapOverlay;
