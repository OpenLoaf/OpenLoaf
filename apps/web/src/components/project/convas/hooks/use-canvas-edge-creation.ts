"use client";

import { useCallback } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { Edge, Node as RFNode } from "reactflow";
import { MarkerType } from "reactflow";
import type { CanvasMode } from "../CanvasProvider";
import { getAutoHandleIds, resolveNodeCenter } from "../utils/canvas-auto-handle";

interface UseCanvasEdgeCreationOptions {
  isLocked: boolean;
  mode: CanvasMode;
  nodes: RFNode[];
  pendingEdgeSource: string | null;
  setPendingEdgeSource: Dispatch<SetStateAction<string | null>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setSuppressSingleNodeToolbar: Dispatch<SetStateAction<boolean>>;
}

interface UseCanvasEdgeCreationResult {
  onNodeClick: (_: MouseEvent, node: RFNode) => void;
}

/** Build edge creation handlers for arrow modes. */
export function useCanvasEdgeCreation({
  isLocked,
  mode,
  nodes,
  pendingEdgeSource,
  setEdges,
  setPendingEdgeSource,
  setSuppressSingleNodeToolbar,
}: UseCanvasEdgeCreationOptions): UseCanvasEdgeCreationResult {
  /** Handle node clicks to create edges in arrow modes. */
  const onNodeClick = useCallback(
    (_: MouseEvent, node: RFNode) => {
      if (isLocked) return;
      setSuppressSingleNodeToolbar(false);
      // 逻辑：连线模式下，第一次点击记住起点，第二次点击生成连线
      if (mode === "arrow-straight" || mode === "arrow-curve") {
        if (!pendingEdgeSource) {
          setPendingEdgeSource(node.id);
          return;
        }
        if (pendingEdgeSource === node.id) return;
        // 逻辑：根据当前几何中心推算最近的锚点，确保后续移动可动态更新
        const sourceNode = nodes.find((item) => item.id === pendingEdgeSource);
        const targetNode = nodes.find((item) => item.id === node.id);
        const sourceCenter = sourceNode ? resolveNodeCenter(sourceNode) : null;
        const targetCenter = targetNode ? resolveNodeCenter(targetNode) : null;
        const handles =
          sourceCenter && targetCenter ? getAutoHandleIds(sourceCenter, targetCenter) : null;
        const id = `e-${pendingEdgeSource}-${node.id}-${Date.now()}`;
        setEdges((eds) =>
          eds.concat({
            id,
            source: pendingEdgeSource,
            target: node.id,
            sourceHandle: handles?.sourceHandle,
            targetHandle: handles?.targetHandle,
            type: mode === "arrow-curve" ? "smoothstep" : "straight",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 18,
              height: 18,
            },
            data: { autoHandle: true },
          }),
        );
        setPendingEdgeSource(null);
      }
    },
    [
      isLocked,
      mode,
      nodes,
      pendingEdgeSource,
      setEdges,
      setPendingEdgeSource,
      setSuppressSingleNodeToolbar,
    ],
  );

  return { onNodeClick };
}
