"use client";

import "@reactflow/node-resizer/dist/style.css";
import { memo } from "react";
import { NodeResizer } from "@reactflow/node-resizer";
import type { NodeProps } from "reactflow";

export interface ImageNodeData {
  src: string;
  alt?: string;
}

/** Render a resizable image node. */
const ImageNode = memo(function ImageNode({ data, selected }: NodeProps<ImageNodeData>) {
  // 选中时显示可拖拽的调整尺寸控制点
  return (
    <div className="h-full w-full overflow-hidden rounded-md border-0">
      <NodeResizer
        isVisible={selected}
        minWidth={80}
        minHeight={60}
        lineClassName="opacity-0"
        lineStyle={{ borderWidth: 0 }}
        handleClassName="border border-muted-foreground/70 bg-background"
      />
      <img
        src={data.src}
        alt={data.alt ?? "图片"}
        className="block h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
});

export default ImageNode;
