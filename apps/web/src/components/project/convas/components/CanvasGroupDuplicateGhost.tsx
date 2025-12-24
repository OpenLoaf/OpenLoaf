"use client";

import { memo } from "react";
import { type ReactFlowState, useStore } from "reactflow";
import { shallow } from "zustand/shallow";
import { useCanvasState } from "../CanvasProvider";
import { resolveNodeSize } from "../nodes/GroupNode";

export interface CanvasGroupDuplicateGhostProps {
  groupId: string | null;
  pointer: { x: number; y: number } | null;
}

/** Render the ghost preview for group duplication. */
const CanvasGroupDuplicateGhost = memo(function CanvasGroupDuplicateGhost({
  groupId,
  pointer,
}: CanvasGroupDuplicateGhostProps) {
  const { nodes } = useCanvasState();
  const transform = useStore((state: ReactFlowState) => state.transform, shallow);
  if (!groupId || !pointer) return null;
  const groupNode = nodes.find((node) => node.id === groupId);
  if (!groupNode) return null;
  const size = resolveNodeSize(groupNode);
  if (!size) return null;

  const [offsetX, offsetY, zoom] = transform;
  const topLeft = {
    x: pointer.x - size.width / 2,
    y: pointer.y - size.height / 2,
  };
  // 逻辑：画布坐标 -> 屏幕坐标，渲染半透明预览
  const left = offsetX + topLeft.x * zoom;
  const top = offsetY + topLeft.y * zoom;
  const width = size.width * zoom;
  const height = size.height * zoom;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div
        className="absolute rounded-xl border border-dashed border-muted-foreground/60 bg-background/30"
        style={{ left, top, width, height }}
      />
    </div>
  );
});

export default CanvasGroupDuplicateGhost;
