"use client";

import type { Edge, Node as RFNode } from "reactflow";
import { buildNodeMap, createAbsolutePositionGetter, getNodeParentId } from "./group-node";
import { resolveNodeSize } from "./node-size";

export type NodeClipboardPayload = {
  nodes: RFNode[];
  edges: Edge[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    centerX: number;
    centerY: number;
  };
};

/**
 * Collect nodes by root ids (including descendants) and internal edges.
 * Returns null when no matched nodes are present or sizes are unavailable.
 */
export function collectSubgraphByIds(
  nodes: RFNode[],
  edges: Edge[],
  rootIds: string[],
): NodeClipboardPayload | null {
  const selectedIds = new Set<string>();
  const queue = rootIds.filter(Boolean);
  // 流程：遍历 root ids -> 递归收集子节点
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || selectedIds.has(id)) continue;
    selectedIds.add(id);
    for (const node of nodes) {
      if (getNodeParentId(node) === id) {
        queue.push(node.id);
      }
    }
  }
  if (selectedIds.size === 0) return null;

  const nodeMap = buildNodeMap(nodes);
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  const selectedNodes = nodes.filter((node) => selectedIds.has(node.id));
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

  if (count === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  const selectedEdges = edges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  );

  return {
    nodes: selectedNodes,
    edges: selectedEdges,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    },
  };
}

/**
 * Collect selected nodes (including descendants) and internal edges for clipboard copy.
 * Returns null when no selected nodes are present or sizes are unavailable.
 */
export function collectSelectedSubgraph(nodes: RFNode[], edges: Edge[]): NodeClipboardPayload | null {
  const selectedIds = new Set<string>();
  const queue = nodes.filter((node) => node.selected).map((node) => node.id);
  // 流程：遍历选中节点 -> 递归收集子节点
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || selectedIds.has(id)) continue;
    selectedIds.add(id);
    for (const node of nodes) {
      if (getNodeParentId(node) === id) {
        queue.push(node.id);
      }
    }
  }
  if (selectedIds.size === 0) return null;

  const nodeMap = buildNodeMap(nodes);
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  const selectedNodes = nodes.filter((node) => selectedIds.has(node.id));
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

  if (count === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  const selectedEdges = edges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  );

  return {
    nodes: selectedNodes,
    edges: selectedEdges,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    },
  };
}

/**
 * Paste a previously collected clipboard payload into the current graph.
 * The pasted nodes are re-parented when needed and shifted to the target center.
 */
export function pasteSubgraph(options: {
  nodes: RFNode[];
  edges: Edge[];
  payload: NodeClipboardPayload;
  targetCenter: { x: number; y: number };
}) {
  const { nodes, edges, payload, targetCenter } = options;
  if (payload.nodes.length === 0) return null;
  const nodeMap = buildNodeMap(nodes);
  const getAbsolutePosition = createAbsolutePositionGetter(nodeMap);
  const delta = {
    x: targetCenter.x - payload.bounds.centerX,
    y: targetCenter.y - payload.bounds.centerY,
  };

  const idPrefix = `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const idMap = new Map<string, string>();
  payload.nodes.forEach((node, index) => {
    idMap.set(node.id, `${idPrefix}-${index}`);
  });

  const absMap = new Map<string, { x: number; y: number }>();
  // 逻辑：缓存旧节点的绝对坐标，便于计算新位置
  for (const node of payload.nodes) {
    absMap.set(node.id, getAbsolutePosition(node));
  }

  const clearedNodes = nodes.map((node) => (node.selected ? { ...node, selected: false } : node));
  const nextNodes = payload.nodes.map((node) => {
    const oldAbs = absMap.get(node.id);
    if (!oldAbs) return node;
    const newAbs = { x: oldAbs.x + delta.x, y: oldAbs.y + delta.y };
    const originalParentId = getNodeParentId(node);
    const mappedParentId = originalParentId ? idMap.get(originalParentId) ?? null : null;
    // 逻辑：父节点也被复制时，子节点使用新父级的局部坐标
    const parentAbs = mappedParentId
      ? absMap.get(originalParentId ?? "") ?? { x: 0, y: 0 }
      : { x: 0, y: 0 };
    const nextPosition = mappedParentId
      ? {
          x: newAbs.x - (parentAbs.x + delta.x),
          y: newAbs.y - (parentAbs.y + delta.y),
        }
      : newAbs;
    return {
      ...node,
      id: idMap.get(node.id) ?? node.id,
      parentId: mappedParentId ?? undefined,
      extent: mappedParentId ? "parent" : undefined,
      position: nextPosition,
      selected: true,
    };
  });

  let edgeIndex = 0;
  const nextEdges = payload.edges.map((edge) => ({
    ...edge,
    id: `${idPrefix}-edge-${edgeIndex++}`,
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
    selected: false,
  }));

  return {
    nodes: clearedNodes.concat(nextNodes),
    edges: edges.concat(nextEdges),
  };
}
