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
const NODE_GAP = 120;
const UNLINKED_CLUSTER_PADDING = 200;

/** Compute auto layout updates for the full board. */
export function computeAutoLayoutUpdates(elements: CanvasElement[]): AutoLayoutUpdate[] {
  const nodes = elements.filter((element): element is CanvasNodeElement => element.kind === "node");
  if (nodes.length < 2) return [];

  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const groupNodeMap = new Map(
    nodes.filter(node => isGroupNodeType(node.type)).map(node => [node.id, node])
  );
  const groupMembersMap = new Map<string, string[]>();
  const groupChildToGroupId = new Map<string, string>();
  nodes.forEach(node => {
    const groupId = getNodeGroupId(node);
    if (!groupId || !groupNodeMap.has(groupId)) return;
    const bucket = groupMembersMap.get(groupId) ?? [];
    bucket.push(node.id);
    groupMembersMap.set(groupId, bucket);
  });
  groupNodeMap.forEach(groupNode => {
    const props = groupNode.props as Record<string, unknown> | undefined;
    const childIds = Array.isArray(props?.childIds)
      ? (props?.childIds ?? []).filter((id): id is string => typeof id === "string")
      : [];
    if (childIds.length === 0) return;
    const bucket = groupMembersMap.get(groupNode.id) ?? [];
    childIds.forEach(childId => {
      if (!bucket.includes(childId)) bucket.push(childId);
      groupChildToGroupId.set(childId, groupNode.id);
    });
    groupMembersMap.set(groupNode.id, bucket);
  });

  const resolveLayoutId = (node: CanvasNodeElement): string => {
    if (isGroupNodeType(node.type)) return node.id;
    const groupId = getNodeGroupId(node);
    if (groupId && groupNodeMap.has(groupId)) return groupId;
    const fallbackGroupId = groupChildToGroupId.get(node.id);
    if (fallbackGroupId && groupNodeMap.has(fallbackGroupId)) return fallbackGroupId;
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
  const linkedIds = new Set<string>();
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
    linkedIds.add(sourceId);
    linkedIds.add(targetId);
  });

  const layoutPositions = new Map<string, [number, number]>();
  const linkedLayoutNodes = new Map<string, LayoutNode>();
  const unlinkedLayoutNodes = new Map<string, LayoutNode>();
  layoutNodes.forEach((node, id) => {
    if (linkedIds.has(id)) {
      linkedLayoutNodes.set(id, node);
      return;
    }
    unlinkedLayoutNodes.set(id, node);
  });
  const linkedEdges = edges.filter(edge => linkedIds.has(edge.from) && linkedIds.has(edge.to));

  const direction: LayoutDirection = dxSum >= dySum ? "horizontal" : "vertical";
  if (linkedLayoutNodes.size >= 2 && linkedEdges.length > 0) {
    const linkedIdsArray = Array.from(linkedLayoutNodes.keys());
    const linkedComponents = buildConnectedComponents(linkedIdsArray, linkedEdges);
    linkedComponents.forEach(componentIds => {
      if (componentIds.length < 2) return;
      const componentSet = new Set(componentIds);
      const componentEdges = linkedEdges.filter(
        edge => componentSet.has(edge.from) && componentSet.has(edge.to)
      );
      if (componentEdges.length === 0) return;
      const componentNodes = new Map(
        componentIds.map(id => [id, linkedLayoutNodes.get(id)]).filter(([, node]) => Boolean(node))
      ) as Map<string, LayoutNode>;
      const { order, edges: dagEdges } = buildAcyclicOrder(componentIds, componentEdges);

      const axisMin = getAxisMin(componentNodes, direction);
      const fixedLayers = new Map<string, number>();
      componentNodes.forEach(node => {
        if (!node.locked) return;
        fixedLayers.set(node.id, getApproxLayer(node.xywh, direction, axisMin));
      });

      const layers = assignLayers(
        componentIds,
        order,
        dagEdges,
        fixedLayers,
        componentNodes,
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
          const leftRect = componentNodes.get(left)?.xywh;
          const rightRect = componentNodes.get(right)?.xywh;
          if (!leftRect || !rightRect) return 0;
          return getSecondaryAxis(leftRect, direction) - getSecondaryAxis(rightRect, direction);
        });
        layerOrders.set(layer, ordered);
      });

      const layerSizes = new Map<number, number>();
      layerIndices.forEach(layer => {
        const ids = layerOrders.get(layer) ?? [];
        const size = ids
          .map(id => componentNodes.get(id))
          .filter((node): node is LayoutNode => Boolean(node))
          .reduce((max, node) => Math.max(max, getPrimarySize(node.xywh, direction)), 0);
        layerSizes.set(layer, size);
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
            componentNodes,
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
            componentNodes,
            "backward"
          );
          layerOrders.set(current, nextOrder);
        }
      }

      const layerAxis = new Map<number, number>();
      let cursor = axisMin;
      layerIndices.forEach(layer => {
        const ids = layerOrders.get(layer) ?? [];
        const size = layerSizes.get(layer) ?? 0;
        const lockedPositions = ids
          .map(id => componentNodes.get(id))
          .filter((node): node is LayoutNode => Boolean(node?.locked))
          .map(node => getPrimaryAxis(node.xywh, direction));
        if (lockedPositions.length > 0) {
          const sum = lockedPositions.reduce((acc, value) => acc + value, 0);
          const axis = sum / lockedPositions.length;
          layerAxis.set(layer, axis);
          // 逻辑：锁定层保持位置，但推进游标，避免后续层重叠。
          cursor = Math.max(cursor, axis + size + LAYER_GAP);
          return;
        }
        layerAxis.set(layer, cursor);
        cursor += size + LAYER_GAP;
      });

      const desiredCenters = getDesiredSecondaryCenters(componentNodes, componentEdges, direction);
      layerIndices.forEach(layer => {
        const ids = layerOrders.get(layer) ?? [];
        if (ids.length === 0) return;
        const axis = layerAxis.get(layer) ?? axisMin;
        const lockedSpans = ids
          .map(id => componentNodes.get(id))
          .filter((node): node is LayoutNode => Boolean(node?.locked))
          .map(node => getSpan(node.xywh, direction))
          .sort((a, b) => a.start - b.start);
        if (lockedSpans.length > 0) {
          let cursor = ids
            .map(id => componentNodes.get(id))
            .filter((node): node is LayoutNode => Boolean(node))
            .reduce((min, node) => Math.min(min, getSecondaryAxis(node.xywh, direction)), Infinity);
          if (!Number.isFinite(cursor)) cursor = 0;
          ids.forEach(id => {
            const node = componentNodes.get(id);
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
          return;
        }

        const desiredOrder = [...ids].sort((left, right) => {
          const leftCenter = desiredCenters.get(left) ?? 0;
          const rightCenter = desiredCenters.get(right) ?? 0;
          return leftCenter - rightCenter;
        });
        let secondaryCursor = -Infinity;
        desiredOrder.forEach(id => {
          const node = componentNodes.get(id);
          if (!node || node.locked) return;
          const size = direction === "horizontal" ? node.xywh[3] : node.xywh[2];
          const desiredCenter = desiredCenters.get(id) ?? getSecondaryCenter(node.xywh, direction);
          let start = desiredCenter - size / 2;
          if (Number.isFinite(secondaryCursor)) {
            start = Math.max(start, secondaryCursor + NODE_GAP);
          }
          const nextX = direction === "horizontal" ? axis : start;
          const nextY = direction === "horizontal" ? start : axis;
          layoutPositions.set(id, [nextX, nextY]);
          secondaryCursor = start + size;
        });
      });
    });
  }

  // 逻辑：无连线节点仅在靠近时对齐，不参与全局重排。
  const unlinkedClusters = buildUnlinkedClusters(unlinkedLayoutNodes, UNLINKED_CLUSTER_PADDING);
  unlinkedClusters.forEach(cluster => {
    if (cluster.length < 2) return;
    const center = getClusterSecondaryCenter(cluster, unlinkedLayoutNodes, direction);
    cluster.forEach(id => {
      const node = unlinkedLayoutNodes.get(id);
      if (!node || node.locked) return;
      const size = direction === "horizontal" ? node.xywh[3] : node.xywh[2];
      const start = center - size / 2;
      const nextX = direction === "horizontal" ? node.xywh[0] : start;
      const nextY = direction === "horizontal" ? start : node.xywh[1];
      layoutPositions.set(id, [nextX, nextY]);
    });
  });

  // 逻辑：把连通子图当作整体做全局避障，避免互相重叠。
  const getRectWithPosition = (node: LayoutNode): RectTuple => {
    const pos = layoutPositions.get(node.id);
    const [x, y, w, h] = node.xywh;
    return pos ? [pos[0], pos[1], w, h] : [x, y, w, h];
  };
  const linkedIdsArray = Array.from(linkedLayoutNodes.keys());
  const linkedComponents = linkedEdges.length
    ? buildConnectedComponents(linkedIdsArray, linkedEdges)
    : [];
  const componentEntries: Array<{ id: string; nodeIds: string[]; locked: boolean }> = [];
  linkedComponents.forEach((ids, index) => {
    const locked = ids.some(id => layoutNodes.get(id)?.locked);
    componentEntries.push({ id: `linked-${index}`, nodeIds: ids, locked });
  });
  unlinkedLayoutNodes.forEach((node, id) => {
    componentEntries.push({ id, nodeIds: [id], locked: Boolean(node.locked) });
  });

  const componentRects = new Map<string, RectTuple>();
  componentEntries.forEach(component => {
    const rect = computeComponentRect(component.nodeIds, layoutNodes, layoutPositions);
    componentRects.set(component.id, rect);
  });

  const obstacleRects = new Map<string, RectTuple>();
  componentEntries.forEach(component => {
    if (!component.locked) return;
    const rect = componentRects.get(component.id);
    if (rect) obstacleRects.set(component.id, rect);
  });

  const movableComponents = componentEntries
    .filter(component => !component.locked)
    .sort((left, right) => {
      const leftRect = componentRects.get(left.id);
      const rightRect = componentRects.get(right.id);
      if (!leftRect || !rightRect) return 0;
      return getSecondaryAxis(leftRect, direction) - getSecondaryAxis(rightRect, direction);
    });

  movableComponents.forEach(component => {
    const rect = componentRects.get(component.id);
    if (!rect) return;
    const primarySpan = getPrimarySpan(rect, direction);
    const obstacleSpans = Array.from(obstacleRects.values())
      .filter(obsRect => spansOverlap(primarySpan, getPrimarySpan(obsRect, direction)))
      .map(obsRect => getSpan(obsRect, direction));
    const preferred = getSecondaryAxis(rect, direction);
    const size = direction === "horizontal" ? rect[3] : rect[2];
    const resolved = resolveSecondaryPosition(preferred, size, obstacleSpans);
    if (resolved === preferred) {
      obstacleRects.set(component.id, rect);
      return;
    }
    const nextX = direction === "horizontal" ? rect[0] : resolved;
    const nextY = direction === "horizontal" ? resolved : rect[1];
    const deltaX = nextX - rect[0];
    const deltaY = nextY - rect[1];
    component.nodeIds.forEach(nodeId => {
      const node = layoutNodes.get(nodeId);
      if (!node) return;
      const [x, y, w, h] = getRectWithPosition(node);
      layoutPositions.set(nodeId, [x + deltaX, y + deltaY]);
    });
    const nextRect: RectTuple = [nextX, nextY, rect[2], rect[3]];
    componentRects.set(component.id, nextRect);
    obstacleRects.set(component.id, nextRect);
  });

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

/** Compute the primary size based on layout direction. */
function getPrimarySize(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[2] : rect[3];
}

/** Compute the secondary center based on layout direction. */
function getSecondaryCenter(rect: RectTuple, direction: LayoutDirection): number {
  return getSecondaryAxis(rect, direction) + (direction === "horizontal" ? rect[3] : rect[2]) / 2;
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

/** Return secondary span occupied by a node. */
function getSpan(
  rect: RectTuple,
  direction: LayoutDirection
): { start: number; end: number } {
  const start = getSecondaryAxis(rect, direction);
  const size = direction === "horizontal" ? rect[3] : rect[2];
  return { start, end: start + size };
}

/** Return primary span occupied by a node. */
function getPrimarySpan(
  rect: RectTuple,
  direction: LayoutDirection
): { start: number; end: number } {
  const start = getPrimaryAxis(rect, direction);
  const size = getPrimarySize(rect, direction);
  return { start, end: start + size };
}

/** Compute bounding rect for a component. */
function computeComponentRect(
  nodeIds: string[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>
): RectTuple {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodeIds.forEach(id => {
    const node = layoutNodes.get(id);
    if (!node) return;
    const pos = layoutPositions.get(id);
    const [x, y, w, h] = node.xywh;
    const rectX = pos ? pos[0] : x;
    const rectY = pos ? pos[1] : y;
    minX = Math.min(minX, rectX);
    minY = Math.min(minY, rectY);
    maxX = Math.max(maxX, rectX + w);
    maxY = Math.max(maxY, rectY + h);
  });
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX - minX, maxY - minY];
}

/** Build connected components from directed edges (treated as undirected). */
function buildConnectedComponents(nodeIds: string[], edges: LayoutEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>();
  nodeIds.forEach(id => adjacency.set(id, new Set()));
  edges.forEach(edge => {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  });
  const visited = new Set<string>();
  const components: string[][] = [];
  nodeIds.forEach(id => {
    if (visited.has(id)) return;
    const queue = [id];
    const component: string[] = [];
    visited.add(id);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      component.push(current);
      const neighbors = adjacency.get(current) ?? new Set();
      neighbors.forEach(neighbor => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }
    components.push(component);
  });
  return components;
}

/** Check whether two spans overlap. */
function spansOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number }
): boolean {
  return left.start <= right.end && left.end >= right.start;
}

/** Compute desired secondary centers from directional edges. */
function getDesiredSecondaryCenters(
  layoutNodes: Map<string, LayoutNode>,
  edges: LayoutEdge[],
  direction: LayoutDirection
): Map<string, number> {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  layoutNodes.forEach((_, id) => {
    incoming.set(id, []);
    outgoing.set(id, []);
  });
  edges.forEach(edge => {
    const fromBucket = outgoing.get(edge.from);
    if (fromBucket) fromBucket.push(edge.to);
    const toBucket = incoming.get(edge.to);
    if (toBucket) toBucket.push(edge.from);
  });
  const centers = new Map<string, number>();
  layoutNodes.forEach((node, id) => {
    const sources = incoming.get(id) ?? [];
    const targets = outgoing.get(id) ?? [];
    if (sources.length === 0 && targets.length === 0) {
      centers.set(id, getSecondaryCenter(node.xywh, direction));
      return;
    }
    let sum = 0;
    let count = 0;
    sources.forEach(sourceId => {
      const source = layoutNodes.get(sourceId);
      if (!source) return;
      sum += getSecondaryCenter(source.xywh, direction);
      count += 1;
    });
    targets.forEach(targetId => {
      const target = layoutNodes.get(targetId);
      if (!target) return;
      sum += getSecondaryCenter(target.xywh, direction);
      count += 1;
    });
    if (count === 0) {
      centers.set(id, getSecondaryCenter(node.xywh, direction));
      return;
    }
    centers.set(id, sum / count);
  });
  return centers;
}

/** Build clusters for unlinked nodes using expanded bounding boxes. */
function buildUnlinkedClusters(
  layoutNodes: Map<string, LayoutNode>,
  padding: number
): string[][] {
  const ids = Array.from(layoutNodes.keys());
  const visited = new Set<string>();
  const clusters: string[][] = [];

  ids.forEach(id => {
    if (visited.has(id)) return;
    const cluster: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      cluster.push(current);
      const currentNode = layoutNodes.get(current);
      if (!currentNode) continue;
      const currentRect = expandRect(currentNode.xywh, padding);
      ids.forEach(candidateId => {
        if (visited.has(candidateId)) return;
        const candidate = layoutNodes.get(candidateId);
        if (!candidate) return;
        const candidateRect = expandRect(candidate.xywh, padding);
        if (!rectsIntersect(currentRect, candidateRect)) return;
        visited.add(candidateId);
        queue.push(candidateId);
      });
    }
    clusters.push(cluster);
  });

  return clusters;
}

/** Return the average secondary center for a cluster. */
function getClusterSecondaryCenter(
  ids: string[],
  layoutNodes: Map<string, LayoutNode>,
  direction: LayoutDirection
): number {
  let sum = 0;
  let count = 0;
  ids.forEach(id => {
    const node = layoutNodes.get(id);
    if (!node) return;
    sum += getSecondaryCenter(node.xywh, direction);
    count += 1;
  });
  return count > 0 ? sum / count : 0;
}

/** Expand a rectangle by the given padding. */
function expandRect(rect: RectTuple, padding: number): RectTuple {
  return [rect[0] - padding, rect[1] - padding, rect[2] + padding * 2, rect[3] + padding * 2];
}

/** Check whether two rectangles intersect. */
function rectsIntersect(left: RectTuple, right: RectTuple): boolean {
  return (
    left[0] <= right[0] + right[2] &&
    left[0] + left[2] >= right[0] &&
    left[1] <= right[1] + right[3] &&
    left[1] + left[3] >= right[1]
  );
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

/** Resolve a secondary axis position with minimal movement. */
function resolveSecondaryPosition(
  start: number,
  size: number,
  spans: Array<{ start: number; end: number }>
): number {
  if (spans.length === 0) return start;
  const merged = mergeSpans(spans);
  if (!intersectsAny(start, size, merged)) return start;
  const candidates = [start];
  merged.forEach(span => {
    candidates.push(span.start - size - NODE_GAP);
    candidates.push(span.end + NODE_GAP);
  });
  let best = start;
  let bestDelta = Infinity;
  candidates.forEach(candidate => {
    if (!intersectsAny(candidate, size, merged)) {
      const delta = Math.abs(candidate - start);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = candidate;
      }
    }
  });
  return best;
}

/** Merge overlapping spans. */
function mergeSpans(
  spans: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  return merged;
}

/** Check whether a span intersects any blocked span. */
function intersectsAny(
  start: number,
  size: number,
  spans: Array<{ start: number; end: number }>
): boolean {
  const end = start + size;
  return spans.some(span => start <= span.end && end >= span.start);
}
