"use client";

import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { HandleIds } from "./node-size";

export interface HiddenHandlesProps {
  ids: HandleIds;
}

/**
 * Render all invisible handles so auto-connection can resolve source/target anchors.
 * This keeps node UI clean while enabling consistent edge attachment logic.
 */
const HiddenHandles = memo(function HiddenHandles({ ids }: HiddenHandlesProps) {
  return (
    <>
      {/* 连线锚点：用于自动生成的连线，不展示 UI */}
      <Handle
        id={ids.target.top}
        type="target"
        position={Position.Top}
        className="canvas-handle"
      />
      <Handle
        id={ids.target.right}
        type="target"
        position={Position.Right}
        className="canvas-handle"
      />
      <Handle
        id={ids.target.bottom}
        type="target"
        position={Position.Bottom}
        className="canvas-handle"
      />
      <Handle
        id={ids.target.left}
        type="target"
        position={Position.Left}
        className="canvas-handle"
      />
      <Handle
        id={ids.source.top}
        type="source"
        position={Position.Top}
        className="canvas-handle"
      />
      <Handle
        id={ids.source.right}
        type="source"
        position={Position.Right}
        className="canvas-handle"
      />
      <Handle
        id={ids.source.bottom}
        type="source"
        position={Position.Bottom}
        className="canvas-handle"
      />
      <Handle
        id={ids.source.left}
        type="source"
        position={Position.Left}
        className="canvas-handle"
      />
    </>
  );
});

export default HiddenHandles;
