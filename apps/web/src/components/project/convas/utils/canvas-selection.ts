import type { Node as RFNode } from "reactflow";
import {
  buildNodeMap,
  createAbsolutePositionGetter,
  getNodeParentId,
  resolveNodeSize,
} from "../nodes/GroupNode";

/** Align selected nodes along the given axis. */
export function alignSelectedNodes(nodes: RFNode[], axis: "horizontal" | "vertical") {
  const selectedNodes = nodes.filter((node) => node.selected);
  if (selectedNodes.length < 2) return nodes;
  const nodeMap = buildNodeMap(nodes);
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const node of selectedNodes) {
    const size = resolveNodeSize(node);
    if (!size) continue;
    const abs = getAbsolutePosition(node);
    minX = Math.min(minX, abs.x);
    minY = Math.min(minY, abs.y);
    maxX = Math.max(maxX, abs.x + size.width);
    maxY = Math.max(maxY, abs.y + size.height);
    count += 1;
  }

  if (count < 2 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return nodes;
  }

  const targetX = (minX + maxX) / 2;
  const targetY = (minY + maxY) / 2;
  let changed = false;

  const nextNodes = nodes.map((node) => {
    if (!node.selected) return node;
    const size = resolveNodeSize(node);
    if (!size) return node;
    const abs = getAbsolutePosition(node);
    const nextAbs = { x: abs.x, y: abs.y };
    // 逻辑：基于绝对坐标对齐中心线，保持节点尺寸不变
    if (axis === "horizontal") {
      nextAbs.y = targetY - size.height / 2;
    } else {
      nextAbs.x = targetX - size.width / 2;
    }
    const parentId = getNodeParentId(node);
    if (parentId) {
      const parent = nodeMap.get(parentId);
      if (!parent) return node;
      const parentAbs = getAbsolutePosition(parent);
      const nextPosition = {
        x: nextAbs.x - parentAbs.x,
        y: nextAbs.y - parentAbs.y,
      };
      if (
        Math.abs(nextPosition.x - node.position.x) < 0.01 &&
        Math.abs(nextPosition.y - node.position.y) < 0.01
      ) {
        return node;
      }
      changed = true;
      return { ...node, position: nextPosition };
    }
    if (
      Math.abs(nextAbs.x - node.position.x) < 0.01 &&
      Math.abs(nextAbs.y - node.position.y) < 0.01
    ) {
      return node;
    }
    changed = true;
    return { ...node, position: nextAbs };
  });

  return changed ? nextNodes : nodes;
}

/** Collect ids for selected nodes and their descendants. */
export function collectDeleteIds(nodes: RFNode[]) {
  const deleteIds = new Set<string>();
  const queue = nodes.filter((node) => node.selected).map((node) => node.id);
  // 逻辑：遍历选中节点 -> 递归收集子节点
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || deleteIds.has(id)) continue;
    deleteIds.add(id);
    for (const node of nodes) {
      if (getNodeParentId(node) === id) {
        queue.push(node.id);
      }
    }
  }
  return deleteIds;
}
