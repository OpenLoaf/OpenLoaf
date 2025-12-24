"use client";

import type { Node as RFNode } from "reactflow";
import { resolveNodeSize } from "./node-size";

export type MultiSelectionBounds = {
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const GROUP_PADDING_PX = 24;
const GROUP_HEADER_HEIGHT_PX = 18;
const GROUP_PADDING_TOP_PX = GROUP_PADDING_PX + GROUP_HEADER_HEIGHT_PX;
const GROUP_BOUNDS_EPSILON = 0.5;

/**
 * Build a node lookup map for fast access during graph operations and parent traversal.
 * This avoids repeated array scans when resolving parents, children, or descendants.
 */
export function buildNodeMap(nodes: RFNode[]) {
  return new Map(nodes.map((node) => [node.id, node]));
}

/**
 * Resolve the parent id for a node, supporting legacy fields and missing parents.
 * Returns null when the node is a root or the parent reference is empty.
 */
export function getNodeParentId(node: RFNode): string | null {
  return node.parentId ?? node.parentNode ?? null;
}

/**
 * Resolve a node absolute position with parent offsets to support nested group stacks.
 * The returned getter caches intermediate results for faster repeated lookups.
 */
export function createAbsolutePositionGetter(nodeMap: Map<string, RFNode>) {
  const cache = new Map<string, { x: number; y: number }>();
  const resolve = (node: RFNode): { x: number; y: number } => {
    const cached = cache.get(node.id);
    if (cached) return cached;
    const parentId = getNodeParentId(node);
    if (!parentId) {
      const abs = { x: node.position.x, y: node.position.y };
      cache.set(node.id, abs);
      return abs;
    }
    const parent = nodeMap.get(parentId);
    if (!parent) {
      const abs = { x: node.position.x, y: node.position.y };
      cache.set(node.id, abs);
      return abs;
    }
    // 逻辑：递归获取父级绝对位置 -> 叠加本地偏移
    const parentAbs = resolve(parent);
    const abs = { x: parentAbs.x + node.position.x, y: parentAbs.y + node.position.y };
    cache.set(node.id, abs);
    return abs;
  };
  return resolve;
}

/**
 * Compute selection bounds from selected nodes for multi-selection UI placement.
 * Returns null when selection is not a multi-selection or size data is missing.
 */
export function getSelectionBounds(
  nodes: RFNode[],
  options: { useAbsolute?: boolean } = {},
): MultiSelectionBounds | null {
  // 流程：筛选选中节点 -> 计算包围盒 -> 仅在多选时输出
  const useAbsolute = options.useAbsolute === true;
  const nodeMap = useAbsolute ? buildNodeMap(nodes) : null;
  const getAbsolutePosition = nodeMap ? createAbsolutePositionGetter(nodeMap) : null;
  let count = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    if (!node.selected) continue;
    const size = resolveNodeSize(node);
    if (!size) continue;
    const position = useAbsolute && getAbsolutePosition ? getAbsolutePosition(node) : node.position;
    const nextMinX = position.x;
    const nextMinY = position.y;
    const nextMaxX = position.x + size.width;
    const nextMaxY = position.y + size.height;
    minX = Math.min(minX, nextMinX);
    minY = Math.min(minY, nextMinY);
    maxX = Math.max(maxX, nextMaxX);
    maxY = Math.max(maxY, nextMaxY);
    count += 1;
  }

  if (count < 2 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  return { count, minX, minY, maxX, maxY };
}

/**
 * Create a group node that wraps the current selection and re-parents child nodes.
 * Only groups when all selected nodes share the same parent to avoid cross-level nesting.
 */
export function groupSelectedNodes(nodes: RFNode[]): RFNode[] {
  const selectedNodes = nodes.filter((node) => node.selected);
  if (selectedNodes.length < 2) return nodes;

  const parentId = getNodeParentId(selectedNodes[0]);
  if (selectedNodes.some((node) => getNodeParentId(node) !== parentId)) {
    return nodes;
  }

  // 流程：计算包围盒 -> 生成 group -> 迁移子节点到新父级
  const selection = getSelectionBounds(selectedNodes);
  if (!selection) return nodes;

  const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const groupPosition = {
    x: selection.minX - GROUP_PADDING_PX,
    y: selection.minY - GROUP_PADDING_TOP_PX,
  };
  const groupWidth = selection.maxX - selection.minX + GROUP_PADDING_PX * 2;
  const groupHeight = selection.maxY - selection.minY + GROUP_PADDING_PX + GROUP_PADDING_TOP_PX;
  const groupNode: RFNode = {
    id: groupId,
    type: "group",
    position: groupPosition,
    data: {
      label: "组",
      // 逻辑：group 节点复制只传 id，避免大图数据进入剪贴板
      copyMode: "ids",
    },
    width: groupWidth,
    height: groupHeight,
    style: { width: groupWidth, height: groupHeight },
    parentId: parentId ?? undefined,
    extent: parentId ? "parent" : undefined,
    selected: true,
  };

  const nextNodes: RFNode[] = nodes.map((node) => {
    if (!node.selected) return node;
    if (getNodeParentId(node) !== parentId) return node;
    const nextPosition = {
      x: node.position.x - groupPosition.x,
      y: node.position.y - groupPosition.y,
    };
    const nextNode: RFNode = {
      ...node,
      parentId: groupId,
      extent: "parent",
      position: nextPosition,
      selected: false,
    };
    return nextNode;
  });

  return [groupNode, ...nextNodes];
}

/**
 * Dissolve a group node and keep its children in their current absolute positions.
 * This removes the group container while preserving the visual placement of descendants.
 */
export function dissolveGroup(nodes: RFNode[], groupId: string): RFNode[] {
  const nodeMap = buildNodeMap(nodes);
  const group = nodeMap.get(groupId);
  if (!group) return nodes;
  const parentId = getNodeParentId(group);
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  const parentAbs = parentId ? getAbsolutePosition(nodeMap.get(parentId) ?? group) : { x: 0, y: 0 };
  const nextNodes: RFNode[] = [];
  // 逻辑：移除 group 节点 -> 将子节点转换为父级或根节点坐标
  for (const node of nodes) {
    if (node.id === groupId) continue;
    if (getNodeParentId(node) !== groupId) {
      nextNodes.push(node);
      continue;
    }
    const childAbs = getAbsolutePosition(node);
    const nextPosition = {
      x: childAbs.x - parentAbs.x,
      y: childAbs.y - parentAbs.y,
    };
    nextNodes.push({
      ...node,
      parentId: parentId ?? undefined,
      extent: parentId ? "parent" : undefined,
      position: nextPosition,
    });
  }
  return nextNodes;
}

/**
 * Auto-resize group nodes based on their children bounds while preserving child positions.
 * This keeps groups tight around content without visually shifting children.
 */
export function adjustGroupBounds(nodes: RFNode[]) {
  const nodeMap = buildNodeMap(nodes);
  const groupNodes = nodes.filter((node) => node.type === "group");
  if (groupNodes.length === 0) return nodes;

  const depthCache = new Map<string, number>();
  const getDepth = (node: RFNode) => {
    const cached = depthCache.get(node.id);
    if (typeof cached === "number") return cached;
    let depth = 0;
    let parentId = getNodeParentId(node);
    // 逻辑：沿父链累加深度，避免循环引用
    while (parentId) {
      const parent = nodeMap.get(parentId);
      if (!parent) break;
      depth += 1;
      parentId = getNodeParentId(parent);
      if (parentId === node.id) break;
    }
    depthCache.set(node.id, depth);
    return depth;
  };

  const sortedGroups = [...groupNodes].sort((a, b) => getDepth(b) - getDepth(a));
  let changed = false;

  for (const group of sortedGroups) {
    const currentGroup = nodeMap.get(group.id) ?? group;
    const children = Array.from(nodeMap.values()).filter(
      (node) => getNodeParentId(node) === currentGroup.id,
    );
    if (children.length === 0) continue;
    const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let count = 0;

    for (const child of children) {
      const size = resolveNodeSize(child);
      if (!size) continue;
      const abs = getAbsolutePosition(child);
      minX = Math.min(minX, abs.x);
      minY = Math.min(minY, abs.y);
      maxX = Math.max(maxX, abs.x + size.width);
      maxY = Math.max(maxY, abs.y + size.height);
      count += 1;
    }

    if (count === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
      continue;
    }

    const desiredAbs = {
      x: minX - GROUP_PADDING_PX,
      y: minY - GROUP_PADDING_TOP_PX,
    };
    const desiredSize = {
      width: maxX - minX + GROUP_PADDING_PX * 2,
      height: maxY - minY + GROUP_PADDING_PX + GROUP_PADDING_TOP_PX,
    };
    const groupAbs = getAbsolutePosition(currentGroup);
    const deltaX = desiredAbs.x - groupAbs.x;
    const deltaY = desiredAbs.y - groupAbs.y;
    const sizeChanged =
      Math.abs((currentGroup.width ?? 0) - desiredSize.width) > GROUP_BOUNDS_EPSILON ||
      Math.abs((currentGroup.height ?? 0) - desiredSize.height) > GROUP_BOUNDS_EPSILON;
    const positionChanged =
      Math.abs(deltaX) > GROUP_BOUNDS_EPSILON || Math.abs(deltaY) > GROUP_BOUNDS_EPSILON;
    if (!sizeChanged && !positionChanged) continue;

    const parentId = getNodeParentId(currentGroup);
    const parent = parentId ? nodeMap.get(parentId) : null;
    const parentAbs = parent ? getAbsolutePosition(parent) : { x: 0, y: 0 };
    const nextGroupPosition = {
      x: desiredAbs.x - parentAbs.x,
      y: desiredAbs.y - parentAbs.y,
    };
    const nextGroup: RFNode = {
      ...currentGroup,
      position: nextGroupPosition,
      width: desiredSize.width,
      height: desiredSize.height,
      style: {
        ...currentGroup.style,
        width: desiredSize.width,
        height: desiredSize.height,
      },
    };
    nodeMap.set(group.id, nextGroup);
    changed = true;

    if (positionChanged) {
      // 逻辑：父级移动后修正子节点相对位置，保持绝对位置不变
      for (const child of children) {
        const nextPosition = {
          x: child.position.x - deltaX,
          y: child.position.y - deltaY,
        };
        nodeMap.set(child.id, { ...child, position: nextPosition });
      }
    }
  }

  if (!changed) return nodes;
  return nodes.map((node) => nodeMap.get(node.id) ?? node);
}
