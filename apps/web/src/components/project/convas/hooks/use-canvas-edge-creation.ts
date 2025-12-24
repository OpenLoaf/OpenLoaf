"use client";

import { useCallback } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { Edge, Node as RFNode } from "reactflow";
import { MarkerType } from "reactflow";
import type { CanvasMode } from "../CanvasProvider";

interface UseCanvasEdgeCreationOptions {
  isLocked: boolean;
  mode: CanvasMode;
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
        const id = `e-${pendingEdgeSource}-${node.id}-${Date.now()}`;
        setEdges((eds) =>
          eds.concat({
            id,
            source: pendingEdgeSource,
            target: node.id,
            type: mode === "arrow-curve" ? "smoothstep" : "straight",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 18,
              height: 18,
            },
          }),
        );
        setPendingEdgeSource(null);
      }
    },
    [
      isLocked,
      mode,
      pendingEdgeSource,
      setEdges,
      setPendingEdgeSource,
      setSuppressSingleNodeToolbar,
    ],
  );

  return { onNodeClick };
}
