import type { Node as RFNode } from "reactflow";
import { buildNodeMap, createAbsolutePositionGetter, getNodeParentId } from "./group-node";
import { resolveNodeSize } from "./node-size";

export type AlignMode =
  | "center-horizontal"
  | "center-vertical"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

/**
 * Align or distribute selected nodes based on the requested mode.
 * This works in absolute space and then maps positions back to each node's parent.
 * The function ignores nodes without measurable size to avoid unstable snapping.
 */
export function alignSelectedNodes(nodes: RFNode[], mode: AlignMode) {
  const selectedNodes = nodes.filter((node) => node.selected);
  if (selectedNodes.length < 2) return nodes;
  const nodeMap = buildNodeMap(nodes);
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  const items = selectedNodes
    .map((node) => {
      const size = resolveNodeSize(node);
      if (!size) return null;
      return { node, size, abs: getAbsolutePosition(node) };
    })
    .filter((item): item is { node: RFNode; size: { width: number; height: number }; abs: { x: number; y: number } } =>
      Boolean(item),
    );
  if (items.length < 2) return nodes;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    minX = Math.min(minX, item.abs.x);
    minY = Math.min(minY, item.abs.y);
    maxX = Math.max(maxX, item.abs.x + item.size.width);
    maxY = Math.max(maxY, item.abs.y + item.size.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return nodes;
  }

  const nextAbsMap = new Map<string, { x: number; y: number }>();
  const targetX = (minX + maxX) / 2;
  const targetY = (minY + maxY) / 2;

  // 逻辑：根据对齐模式生成绝对坐标，避免在父级坐标系内反复换算
  if (mode === "distribute-horizontal" || mode === "distribute-vertical") {
    if (items.length < 3) return nodes;
    if (mode === "distribute-horizontal") {
      const sorted = [...items].sort((a, b) => a.abs.x - b.abs.x);
      const totalWidth = sorted.reduce((sum, item) => sum + item.size.width, 0);
      const spacing = (maxX - minX - totalWidth) / (sorted.length - 1);
      let cursor = minX;
      // 流程：按 x 排序 -> 计算总宽与间距 -> 逐个放置
      for (const item of sorted) {
        nextAbsMap.set(item.node.id, { x: cursor, y: item.abs.y });
        cursor += item.size.width + spacing;
      }
    } else {
      const sorted = [...items].sort((a, b) => a.abs.y - b.abs.y);
      const totalHeight = sorted.reduce((sum, item) => sum + item.size.height, 0);
      const spacing = (maxY - minY - totalHeight) / (sorted.length - 1);
      let cursor = minY;
      // 流程：按 y 排序 -> 计算总高与间距 -> 逐个放置
      for (const item of sorted) {
        nextAbsMap.set(item.node.id, { x: item.abs.x, y: cursor });
        cursor += item.size.height + spacing;
      }
    }
  } else {
    for (const item of items) {
      const nextAbs = { x: item.abs.x, y: item.abs.y };
      // 逻辑：对齐到指定边或中心线
      if (mode === "center-horizontal") {
        nextAbs.y = targetY - item.size.height / 2;
      } else if (mode === "center-vertical") {
        nextAbs.x = targetX - item.size.width / 2;
      } else if (mode === "left") {
        nextAbs.x = minX;
      } else if (mode === "right") {
        nextAbs.x = maxX - item.size.width;
      } else if (mode === "top") {
        nextAbs.y = minY;
      } else if (mode === "bottom") {
        nextAbs.y = maxY - item.size.height;
      }
      nextAbsMap.set(item.node.id, nextAbs);
    }
  }

  let changed = false;
  const nextNodes = nodes.map((node) => {
    const nextAbs = nextAbsMap.get(node.id);
    if (!nextAbs) return node;
    const parentId = getNodeParentId(node);
    const parent = parentId ? nodeMap.get(parentId) : null;
    const parentAbs = parent ? getAbsolutePosition(parent) : { x: 0, y: 0 };
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
