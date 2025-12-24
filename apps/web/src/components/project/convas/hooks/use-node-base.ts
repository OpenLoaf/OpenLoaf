"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node as RFNode, ReactFlowState } from "reactflow";
import { Position, useStore } from "reactflow";
import { shallow } from "zustand/shallow";

interface UseNodeBaseOptions {
  selected: boolean;
  nodes: RFNode[];
  suppressSingleNodeToolbar: boolean;
  xPos: number;
  yPos: number;
}

interface UseNodeBaseResult {
  selectedNodesCount: number;
  isSingleSelection: boolean;
  isToolbarVisible: boolean;
  showToolbar: boolean;
  setShowToolbar: (value: boolean) => void;
  handleShowToolbar: () => void;
  toolbarPosition: Position;
  toolbarPanelPosition: "above" | "below";
}

/** Build shared selection/toolbar state for canvas nodes. */
export function useNodeBase({
  selected,
  nodes,
  suppressSingleNodeToolbar,
  xPos,
  yPos,
}: UseNodeBaseOptions): UseNodeBaseResult {
  const selectedNodesCount = useMemo(
    () => nodes.filter((node) => node.selected).length,
    [nodes],
  );
  const isSingleSelection =
    selected && selectedNodesCount === 1 && !suppressSingleNodeToolbar;
  const { height: canvasHeight, transform } = useStore(
    (state: ReactFlowState) => ({
      height: state.height,
      transform: state.transform,
    }),
    shallow,
  );
  const [showToolbar, setShowToolbar] = useState(false);
  const prevIsSingleSelectionRef = useRef(isSingleSelection);
  const toolbarPosition = useMemo(() => {
    if (!canvasHeight) return Position.Top;
    const [, offsetY, zoom] = transform;
    const nodeTop = offsetY + yPos * zoom;
    return nodeTop <= canvasHeight * 0.2 ? Position.Bottom : Position.Top;
  }, [canvasHeight, transform, yPos]);
  const toolbarPanelPosition = useMemo(
    () => (toolbarPosition === Position.Top ? "above" : "below"),
    [toolbarPosition],
  );

  /** Show the toolbar after explicit click on the node. */
  const handleShowToolbar = useCallback(() => {
    setShowToolbar(true);
  }, []);

  useEffect(() => {
    if (prevIsSingleSelectionRef.current && !isSingleSelection && showToolbar) {
      // 逻辑：失去单选状态时关闭工具栏
      setShowToolbar(false);
    }
    prevIsSingleSelectionRef.current = isSingleSelection;
  }, [isSingleSelection, showToolbar]);

  return {
    selectedNodesCount,
    isSingleSelection,
    isToolbarVisible: isSingleSelection && showToolbar,
    showToolbar,
    setShowToolbar,
    handleShowToolbar,
    toolbarPosition,
    toolbarPanelPosition,
  };
}
