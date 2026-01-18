import type { CanvasConnectorElement, CanvasElement, CanvasNodeElement } from "./types";
import { getNodeGroupId, isGroupNodeType } from "./grouping";

export type AutoLayoutUpdate = {
  /** Element id to update. */
  id: string;
  /** New xywh rectangle. */
  xywh: [number, number, number, number];
};

type LayoutDirection = "horizontal" | "vertical";

type LayoutEdge = {
  /** Source layout node id. */
  from: string;
  /** Target layout node id. */
  to: string;
  /** Edge weight used for cycle breaking. */
  weight: number;
};

type LayoutNode = {
  /** Layout node id (group id or node id). */
  id: string;
  /** Current bounds of the layout node. */
  xywh: [number, number, number, number];
  /** Whether this layout node is fixed. */
  locked: boolean;
  /** Whether this layout node represents a group. */
  isGroup: boolean;
  /** Child node ids when representing a group. */
  childIds: string[];
};

type RectTuple = [number, number, number, number];

const LAYER_GAP = 240;
const NODE_GAP = 32;

/** Compute auto layout updates for the full board. */
export function computeAutoLayoutUpdates(elements: CanvasElement[]): AutoLayoutUpdate[] {
  const nodes = elements.filter((element): element is CanvasNodeElement => element.kind === "node");
  if (nodes.length < 2) return [];

  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const groupNodeMap = new Map(
    nodes.filter(node => isGroupNodeType(node.type)).map(node => [node.id, node])
  );
  const groupMembersMap = new Map<string, string[]>();
  nodes.forEach(node => {
    const groupId = getNodeGroupId(node);
    if (!groupId || !groupNodeMap.has(groupId)) return;
    const bucket = groupMembersMap.get(groupId) ?? [];
    bucket.push(node.id);
    groupMembersMap.set(groupId, bucket);
  });

  const resolveLayoutId = (node: CanvasNodeElement): string => {
    if (isGroupNodeType(node.type)) return node.id;
    const groupId = getNodeGroupId(node);
    if (groupId && groupNodeMap.has(groupId)) return groupId;
    return node.id;
  };

  const layoutNodes = new Map<string, LayoutNode>();
  nodes.forEach(node => {
    const layoutId = resolveLayoutId(node);
    if (layoutNodes.has(layoutId)) return;
    const groupNode = groupNodeMap.get(layoutId);
    if (groupNode) {
      const childIds = groupMembersMap.get(layoutId) ?? [];
      const hasLockedChild = childIds.some(childId => nodeMap.get(childId)?.locked);
      layoutNodes.set(layoutId, {
        id: layoutId,
        xywh: groupNode.xywh,
        locked: Boolean(groupNode.locked) || hasLockedChild,
        isGroup: true,
        childIds,
      });
      return;
    }
    layoutNodes.set(layoutId, {
      id: layoutId,
      xywh: node.xywh,
      locked: Boolean(node.locked),
      isGroup: false,
      childIds: [],
    });
  });

  const connectors = elements.filter(
    (element): element is CanvasConnectorElement => element.kind === "connector"
  );

  const edges: LayoutEdge[] = [];
  let dxSum = 0;
  let dySum = 0;

  connectors.forEach(connector => {
    if (!("elementId" in connector.source) || !("elementId" in connector.target)) return;
    const sourceNode = nodeMap.get(connector.source.elementId);
    const targetNode = nodeMap.get(connector.target.elementId);
    if (!sourceNode || !targetNode) return;
    const sourceId = resolveLayoutId(sourceNode);
    const targetId = resolveLayoutId(targetNode);
    if (sourceId === targetId) return;
    const sourceLayout = layoutNodes.get(sourceId);
    const targetLayout = layoutNodes.get(targetId);
    if (!sourceLayout || !targetLayout) return;
    const sourceCenter = getRectCenter(sourceLayout.xywh);
    const targetCenter = getRectCenter(targetLayout.xywh);
    const dx = targetCenter[0] - sourceCenter[0];
    const dy = targetCenter[1] - sourceCenter[1];
    dxSum += Math.abs(dx);
    dySum += Math.abs(dy);
    edges.push({
      from: sourceId,
      to: targetId,
      weight: Math.abs(dx) + Math.abs(dy),
    });
  });

  const direction: LayoutDirection = dxSum >= dySum ? "horizontal" : "vertical";
  const layoutIds = Array.from(layoutNodes.keys());
  const { order, edges: dagEdges } = buildAcyclicOrder(layoutIds, edges);

  const axisMin = getAxisMin(layoutNodes, direction);
  const fixedLayers = new Map<string, number>();
  layoutNodes.forEach(node => {
    if (!node.locked) return;
    fixedLayers.set(node.id, getApproxLayer(node.xywh, direction, axisMin));
  });

  const layers = assignLayers(
    layoutIds,
    order,
    dagEdges,
    fixedLayers,
    layoutNodes,
    direction,
    axisMin
  );
  const layerMap = new Map<number, string[]>();
  layers.forEach((layer, nodeId) => {
    const bucket = layerMap.get(layer) ?? [];
    bucket.push(nodeId);
    layerMap.set(layer, bucket);
  });

  const layerIndices = Array.from(layerMap.keys()).sort((a, b) => a - b);
  const layerOrders = new Map<number, string[]>();
  layerIndices.forEach(layer => {
    const ids = layerMap.get(layer) ?? [];
    const ordered = [...ids].sort((left, right) => {
      const leftRect = layoutNodes.get(left)?.xywh;
      const rightRect = layoutNodes.get(right)?.xywh;
      if (!leftRect || !rightRect) return 0;
      return getSecondaryAxis(leftRect, direction) - getSecondaryAxis(rightRect, direction);
    });
    layerOrders.set(layer, ordered);
  });

  // 逻辑：使用重心排序减少交叉，正反向各跑数次。
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 1; i < layerIndices.length; i += 1) {
      const current = layerIndices[i];
      const prev = layerIndices[i - 1];
      const nextOrder = reorderLayer(
        layerOrders.get(current) ?? [],
        layerOrders.get(prev) ?? [],
        dagEdges,
        layoutNodes,
        "forward"
      );
      layerOrders.set(current, nextOrder);
    }
    for (let i = layerIndices.length - 2; i >= 0; i -= 1) {
      const current = layerIndices[i];
      const next = layerIndices[i + 1];
      const nextOrder = reorderLayer(
        layerOrders.get(current) ?? [],
        layerOrders.get(next) ?? [],
        dagEdges,
        layoutNodes,
        "backward"
      );
      layerOrders.set(current, nextOrder);
    }
  }

  const layerAxis = new Map<number, number>();
  const minLayer = layerIndices.length > 0 ? Math.min(...layerIndices) : 0;
  layerIndices.forEach(layer => {
    const ids = layerOrders.get(layer) ?? [];
    const lockedPositions = ids
      .map(id => layoutNodes.get(id))
      .filter((node): node is LayoutNode => Boolean(node?.locked))
      .map(node => getPrimaryAxis(node.xywh, direction));
    if (lockedPositions.length > 0) {
      const sum = lockedPositions.reduce((acc, value) => acc + value, 0);
      layerAxis.set(layer, sum / lockedPositions.length);
      return;
    }
    layerAxis.set(layer, axisMin + (layer - minLayer) * LAYER_GAP);
  });

  const layoutPositions = new Map<string, [number, number]>();
  layerIndices.forEach(layer => {
    const ids = layerOrders.get(layer) ?? [];
    if (ids.length === 0) return;
    const axis = layerAxis.get(layer) ?? axisMin;
    const minSecondary = ids
      .map(id => layoutNodes.get(id))
      .filter((node): node is LayoutNode => Boolean(node))
      .reduce((min, node) => Math.min(min, getSecondaryAxis(node.xywh, direction)), Infinity);
    const lockedSpans = ids
      .map(id => layoutNodes.get(id))
      .filter((node): node is LayoutNode => Boolean(node?.locked))
      .map(node => getSpan(node.xywh, direction))
      .sort((a, b) => a.start - b.start);

    let cursor = Number.isFinite(minSecondary) ? minSecondary : 0;
    ids.forEach(id => {
      const node = layoutNodes.get(id);
      if (!node) return;
      const [x, y, w, h] = node.xywh;
      if (node.locked) {
        layoutPositions.set(id, [x, y]);
        const span = getSpan(node.xywh, direction);
        cursor = Math.max(cursor, span.end + NODE_GAP);
        return;
      }
      // 逻辑：避开锁定节点占用的区间，保证不会穿插。
      const size = direction === "horizontal" ? h : w;
      const placedSecondary = findNextAvailable(cursor, size, lockedSpans);
      const nextX = direction === "horizontal" ? axis : placedSecondary;
      const nextY = direction === "horizontal" ? placedSecondary : axis;
      layoutPositions.set(id, [nextX, nextY]);
      cursor = placedSecondary + size + NODE_GAP;
    });
  });

  if (layoutPositions.size === 0) {
    // 逻辑：布局失败时退化为单层排列，避免无更新结果。
    const fallbackPositions = buildFallbackPositions(layoutNodes, direction);
    fallbackPositions.forEach((value, key) => layoutPositions.set(key, value));
  }

  const updates: AutoLayoutUpdate[] = [];
  layoutNodes.forEach(layoutNode => {
    if (layoutNode.locked) return;
    const nextPos = layoutPositions.get(layoutNode.id);
    if (!nextPos) return;
    const [nextX, nextY] = nextPos;
    const [x, y, w, h] = layoutNode.xywh;
    if (layoutNode.isGroup) {
      const dx = nextX - x;
      const dy = nextY - y;
      updates.push({ id: layoutNode.id, xywh: [nextX, nextY, w, h] });
      layoutNode.childIds.forEach(childId => {
        const child = nodeMap.get(childId);
        if (!child || child.locked) return;
        const [cx, cy, cw, ch] = child.xywh;
        updates.push({ id: child.id, xywh: [cx + dx, cy + dy, cw, ch] });
      });
      return;
    }
    updates.push({ id: layoutNode.id, xywh: [nextX, nextY, w, h] });
  });

  return updates;
}

/** Return the center point of a rectangle. */
function getRectCenter(rect: RectTuple): [number, number] {
  return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2];
}

/** Return the minimum axis value for layout. */
function getAxisMin(
  layoutNodes: Map<string, LayoutNode>,
  direction: LayoutDirection
): number {
  let min = Infinity;
  layoutNodes.forEach(node => {
    const value = getPrimaryAxis(node.xywh, direction);
    if (value < min) min = value;
  });
  return Number.isFinite(min) ? min : 0;
}

/** Compute the primary axis value based on layout direction. */
function getPrimaryAxis(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[0] : rect[1];
}

/** Compute the secondary axis value based on layout direction. */
function getSecondaryAxis(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[1] : rect[0];
}

/** Approximate a layer index from the current position. */
function getApproxLayer(
  rect: RectTuple,
  direction: LayoutDirection,
  axisMin: number
): number {
  const axis = getPrimaryAxis(rect, direction);
  return Math.round((axis - axisMin) / LAYER_GAP);
}

/** Break cycles and return an acyclic order. */
function buildAcyclicOrder(
  nodeIds: string[],
  edges: LayoutEdge[]
): { order: string[]; edges: LayoutEdge[] } {
  let edgesLeft = [...edges];
  while (true) {
    const { order, remaining } = topoSort(nodeIds, edgesLeft);
    if (order.length === nodeIds.length) {
      return { order, edges: edgesLeft };
    }
    const remainingSet = new Set(remaining);
    const cycleEdges = edgesLeft.filter(
      edge => remainingSet.has(edge.from) && remainingSet.has(edge.to)
    );
    if (cycleEdges.length === 0) {
      return { order: nodeIds, edges: edgesLeft };
    }
    const weakest = cycleEdges.reduce((minEdge, edge) =>
      edge.weight < minEdge.weight ? edge : minEdge
    );
    edgesLeft = edgesLeft.filter(edge => edge !== weakest);
    if (edgesLeft.length === 0) {
      return { order: nodeIds, edges: [] };
    }
  }
}

/** Topological sort helper that reports remaining nodes. */
function topoSort(
  nodeIds: string[],
  edges: LayoutEdge[]
): { order: string[]; remaining: string[] } {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, LayoutEdge[]>();
  nodeIds.forEach(id => {
    indegree.set(id, 0);
    outgoing.set(id, []);
  });
  edges.forEach(edge => {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge);
  });

  const queue = nodeIds.filter(id => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    order.push(id);
    const edgesOut = outgoing.get(id) ?? [];
    edgesOut.forEach(edge => {
      const next = (indegree.get(edge.to) ?? 0) - 1;
      indegree.set(edge.to, next);
      if (next === 0) queue.push(edge.to);
    });
  }

  const remaining = nodeIds.filter(id => !order.includes(id));
  return { order, remaining };
}

/** Assign layers with fixed anchors for locked nodes. */
function assignLayers(
  nodeIds: string[],
  order: string[],
  edges: LayoutEdge[],
  fixedLayers: Map<string, number>,
  layoutNodes: Map<string, LayoutNode>,
  direction: LayoutDirection,
  axisMin: number
): Map<string, number> {
  const layer = new Map<string, number>();
  fixedLayers.forEach((value, key) => layer.set(key, value));

  const incoming = new Map<string, LayoutEdge[]>();
  nodeIds.forEach(id => incoming.set(id, []));
  edges.forEach(edge => incoming.get(edge.to)?.push(edge));

  order.forEach(id => {
    if (layer.has(id)) return;
    const preds = incoming.get(id) ?? [];
    let maxPred = -1;
    preds.forEach(edge => {
      const predLayer = layer.get(edge.from);
      if (predLayer !== undefined) {
        maxPred = Math.max(maxPred, predLayer);
      }
    });
    layer.set(id, maxPred >= 0 ? maxPred + 1 : 0);
  });

  nodeIds.forEach(id => {
    if (layer.has(id)) return;
    // 逻辑：孤立节点使用当前位置的近似层级，避免布局完全打散。
    const rect = layoutNodes.get(id)?.xywh;
    if (!rect) return;
    layer.set(id, getApproxLayer(rect, direction, axisMin));
  });

  return layer;
}

/** Reorder a layer based on neighbor barycenters. */
function reorderLayer(
  current: string[],
  neighbor: string[],
  edges: LayoutEdge[],
  layoutNodes: Map<string, LayoutNode>,
  direction: "forward" | "backward"
): string[] {
  if (current.length <= 1) return current;
  const neighborIndex = new Map<string, number>();
  neighbor.forEach((id, index) => neighborIndex.set(id, index));

  const scores = current.map(id => {
    const neighbors = edges
      .filter(edge =>
        direction === "forward"
          ? edge.to === id && neighborIndex.has(edge.from)
          : edge.from === id && neighborIndex.has(edge.to)
      )
      .map(edge => (direction === "forward" ? edge.from : edge.to))
      .map(nodeId => neighborIndex.get(nodeId) ?? 0);
    const barycenter =
      neighbors.length > 0
        ? neighbors.reduce((acc, value) => acc + value, 0) / neighbors.length
        : current.indexOf(id);
    return { id, barycenter };
  });

  const lockedPositions = new Map<number, string>();
  current.forEach((id, index) => {
    if (layoutNodes.get(id)?.locked) {
      lockedPositions.set(index, id);
    }
  });

  const unlocked = scores
    .filter(score => !layoutNodes.get(score.id)?.locked)
    .sort((a, b) => a.barycenter - b.barycenter);

  const nextOrder = new Array(current.length);
  lockedPositions.forEach((id, index) => {
    nextOrder[index] = id;
  });

  let cursor = 0;
  unlocked.forEach(score => {
    while (cursor < nextOrder.length && nextOrder[cursor]) {
      cursor += 1;
    }
    if (cursor < nextOrder.length) {
      nextOrder[cursor] = score.id;
      cursor += 1;
    }
  });

  return nextOrder.filter(Boolean) as string[];
}

/** Build a single-layer layout when the main algorithm cannot place nodes. */
function buildFallbackPositions(
  layoutNodes: Map<string, LayoutNode>,
  direction: LayoutDirection
): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>();
  const ids = Array.from(layoutNodes.keys()).sort((left, right) => {
    const leftRect = layoutNodes.get(left)?.xywh;
    const rightRect = layoutNodes.get(right)?.xywh;
    if (!leftRect || !rightRect) return 0;
    return getPrimaryAxis(leftRect, direction) - getPrimaryAxis(rightRect, direction);
  });
  const minSecondary = ids
    .map(id => layoutNodes.get(id))
    .filter((node): node is LayoutNode => Boolean(node))
    .reduce((min, node) => Math.min(min, getSecondaryAxis(node.xywh, direction)), Infinity);
  const secondary = Number.isFinite(minSecondary) ? minSecondary : 0;
  let cursor = ids
    .map(id => layoutNodes.get(id))
    .filter((node): node is LayoutNode => Boolean(node))
    .reduce((min, node) => Math.min(min, getPrimaryAxis(node.xywh, direction)), Infinity);
  if (!Number.isFinite(cursor)) cursor = 0;

  ids.forEach(id => {
    const node = layoutNodes.get(id);
    if (!node) return;
    const [x, y, w, h] = node.xywh;
    if (node.locked) {
      positions.set(id, [x, y]);
      const size = direction === "horizontal" ? w : h;
      cursor = Math.max(cursor, getPrimaryAxis(node.xywh, direction) + size + NODE_GAP);
      return;
    }
    const nextX = direction === "horizontal" ? cursor : secondary;
    const nextY = direction === "horizontal" ? secondary : cursor;
    positions.set(id, [nextX, nextY]);
    const size = direction === "horizontal" ? w : h;
    cursor += size + NODE_GAP;
  });

  return positions;
}

/** Return secondary span occupied by a node. */
function getSpan(
  rect: RectTuple,
  direction: LayoutDirection
): { start: number; end: number } {
  const start = getSecondaryAxis(rect, direction);
  const size = direction === "horizontal" ? rect[3] : rect[2];
  return { start, end: start + size };
}

/** Find a secondary axis position that avoids locked spans. */
function findNextAvailable(
  start: number,
  size: number,
  spans: Array<{ start: number; end: number }>
): number {
  let cursor = start;
  for (const span of spans) {
    if (cursor + size <= span.start) return cursor;
    if (cursor >= span.end) continue;
    cursor = span.end + NODE_GAP;
  }
  return cursor;
}
