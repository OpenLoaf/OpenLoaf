"use client";

import { useCallback, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  applyNodeChanges,
  type Edge,
  type Node as RFNode,
  type NodeChange,
  type NodeDimensionChange,
  type ReactFlowInstance,
} from "reactflow";
import {
  adjustGroupBounds,
  buildNodeMap,
  createAbsolutePositionGetter,
  getNodeParentId,
} from "../utils/group-node";
import { updateAutoHandleEdges } from "../utils/canvas-auto-handle";
import { buildSnapBound, computeSnap, type SnapLine } from "../utils/canvas-snap";
import { resolveNodeSize } from "../utils/node-size";

interface UseCanvasAlignmentOptions {
  nodes: RFNode[];
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  flowRef: RefObject<ReactFlowInstance | null>;
  isLocked: boolean;
}

interface UseCanvasAlignmentResult {
  handleNodesChange: (changes: NodeChange[]) => void;
  snapLines: SnapLine[];
  clearSnapLines: () => void;
}

/** Check whether the change is a dimension update. */
function isNodeDimensionChange(change: NodeChange): change is NodeDimensionChange {
  return change.type === "dimensions";
}

/** Check whether a node is nested under any moving root. */
function isDescendantOfMovingRoot(
  node: RFNode,
  nodeMap: Map<string, RFNode>,
  movingRootIds: Set<string>,
): boolean {
  let parentId = node.parentId ?? node.parentNode ?? null;
  // 流程：沿父链向上查找，命中任一移动 root 即视为后代
  while (parentId) {
    if (movingRootIds.has(parentId)) return true;
    const parent = nodeMap.get(parentId);
    if (!parent) break;
    parentId = parent.parentId ?? parent.parentNode ?? null;
  }
  return false;
}

/** Apply a snap delta to moving root nodes. */
function applySnapDeltaToNodes(
  nodes: RFNode[],
  movingRootIds: Set<string>,
  dx: number,
  dy: number,
): RFNode[] {
  if (movingRootIds.size === 0) return nodes;
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (!movingRootIds.has(node.id)) return node;
    const nextPosition = {
      x: node.position.x + dx,
      y: node.position.y + dy,
    };
    if (
      Math.abs(nextPosition.x - node.position.x) < 0.01 &&
      Math.abs(nextPosition.y - node.position.y) < 0.01
    ) {
      return node;
    }
    changed = true;
    return { ...node, position: nextPosition };
  });
  return changed ? nextNodes : nodes;
}

/** Build node change handler without alignment guides. */
export function useCanvasAlignment({
  nodes,
  setNodes,
  setEdges,
  flowRef,
  isLocked,
}: UseCanvasAlignmentOptions): UseCanvasAlignmentResult {
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

  /** Apply node changes and keep group bounds/auto handles in sync. */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nodeMap = buildNodeMap(nodes);
      // 逻辑：过滤图片节点的非 resize 尺寸变化，避免循环触发
      const filteredChanges = changes.filter((change) => {
        if (!isNodeDimensionChange(change)) return true;
        if (typeof change.resizing === "boolean") return true;
        const node = nodeMap.get(change.id);
        return !node || node.type !== "image";
      });

      if (filteredChanges.length === 0) {
        return;
      }
      const positionChanges = filteredChanges.filter((change) => change.type === "position");
      const isDragging = positionChanges.some(
        (change) => typeof change.dragging === "boolean" && change.dragging,
      );
      const draggingIds = isDragging ? new Set(positionChanges.map((change) => change.id)) : null;
      // 逻辑：只在拖拽过程中启用对齐/吸附，避免点击选中时触发
      const shouldSnap = positionChanges.length > 0 && isDragging && !isLocked;
      // 逻辑：节点移动/缩放时刷新自动连线方向
      const shouldUpdateHandles = filteredChanges.some(
        (change) => change.type === "position" || change.type === "dimensions",
      );
      let nextNodes = applyNodeChanges(filteredChanges, nodes);
      if (!shouldSnap) {
        setSnapLines([]);
        nextNodes = adjustGroupBounds(
          nextNodes,
          draggingIds ? { skipChildIds: draggingIds } : undefined,
        );
        if (shouldUpdateHandles) {
          setEdges((currentEdges) => updateAutoHandleEdges(currentEdges, nextNodes));
        }
        setNodes(nextNodes);
        return;
      }

      const movingIds = new Set(positionChanges.map((change) => change.id));
      const nextNodeMap = buildNodeMap(nextNodes);
      const hasEditingNode = Array.from(movingIds).some((id) => {
        const node = nextNodeMap.get(id);
        return Boolean((node?.data as { editing?: boolean } | undefined)?.editing);
      });
      if (hasEditingNode) {
        setSnapLines([]);
        nextNodes = adjustGroupBounds(
          nextNodes,
          draggingIds ? { skipChildIds: draggingIds } : undefined,
        );
        if (shouldUpdateHandles) {
          setEdges((currentEdges) => updateAutoHandleEdges(currentEdges, nextNodes));
        }
        setNodes(nextNodes);
        return;
      }
      const movingRootIds = new Set(
        Array.from(movingIds).filter((id) => {
          const node = nextNodeMap.get(id);
          if (!node) return false;
          return !isDescendantOfMovingRoot(node, nextNodeMap, movingIds);
        }),
      );
      let snapScopeParentId: string | null = null;
      let hasMixedParents = false;
      for (const id of movingRootIds) {
        const node = nextNodeMap.get(id);
        if (!node) continue;
        const parentId = getNodeParentId(node);
        if (snapScopeParentId === null) {
          snapScopeParentId = parentId ?? null;
          continue;
        }
        if (snapScopeParentId !== (parentId ?? null)) {
          hasMixedParents = true;
          break;
        }
      }
      if (hasMixedParents) {
        // 逻辑：跨 group 的节点不参与自动对齐，避免跨层级吸附
        setSnapLines([]);
        nextNodes = adjustGroupBounds(
          nextNodes,
          draggingIds ? { skipChildIds: draggingIds } : undefined,
        );
        if (shouldUpdateHandles) {
          setEdges((currentEdges) => updateAutoHandleEdges(currentEdges, nextNodes));
        }
        setNodes(nextNodes);
        return;
      }
      const getAbsolutePosition = createAbsolutePositionGetter(nextNodeMap);
      const movingItems = Array.from(movingRootIds)
        .map((id) => {
          const node = nextNodeMap.get(id);
          if (!node) return null;
          const size = resolveNodeSize(node);
          if (!size) return null;
          const position = getAbsolutePosition(node);
          return buildSnapBound(position, size);
        })
        .filter((item): item is ReturnType<typeof buildSnapBound> => Boolean(item));

      if (movingItems.length === 0) {
        setSnapLines([]);
        nextNodes = adjustGroupBounds(
          nextNodes,
          draggingIds ? { skipChildIds: draggingIds } : undefined,
        );
        if (shouldUpdateHandles) {
          setEdges((currentEdges) => updateAutoHandleEdges(currentEdges, nextNodes));
        }
        setNodes(nextNodes);
        return;
      }

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const item of movingItems) {
        minX = Math.min(minX, item.minX);
        minY = Math.min(minY, item.minY);
        maxX = Math.max(maxX, item.maxX);
        maxY = Math.max(maxY, item.maxY);
      }
      const selectionBound = {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };

      const referenceBounds = nextNodes
        .filter((node) => {
          if (movingIds.has(node.id)) return false;
          if (isDescendantOfMovingRoot(node, nextNodeMap, movingRootIds)) return false;
          // 逻辑：group 内节点只与同一 parentId 的节点对齐
          if (snapScopeParentId !== null) {
            return (getNodeParentId(node) ?? null) === snapScopeParentId;
          }
          return true;
        })
        .map((node) => {
          const size = resolveNodeSize(node);
          if (!size) return null;
          const position = getAbsolutePosition(node);
          return buildSnapBound(position, size);
        })
        .filter((item): item is ReturnType<typeof buildSnapBound> => Boolean(item));

      const zoom = flowRef.current?.getViewport().zoom ?? 1;
      const threshold = 8 / zoom;
      const snap = computeSnap(selectionBound, referenceBounds, threshold);
      setSnapLines(snap.lines);

      if (Math.abs(snap.dx) > 0.01 || Math.abs(snap.dy) > 0.01) {
        nextNodes = applySnapDeltaToNodes(nextNodes, movingRootIds, snap.dx, snap.dy);
      }

      nextNodes = adjustGroupBounds(
        nextNodes,
        draggingIds ? { skipChildIds: draggingIds } : undefined,
      );
      if (shouldUpdateHandles) {
        setEdges((currentEdges) => updateAutoHandleEdges(currentEdges, nextNodes));
      }
      setNodes(nextNodes);
    },
    [flowRef, isLocked, nodes, setEdges, setNodes],
  );

  return {
    handleNodesChange,
    snapLines,
    clearSnapLines: () => setSnapLines([]),
  };
}
