"use client";

import { useCallback, useMemo, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  applyNodeChanges,
  type Edge,
  type Node as RFNode,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import { adjustGroupBounds, resolveNodeSize } from "../nodes/GroupNode";
import { createAlignmentGridIndex } from "../utils/canvas-alignment-grid";
import { getAlignmentForNode } from "../utils/canvas-alignment";
import { updateAutoHandleEdges } from "../utils/canvas-auto-handle";
import {
  ALIGNMENT_GRID_CELL_PX,
  ALIGNMENT_SCAN_RANGE_PX,
  ALIGNMENT_THRESHOLD_PX,
} from "../utils/canvas-constants";

type AlignmentGuidesState = {
  x: number[];
  y: number[];
};

interface UseCanvasAlignmentOptions {
  isLocked: boolean;
  nodes: RFNode[];
  flowRef: RefObject<ReactFlowInstance | null>;
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
}

interface UseCanvasAlignmentResult {
  alignmentGuides: AlignmentGuidesState;
  handleNodesChange: (changes: NodeChange[]) => void;
  clearAlignmentGuides: () => void;
}

/** Build alignment guide and snapping logic for node changes. */
export function useCanvasAlignment({
  isLocked,
  nodes,
  flowRef,
  setNodes,
  setEdges,
}: UseCanvasAlignmentOptions): UseCanvasAlignmentResult {
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuidesState>({
    x: [],
    y: [],
  });
  const alignmentGrid = useMemo(
    () => createAlignmentGridIndex(nodes, ALIGNMENT_GRID_CELL_PX),
    [nodes],
  );

  /** Reset alignment guides. */
  const clearAlignmentGuides = useCallback(() => {
    setAlignmentGuides({ x: [], y: [] });
  }, []);

  /** Apply node changes with alignment guides and snapping. */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));
      let nextGuides: AlignmentGuidesState = { x: [], y: [] };
      const draggingIndex = changes.findIndex(
        (change) => change.type === "position" && change.dragging,
      );
      const draggingIds = new Set(
        changes
          .filter((change) => change.type === "position" && change.dragging)
          .map((change) => change.id),
      );
      let alignedChanges = changes;

      // 逻辑：多选或 group 拖动时关闭对齐线，避免多节点同步对齐造成卡顿
      if (!isLocked && draggingIndex >= 0 && draggingIds.size === 1) {
        const draggingChange = changes[draggingIndex];
        const node = nodeMap.get(draggingChange.id);
        const dragPosition = draggingChange.position ?? node?.position;
        if (node && dragPosition && node.type !== "group") {
          const dragSize = resolveNodeSize(node);
          if (dragSize) {
            const viewport = flowRef.current?.getViewport();
            const zoom = Math.max(viewport?.zoom ?? 1, 0.1);
            const threshold = ALIGNMENT_THRESHOLD_PX / zoom;
            const scanRange = ALIGNMENT_SCAN_RANGE_PX / zoom;
            const range = {
              minX: dragPosition.x - scanRange,
              minY: dragPosition.y - scanRange,
              maxX: dragPosition.x + dragSize.width + scanRange,
              maxY: dragPosition.y + dragSize.height + scanRange,
            };
            const candidates = alignmentGrid
              .queryRange(range)
              .filter((candidate) => candidate.id !== node.id);
            const alignment = getAlignmentForNode({
              dragId: node.id,
              dragPosition,
              dragSize,
              nodes: candidates,
              threshold,
            });
            if (alignment) {
              // 逻辑：找到最接近的对齐点 -> 修正位置 -> 输出对齐线
              const snappedPosition = { ...dragPosition };
              if (typeof alignment.snapX === "number") {
                snappedPosition.x = alignment.snapX;
              }
              if (typeof alignment.snapY === "number") {
                snappedPosition.y = alignment.snapY;
              }
              nextGuides = {
                x: alignment.guideX,
                y: alignment.guideY,
              };
              alignedChanges = changes.map((change, index) =>
                index === draggingIndex
                  ? { ...change, position: snappedPosition }
                  : change,
              );
            }
          }
        }
      }

      // 逻辑：过滤图片节点的非 resize 尺寸变化，避免循环触发
      const filteredChanges = alignedChanges.filter((change) => {
        if (change.type !== "dimensions") return true;
        if (typeof change.resizing === "boolean") return true;
        const node = nodeMap.get(change.id);
        return !node || node.type !== "image";
      });

      setAlignmentGuides(nextGuides);

      if (filteredChanges.length === 0) {
        return;
      }
      // 逻辑：节点移动/缩放时刷新自动连线方向
      const shouldUpdateHandles = filteredChanges.some(
        (change) => change.type === "position" || change.type === "dimensions",
      );
      setNodes((currentNodes) => {
        const nextNodes = adjustGroupBounds(applyNodeChanges(filteredChanges, currentNodes));
        if (shouldUpdateHandles) {
          setEdges((currentEdges) => updateAutoHandleEdges(currentEdges, nextNodes));
        }
        return nextNodes;
      });
    },
    [flowRef, isLocked, nodes, setEdges, setNodes],
  );

  return {
    alignmentGuides,
    clearAlignmentGuides,
    handleNodesChange,
  };
}
