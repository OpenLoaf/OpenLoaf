"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node as RFNode } from "reactflow";

interface UseNodeBaseOptions {
  selected: boolean;
  nodes: RFNode[];
  suppressSingleNodeToolbar: boolean;
}

interface UseNodeBaseResult {
  selectedNodesCount: number;
  isSingleSelection: boolean;
  isToolbarVisible: boolean;
  showToolbar: boolean;
  setShowToolbar: (value: boolean) => void;
  handleShowToolbar: () => void;
}

/** Build shared selection/toolbar state for canvas nodes. */
export function useNodeBase({
  selected,
  nodes,
  suppressSingleNodeToolbar,
}: UseNodeBaseOptions): UseNodeBaseResult {
  const selectedNodesCount = useMemo(
    () => nodes.filter((node) => node.selected).length,
    [nodes],
  );
  const isSingleSelection =
    selected && selectedNodesCount === 1 && !suppressSingleNodeToolbar;
  const [showToolbar, setShowToolbar] = useState(false);
  const prevIsSingleSelectionRef = useRef(isSingleSelection);

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
  };
}
