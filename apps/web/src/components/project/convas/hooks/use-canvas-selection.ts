"use client";

import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Node as RFNode, ReactFlowInstance } from "reactflow";
import { buildNodeMap, getNodeParentId } from "../utils/group-node";

interface UseCanvasSelectionOptions {
  nodes: RFNode[];
  flowRef: RefObject<ReactFlowInstance | null>;
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  setIsSelecting: Dispatch<SetStateAction<boolean>>;
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
  setNodes,
  setIsSelecting,
  setSuppressSingleNodeToolbar,
}: UseCanvasSelectionOptions): UseCanvasSelectionResult {
  /** Check whether a node is inside any selected group. */
  const isDescendantOfSelectedGroup = useCallback(
    (node: RFNode, nodeMap: Map<string, RFNode>, selectedGroups: Set<string>) => {
      let parentId = getNodeParentId(node);
      // 逻辑：沿父链向上查找，只要命中选中 group 即视为后代
      while (parentId) {
        if (selectedGroups.has(parentId)) return true;
        const parent = nodeMap.get(parentId);
        if (!parent) break;
        parentId = getNodeParentId(parent);
      }
      return false;
    },
    [],
  );

  /** Suppress toolbars while selection starts. */
  const handleSelectionStart = useCallback(() => {
    setIsSelecting(true);
    setSuppressSingleNodeToolbar(true);
  }, [setIsSelecting, setSuppressSingleNodeToolbar]);

  /** Restore toolbar visibility based on selection count. */
  const handleSelectionEnd = useCallback(() => {
    setIsSelecting(false);
    const currentNodes = flowRef.current?.getNodes() ?? nodes;
    const selectedGroups = new Set(
      currentNodes.filter((node) => node.selected && node.type === "group").map((node) => node.id),
    );
    const nodeMap = selectedGroups.size > 0 ? buildNodeMap(currentNodes) : null;
    if (selectedGroups.size > 0 && nodeMap) {
      // 逻辑：选中 group 时，移除其后代节点的选中状态
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (!node.selected) return node;
          if (!isDescendantOfSelectedGroup(node, nodeMap, selectedGroups)) return node;
          return { ...node, selected: false };
        }),
      );
    }
    const selectedCount = nodeMap
      ? currentNodes.filter(
          (node) => node.selected && !isDescendantOfSelectedGroup(node, nodeMap, selectedGroups),
        ).length
      : currentNodes.filter((node) => node.selected).length;
    // 逻辑：根据选中数量决定是否抑制单节点工具条
    setSuppressSingleNodeToolbar(selectedCount > 1);
  }, [
    flowRef,
    isDescendantOfSelectedGroup,
    nodes,
    setIsSelecting,
    setNodes,
    setSuppressSingleNodeToolbar,
  ]);

  return { handleSelectionEnd, handleSelectionStart };
}
