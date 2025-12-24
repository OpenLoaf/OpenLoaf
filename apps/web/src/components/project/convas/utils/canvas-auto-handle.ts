import type { Edge, Node as RFNode } from "reactflow";
import { resolveNodeSize } from "../nodes/GroupNode";
import { IMAGE_HANDLE_IDS } from "./canvas-constants";

/** Resolve the node center point for handle calculations. */
function resolveNodeCenter(node: RFNode): { x: number; y: number } | null {
  const size = resolveNodeSize(node);
  if (!size) return null;
  const position =
    (node as RFNode & { positionAbsolute?: { x: number; y: number } }).positionAbsolute ??
    node.position;
  return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
}

/** Check whether an edge should auto-update handle positions. */
function isAutoHandleEdge(edge: Edge): boolean {
  const label = typeof edge.label === "string" ? edge.label : null;
  return edge.data?.autoHandle === true || label === "裁切";
}

/** Resolve handle ids based on source/target positions. */
export function getAutoHandleIds(
  sourceCenter: { x: number; y: number },
  targetCenter: { x: number; y: number },
) {
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  // 逻辑：比较水平/垂直距离 -> 选更明显方向 -> 输出 handle id
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: IMAGE_HANDLE_IDS.source.right, targetHandle: IMAGE_HANDLE_IDS.target.left }
      : { sourceHandle: IMAGE_HANDLE_IDS.source.left, targetHandle: IMAGE_HANDLE_IDS.target.right };
  }
  return dy >= 0
    ? { sourceHandle: IMAGE_HANDLE_IDS.source.bottom, targetHandle: IMAGE_HANDLE_IDS.target.top }
    : { sourceHandle: IMAGE_HANDLE_IDS.source.top, targetHandle: IMAGE_HANDLE_IDS.target.bottom };
}

/** Update auto-handle edges to match node positions. */
export function updateAutoHandleEdges(edges: Edge[], nodes: RFNode[]): Edge[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const nextEdges = edges.map((edge) => {
    if (!isAutoHandleEdge(edge)) return edge;
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) return edge;
    const sourceCenter = resolveNodeCenter(sourceNode);
    const targetCenter = resolveNodeCenter(targetNode);
    if (!sourceCenter || !targetCenter) return edge;
    const { sourceHandle, targetHandle } = getAutoHandleIds(sourceCenter, targetCenter);
    if (edge.sourceHandle === sourceHandle && edge.targetHandle === targetHandle) return edge;
    // 逻辑：仅在 handle 发生变化时更新，减少不必要刷新
    changed = true;
    return {
      ...edge,
      sourceHandle,
      targetHandle,
    };
  });
  return changed ? nextEdges : edges;
}
