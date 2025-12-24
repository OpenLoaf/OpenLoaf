"use client";

import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Node as RFNode, ReactFlowInstance } from "reactflow";

interface UseCanvasSelectionOptions {
  nodes: RFNode[];
  flowRef: RefObject<ReactFlowInstance | null>;
  setSuppressSingleNodeToolbar: Dispatch<SetStateAction<boolean>>;
}

interface UseCanvasSelectionResult {
  handleSelectionStart: () => void;
  handleSelectionEnd: () => void;
}

/** Build selection handlers for marquee selection behavior. */
export function useCanvasSelection({
  nodes,
  flowRef,
  setSuppressSingleNodeToolbar,
}: UseCanvasSelectionOptions): UseCanvasSelectionResult {
  /** Suppress toolbars while selection starts. */
  const handleSelectionStart = useCallback(() => {
    setSuppressSingleNodeToolbar(true);
  }, [setSuppressSingleNodeToolbar]);

  /** Restore toolbar visibility based on selection count. */
  const handleSelectionEnd = useCallback(() => {
    const currentNodes = flowRef.current?.getNodes() ?? nodes;
    const selectedCount = currentNodes.filter((node) => node.selected).length;
    // 逻辑：根据选中数量决定是否抑制单节点工具条
    setSuppressSingleNodeToolbar(selectedCount > 1);
  }, [flowRef, nodes, setSuppressSingleNodeToolbar]);

  return { handleSelectionEnd, handleSelectionStart };
}
