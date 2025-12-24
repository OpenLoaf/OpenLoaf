"use client";

import { memo } from "react";
import { type ReactFlowState, useStore } from "reactflow";
import { shallow } from "zustand/shallow";

interface CanvasAlignmentGuidesProps {
  guides: { x: number[]; y: number[] };
}

/** Render alignment guides in the flow viewport. */
const CanvasAlignmentGuides = memo(function CanvasAlignmentGuides({
  guides,
}: CanvasAlignmentGuidesProps) {
  const { transform, width, height } = useStore(
    (state: ReactFlowState) => ({
      transform: state.transform,
      width: state.width,
      height: state.height,
    }),
    shallow,
  );

  if (guides.x.length === 0 && guides.y.length === 0) {
    return null;
  }

  const [offsetX, offsetY, zoom] = transform;
  const lineThickness = 0.5;

  // 逻辑：将画布坐标换算到视口坐标后绘制对齐线
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {guides.x.map((guideX) => (
        <div
          key={`guide-x-${guideX}`}
          className="absolute top-0"
          style={{
            left: offsetX + guideX * zoom,
            width: lineThickness,
            height,
            backgroundColor: "var(--canvas-guide)",
          }}
        />
      ))}
      {guides.y.map((guideY) => (
        <div
          key={`guide-y-${guideY}`}
          className="absolute left-0"
          style={{
            top: offsetY + guideY * zoom,
            height: lineThickness,
            width,
            backgroundColor: "var(--canvas-guide)",
          }}
        />
      ))}
    </div>
  );
});

export default CanvasAlignmentGuides;
