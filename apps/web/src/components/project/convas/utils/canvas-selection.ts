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
  | "distribute-vertical"
  | "auto-arrange"
  | "auto-resize";

const AUTO_ARRANGE_ROW_SIZE = 4;
const AUTO_ARRANGE_PADDING = 20;
const AUTO_RESIZE_HEIGHT = 200;

type AlignItem = {
  node: RFNode;
  size: { width: number; height: number };
  abs: { x: number; y: number };
};

/** Collect selected nodes with size and absolute positions for alignment calculations. */
function collectAlignItems(nodes: RFNode[]) {
  const selectedNodes = nodes.filter((node) => node.selected);
  if (selectedNodes.length < 2) return null;
  const nodeMap = buildNodeMap(nodes);
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  const items = selectedNodes
    .map((node) => {
      const size = resolveNodeSize(node);
      if (!size) return null;
      return { node, size, abs: getAbsolutePosition(node) };
    })
    .filter((item): item is AlignItem => Boolean(item));
  if (items.length < 2) return null;
  return { items, nodeMap, getAbsolutePosition };
}

/** Build absolute positions for auto-arranging nodes in rows. */
function buildAutoArrangePositions(items: AlignItem[]) {
  const sorted = [...items].sort((a, b) => {
    const centerDiff = a.abs.y + a.size.height / 2 - (b.abs.y + b.size.height / 2);
    if (Math.abs(centerDiff) > 0.01) return centerDiff;
    const xDiff = a.abs.x + a.size.width / 2 - (b.abs.x + b.size.width / 2);
    if (Math.abs(xDiff) > 0.01) return xDiff;
    return a.node.id.localeCompare(b.node.id);
  });
  const rows: AlignItem[][] = [];
  for (let i = 0; i < sorted.length; i += AUTO_ARRANGE_ROW_SIZE) {
    rows.push(sorted.slice(i, i + AUTO_ARRANGE_ROW_SIZE));
  }
  rows.forEach((row) =>
    row.sort((a, b) => a.abs.x + a.size.width / 2 - (b.abs.x + b.size.width / 2)),
  );

  const nextAbsMap = new Map<string, { x: number; y: number }>();
  const firstRow = rows[0];
  if (!firstRow || firstRow.length === 0) return nextAbsMap;
  let startY = firstRow[0].abs.y;
  const startX = firstRow[0].abs.x;

  // 流程：按行排列 -> 逐行计算最大高度 -> 叠加固定间距
  for (const row of rows) {
    let cursorX = startX;
    let maxHeight = 0;
    for (const item of row) {
      nextAbsMap.set(item.node.id, { x: cursorX, y: startY });
      cursorX += item.size.width + AUTO_ARRANGE_PADDING;
      maxHeight = Math.max(maxHeight, item.size.height);
    }
    startY += maxHeight + AUTO_ARRANGE_PADDING;
  }

  return nextAbsMap;
}

/** Build resized dimensions for auto-resize alignment. */
function buildAutoResizeSizes(items: AlignItem[]) {
  const sizeMap = new Map<string, { width: number; height: number }>();
  for (const item of items) {
    if (item.size.height <= 0) continue;
    const scale = AUTO_RESIZE_HEIGHT / item.size.height;
    if (!Number.isFinite(scale) || scale <= 0) continue;
    sizeMap.set(item.node.id, {
      width: Math.max(1, Math.round(item.size.width * scale)),
      height: Math.max(1, Math.round(item.size.height * scale)),
    });
  }
  return sizeMap;
}

/**
 * Align or distribute selected nodes based on the requested mode.
 * This works in absolute space and then maps positions back to each node's parent.
 * The function ignores nodes without measurable size to avoid unstable snapping.
 */
export function alignSelectedNodes(nodes: RFNode[], mode: AlignMode) {
  const collected = collectAlignItems(nodes);
  if (!collected) return nodes;
  const { items, nodeMap, getAbsolutePosition } = collected;
  let nextItems = items;
  let sizeMap: Map<string, { width: number; height: number }> | null = null;

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

  if (mode === "auto-resize") {
    sizeMap = buildAutoResizeSizes(items);
    nextItems = items.map((item) => {
      const nextSize = sizeMap?.get(item.node.id);
      return nextSize ? { ...item, size: nextSize } : item;
    });
  }

  if (mode === "auto-arrange" || mode === "auto-resize") {
    const arranged = buildAutoArrangePositions(nextItems);
    for (const [id, value] of arranged.entries()) {
      nextAbsMap.set(id, value);
    }
  } else if (mode === "distribute-horizontal" || mode === "distribute-vertical") {
    if (nextItems.length < 3) return nodes;
    if (mode === "distribute-horizontal") {
      const sorted = [...nextItems].sort(
        (a, b) => a.abs.x - b.abs.x || a.node.id.localeCompare(b.node.id),
      );
      const totalWidth = sorted.reduce((sum, item) => sum + item.size.width, 0);
      const startX = sorted[0].abs.x;
      const endX = sorted[sorted.length - 1].abs.x + sorted[sorted.length - 1].size.width;
      const span = endX - startX;
      let spacing = (span - totalWidth) / (sorted.length - 1);
      let cursor = startX;
      if (!Number.isFinite(spacing)) return nodes;
      if (spacing < 0) {
        // 逻辑：重叠导致间距为负时，以选区中心铺开并压到 0 间距
        spacing = 0;
        cursor = targetX - totalWidth / 2;
      }
      // 流程：按 x 排序 -> 计算总宽与间距 -> 逐个放置
      for (const item of sorted) {
        nextAbsMap.set(item.node.id, { x: cursor, y: item.abs.y });
        cursor += item.size.width + spacing;
      }
    } else {
      const sorted = [...nextItems].sort(
        (a, b) => a.abs.y - b.abs.y || a.node.id.localeCompare(b.node.id),
      );
      const totalHeight = sorted.reduce((sum, item) => sum + item.size.height, 0);
      const startY = sorted[0].abs.y;
      const endY = sorted[sorted.length - 1].abs.y + sorted[sorted.length - 1].size.height;
      const span = endY - startY;
      let spacing = (span - totalHeight) / (sorted.length - 1);
      let cursor = startY;
      if (!Number.isFinite(spacing)) return nodes;
      if (spacing < 0) {
        // 逻辑：重叠导致间距为负时，以选区中心铺开并压到 0 间距
        spacing = 0;
        cursor = targetY - totalHeight / 2;
      }
      // 流程：按 y 排序 -> 计算总高与间距 -> 逐个放置
      for (const item of sorted) {
        nextAbsMap.set(item.node.id, { x: item.abs.x, y: cursor });
        cursor += item.size.height + spacing;
      }
    }
  } else {
    for (const item of nextItems) {
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
    const resized = sizeMap?.get(node.id);
    const nextAbs = nextAbsMap.get(node.id);
    if (!nextAbs && !resized) return node;
    let nextNode = node;
    if (resized) {
      const widthChanged = Math.abs((node.width ?? 0) - resized.width) > 0.5;
      const heightChanged = Math.abs((node.height ?? 0) - resized.height) > 0.5;
      if (widthChanged || heightChanged) {
        changed = true;
        nextNode = {
          ...nextNode,
          width: resized.width,
          height: resized.height,
          style: {
            ...nextNode.style,
            width: resized.width,
            height: resized.height,
          },
        };
      }
    }
    if (!nextAbs) return nextNode;
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
      return nextNode;
    }
    changed = true;
    return { ...nextNode, position: nextPosition };
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
