/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasConnectorElement, CanvasElement, CanvasNodeElement } from "./types"
import { STROKE_NODE_TYPE } from "./types"
import { getNodeGroupId, isGroupNodeType } from "./grouping"

export type AutoLayoutUpdate = {
  /** Element id to update. */
  id: string
  /** New xywh rectangle. */
  xywh: [number, number, number, number]
}

type LayoutDirection = "horizontal" | "vertical"

type LayoutEdge = {
  /** Source layout node id. */
  from: string
  /** Target layout node id. */
  to: string
  /** Edge weight used for cycle breaking. */
  weight: number
}

type LayoutNode = {
  /** Layout node id (group id or node id). */
  id: string
  /** Current bounds of the layout node. */
  xywh: [number, number, number, number]
  /** Whether this layout node is fixed. */
  locked: boolean
  /** Created timestamp used for ordering. */
  createdAt: number
  /** Whether this layout node represents a group. */
  isGroup: boolean
  /** Child node ids when representing a group. */
  childIds: string[]
}

type RectTuple = [number, number, number, number]

// ─── Layout Constants ──────────────────────────────────────────────
const LAYER_GAP = 200
const NODE_GAP = 80
const COMPONENT_GAP = 160
const DIRECTION_THRESHOLD = 1.3
const BARYCENTER_PASSES = 6
const PARTIAL_FIT_PADDING = 40
const GRID_SNAP = 16
const UNLINKED_NODE_GAP = 12
const UNLINKED_CLUSTER_PADDING = 200

// ─── Node Filtering ────────────────────────────────────────────────

/** Check if a node should be excluded from auto layout. */
function isExcludedNode(node: CanvasNodeElement): boolean {
  if (node.type === STROKE_NODE_TYPE) return true
  const meta = node.meta as Record<string, unknown> | undefined
  if (meta?.mindmapGhost) return true
  if (meta?.mindmapHidden) return true
  return false
}

// ─── Snap Helper ───────────────────────────────────────────────────

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SNAP) * GRID_SNAP
}

// ─── Core Shared Helpers ───────────────────────────────────────────

/** Build layout nodes and edges from raw elements, shared by full and partial layout. */
function buildLayoutGraph(elements: CanvasElement[]): {
  layoutNodes: Map<string, LayoutNode>
  edges: LayoutEdge[]
  linkedIds: Set<string>
  nodeMap: Map<string, CanvasNodeElement>
} {
  const nodes = elements.filter(
    (element): element is CanvasNodeElement =>
      element.kind === "node" && !isExcludedNode(element as CanvasNodeElement),
  )
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const groupNodeMap = new Map(
    nodes.filter((node) => isGroupNodeType(node.type)).map((node) => [node.id, node]),
  )
  const groupMembersMap = new Map<string, string[]>()
  const groupChildToGroupId = new Map<string, string>()
  nodes.forEach((node) => {
    const groupId = getNodeGroupId(node)
    if (!groupId || !groupNodeMap.has(groupId)) return
    const bucket = groupMembersMap.get(groupId) ?? []
    bucket.push(node.id)
    groupMembersMap.set(groupId, bucket)
  })
  groupNodeMap.forEach((groupNode) => {
    const props = groupNode.props as Record<string, unknown> | undefined
    const childIds = Array.isArray(props?.childIds)
      ? (props?.childIds ?? []).filter((id): id is string => typeof id === "string")
      : []
    if (childIds.length === 0) return
    const bucket = groupMembersMap.get(groupNode.id) ?? []
    childIds.forEach((childId) => {
      if (!bucket.includes(childId)) bucket.push(childId)
      groupChildToGroupId.set(childId, groupNode.id)
    })
    groupMembersMap.set(groupNode.id, bucket)
  })

  const resolveLayoutId = (node: CanvasNodeElement): string => {
    if (isGroupNodeType(node.type)) return node.id
    const groupId = getNodeGroupId(node)
    if (groupId && groupNodeMap.has(groupId)) return groupId
    const fallbackGroupId = groupChildToGroupId.get(node.id)
    if (fallbackGroupId && groupNodeMap.has(fallbackGroupId)) return fallbackGroupId
    return node.id
  }

  const elementOrder = new Map<string, number>()
  let elementOrderIndex = 0
  elements.forEach((element) => {
    if (element.kind !== "node") return
    elementOrder.set(element.id, elementOrderIndex)
    elementOrderIndex += 1
  })

  const getElementCreatedAt = (node: CanvasNodeElement | undefined): number => {
    const meta = node?.meta as Record<string, unknown> | undefined
    const createdAt = meta?.createdAt
    if (typeof createdAt === "number" && Number.isFinite(createdAt)) return createdAt
    if (!node) return 0
    return elementOrder.get(node.id) ?? 0
  }

  const layoutNodes = new Map<string, LayoutNode>()
  nodes.forEach((node) => {
    const layoutId = resolveLayoutId(node)
    if (layoutNodes.has(layoutId)) return
    const groupNode = groupNodeMap.get(layoutId)
    if (groupNode) {
      const childIds = groupMembersMap.get(layoutId) ?? []
      const hasLockedChild = childIds.some((childId) => nodeMap.get(childId)?.locked)
      const childCreatedAt = childIds.map((childId) => getElementCreatedAt(nodeMap.get(childId)))
      const createdAt =
        childCreatedAt.length > 0
          ? Math.max(getElementCreatedAt(groupNode), ...childCreatedAt)
          : getElementCreatedAt(groupNode)
      layoutNodes.set(layoutId, {
        id: layoutId,
        xywh: groupNode.xywh,
        locked: Boolean(groupNode.locked) || hasLockedChild,
        createdAt,
        isGroup: true,
        childIds,
      })
      return
    }
    layoutNodes.set(layoutId, {
      id: layoutId,
      xywh: node.xywh,
      locked: Boolean(node.locked),
      createdAt: getElementCreatedAt(node),
      isGroup: false,
      childIds: [],
    })
  })

  const connectors = elements.filter(
    (element): element is CanvasConnectorElement => element.kind === "connector",
  )

  const edges: LayoutEdge[] = []
  const linkedIds = new Set<string>()

  connectors.forEach((connector) => {
    if (!("elementId" in connector.source) || !("elementId" in connector.target)) return
    const sourceNode = nodeMap.get(connector.source.elementId)
    const targetNode = nodeMap.get(connector.target.elementId)
    if (!sourceNode || !targetNode) return
    const sourceId = resolveLayoutId(sourceNode)
    const targetId = resolveLayoutId(targetNode)
    if (sourceId === targetId) return
    const sourceLayout = layoutNodes.get(sourceId)
    const targetLayout = layoutNodes.get(targetId)
    if (!sourceLayout || !targetLayout) return
    const sourceCenter = getRectCenter(sourceLayout.xywh)
    const targetCenter = getRectCenter(targetLayout.xywh)
    const dx = targetCenter[0] - sourceCenter[0]
    const dy = targetCenter[1] - sourceCenter[1]
    edges.push({
      from: sourceId,
      to: targetId,
      weight: Math.abs(dx) + Math.abs(dy),
    })
    linkedIds.add(sourceId)
    linkedIds.add(targetId)
  })

  return { layoutNodes, edges, linkedIds, nodeMap }
}

// ─── Direction Detection (Per-Component) ───────────────────────────

/** Detect preferred layout direction for a connected component. */
function detectComponentDirection(
  componentIds: string[],
  edges: LayoutEdge[],
  layoutNodes: Map<string, LayoutNode>,
): LayoutDirection {
  if (componentIds.length <= 2) return "horizontal"

  const componentSet = new Set(componentIds)
  const componentEdges = edges.filter(
    (edge) => componentSet.has(edge.from) && componentSet.has(edge.to),
  )

  // Find longest path in DAG for direction detection
  const { order, edges: dagEdges } = buildAcyclicOrder(componentIds, componentEdges)
  const outgoing = new Map<string, string[]>()
  order.forEach((id) => outgoing.set(id, []))
  dagEdges.forEach((edge) => {
    outgoing.get(edge.from)?.push(edge.to)
  })

  // Compute longest path distances
  const dist = new Map<string, number>()
  const pred = new Map<string, string | null>()
  order.forEach((id) => {
    dist.set(id, 0)
    pred.set(id, null)
  })
  order.forEach((id) => {
    const d = dist.get(id) ?? 0
    const targets = outgoing.get(id) ?? []
    targets.forEach((targetId) => {
      if (d + 1 > (dist.get(targetId) ?? 0)) {
        dist.set(targetId, d + 1)
        pred.set(targetId, id)
      }
    })
  })

  // Find the node with max distance (sink of longest path)
  let sinkId = order[0]
  let maxDist = 0
  dist.forEach((d, id) => {
    if (d > maxDist) {
      maxDist = d
      sinkId = id
    }
  })

  // Trace back to find source
  let sourceId = sinkId
  while (pred.get(sourceId) !== null) {
    sourceId = pred.get(sourceId)!
  }

  const sourceNode = layoutNodes.get(sourceId)
  const sinkNode = layoutNodes.get(sinkId)
  if (!sourceNode || !sinkNode || sourceId === sinkId) return "horizontal"

  const sourceCenter = getRectCenter(sourceNode.xywh)
  const sinkCenter = getRectCenter(sinkNode.xywh)
  const absDx = Math.abs(sinkCenter[0] - sourceCenter[0])
  const absDy = Math.abs(sinkCenter[1] - sourceCenter[1])

  if (absDx < 1 && absDy < 1) return "horizontal"
  const ratio = absDx / Math.max(absDy, 1)
  if (ratio >= DIRECTION_THRESHOLD) return "horizontal"
  if (1 / ratio >= DIRECTION_THRESHOLD) return "vertical"

  // Check fan pattern: if any node has 3+ outgoing, use that as hint
  for (const id of componentIds) {
    const targets = outgoing.get(id) ?? []
    if (targets.length >= 3) {
      const node = layoutNodes.get(id)
      if (!node) continue
      const center = getRectCenter(node.xywh)
      let fanDxSum = 0
      let fanDySum = 0
      targets.forEach((targetId) => {
        const targetNode = layoutNodes.get(targetId)
        if (!targetNode) return
        const targetCenter = getRectCenter(targetNode.xywh)
        fanDxSum += Math.abs(targetCenter[0] - center[0])
        fanDySum += Math.abs(targetCenter[1] - center[1])
      })
      if (fanDxSum > fanDySum * DIRECTION_THRESHOLD) return "horizontal"
      if (fanDySum > fanDxSum * DIRECTION_THRESHOLD) return "vertical"
    }
  }

  return "horizontal"
}

// ─── Sugiyama Layout for a Single Component ────────────────────────

/** Layout a single connected component using improved Sugiyama algorithm. */
function layoutComponent(
  componentIds: string[],
  componentEdges: LayoutEdge[],
  componentNodes: Map<string, LayoutNode>,
  direction: LayoutDirection,
  layoutPositions: Map<string, [number, number]>,
): void {
  if (componentIds.length < 2) return

  const { order, edges: dagEdges } = buildAcyclicOrder(componentIds, componentEdges)
  const axisMin = getAxisMin(componentNodes, direction)
  const fixedLayers = new Map<string, number>()
  componentNodes.forEach((node) => {
    if (!node.locked) return
    fixedLayers.set(node.id, getApproxLayer(node.xywh, direction, axisMin))
  })

  const layers = assignLayers(
    componentIds,
    order,
    dagEdges,
    fixedLayers,
    componentNodes,
    direction,
    axisMin,
  )
  const layerMap = new Map<number, string[]>()
  layers.forEach((layer, nodeId) => {
    const bucket = layerMap.get(layer) ?? []
    bucket.push(nodeId)
    layerMap.set(layer, bucket)
  })

  const layerIndices = Array.from(layerMap.keys()).sort((a, b) => a - b)
  const layerOrders = new Map<number, string[]>()
  layerIndices.forEach((layer) => {
    const ids = layerMap.get(layer) ?? []
    const ordered = [...ids].sort((left, right) => {
      const leftCreatedAt = componentNodes.get(left)?.createdAt ?? 0
      const rightCreatedAt = componentNodes.get(right)?.createdAt ?? 0
      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt
      }
      const leftRect = componentNodes.get(left)?.xywh
      const rightRect = componentNodes.get(right)?.xywh
      if (!leftRect || !rightRect) return 0
      return getSecondaryAxis(leftRect, direction) - getSecondaryAxis(rightRect, direction)
    })
    layerOrders.set(layer, ordered)
  })

  // Barycenter ordering with adjacent swap improvement
  for (let pass = 0; pass < BARYCENTER_PASSES; pass += 1) {
    // Forward pass
    for (let i = 1; i < layerIndices.length; i += 1) {
      const current = layerIndices[i]
      const prev = layerIndices[i - 1]
      const nextOrder = reorderLayer(
        layerOrders.get(current) ?? [],
        layerOrders.get(prev) ?? [],
        dagEdges,
        componentNodes,
        "forward",
      )
      layerOrders.set(current, nextOrder)
    }
    // Backward pass
    for (let i = layerIndices.length - 2; i >= 0; i -= 1) {
      const current = layerIndices[i]
      const next = layerIndices[i + 1]
      const nextOrder = reorderLayer(
        layerOrders.get(current) ?? [],
        layerOrders.get(next) ?? [],
        dagEdges,
        componentNodes,
        "backward",
      )
      layerOrders.set(current, nextOrder)
    }
    // Adjacent swap pass to reduce crossings
    layerIndices.forEach((layer) => {
      const ids = layerOrders.get(layer)
      if (!ids || ids.length < 2) return
      let improved = true
      while (improved) {
        improved = false
        for (let j = 0; j < ids.length - 1; j += 1) {
          if (componentNodes.get(ids[j])?.locked || componentNodes.get(ids[j + 1])?.locked) {
            continue
          }
          const crossBefore = countCrossings(ids, j, j + 1, dagEdges, layerOrders, layers)
          const crossAfter = countCrossingsSwapped(ids, j, j + 1, dagEdges, layerOrders, layers)
          if (crossAfter < crossBefore) {
            const tmp = ids[j]
            ids[j] = ids[j + 1]
            ids[j + 1] = tmp
            improved = true
          }
        }
      }
    })
  }

  // Compute primary positions with adaptive gap
  const incomingMap = buildIncomingMap(componentNodes, dagEdges)
  const primaryPositions = computeAdaptivePrimaryPositions(
    order,
    incomingMap,
    componentNodes,
    direction,
  )

  // Compute secondary positions with size awareness
  const outgoingMap = buildOutgoingMap(componentNodes, dagEdges)
  const resolveSubtreeSpan = createSubtreeSecondarySpanResolver(
    componentNodes,
    outgoingMap,
    direction,
    layoutPositions,
  )
  const resolveSubtreeSize = (id: string): number => {
    const span = resolveSubtreeSpan(id)
    return Math.max(0, span.end - span.start)
  }
  const resolveEffectiveSize = (id: string, node: LayoutNode | undefined): number => {
    if (!node) return 0
    const nodeSize = direction === "horizontal" ? node.xywh[3] : node.xywh[2]
    const childCount = (outgoingMap.get(id) ?? []).length
    if (childCount === 0) return nodeSize
    const subtreeSize = resolveSubtreeSize(id)
    return Math.max(nodeSize, subtreeSize)
  }
  const resolveEffectiveSpan = (id: string, node: LayoutNode | undefined) => {
    if (!node) return { start: 0, end: 0 }
    const rect = getRectWithPosition(id, node, layoutPositions)
    const center = getSecondaryCenter(rect, direction)
    const size = resolveEffectiveSize(id, node)
    return { start: center - size / 2, end: center + size / 2 }
  }

  const layoutSecondary = () => {
    layerIndices.forEach((layer) => {
      const ids = layerOrders.get(layer) ?? []
      if (ids.length === 0) return

      const lockedSpans = ids
        .map((id) => componentNodes.get(id))
        .filter((node): node is LayoutNode => Boolean(node?.locked))
        .map((node) => resolveEffectiveSpan(node.id, node))
        .sort((a, b) => a.start - b.start)

      if (lockedSpans.length > 0) {
        let cursor = ids
          .map((id) => componentNodes.get(id))
          .filter((node): node is LayoutNode => Boolean(node))
          .reduce(
            (min, node) => Math.min(min, getSecondaryAxis(node.xywh, direction)),
            Infinity,
          )
        if (!Number.isFinite(cursor)) cursor = 0
        ids.forEach((id) => {
          const node = componentNodes.get(id)
          if (!node) return
          const [x, y, w, h] = node.xywh
          if (node.locked) {
            layoutPositions.set(id, [x, y])
            const span = resolveEffectiveSpan(id, node)
            cursor = Math.max(cursor, span.end + NODE_GAP)
            return
          }
          const size = resolveEffectiveSize(id, node)
          const placedSecondary = findNextAvailable(cursor, size, lockedSpans)
          const axis = primaryPositions.get(id) ?? getPrimaryAxis(node.xywh, direction)
          const nodeSize = direction === "horizontal" ? h : w
          const centeredSecondary = placedSecondary + (size - nodeSize) / 2
          const nextX = direction === "horizontal" ? axis : centeredSecondary
          const nextY = direction === "horizontal" ? centeredSecondary : axis
          layoutPositions.set(id, [nextX, nextY])
          cursor = placedSecondary + size + NODE_GAP
        })
        return
      }

      const desiredCenters = computeDesiredCentersForLayer(
        ids,
        componentNodes,
        incomingMap,
        direction,
        layoutPositions,
      )
      const grouped = groupByPrimaryParent(ids, incomingMap, desiredCenters)
      grouped.forEach((group) => {
        if (group.length === 0) return
        const parentId = (incomingMap.get(group[0]) ?? [])[0]
        const parentNode = parentId ? componentNodes.get(parentId) : undefined
        const parentCenter = parentNode
          ? getSecondaryCenterWithPosition(parentId, parentNode, layoutPositions, direction)
          : (desiredCenters.get(group[0]) ?? 0)

        // Size-aware: compute total span using actual node sizes
        const sizes = group.map((id) => resolveEffectiveSize(id, componentNodes.get(id)))
        const totalSize =
          sizes.reduce((acc, value) => acc + value, 0) +
          NODE_GAP * Math.max(group.length - 1, 0)
        let cursor = parentCenter - totalSize / 2

        group.forEach((id, index) => {
          const node = componentNodes.get(id)
          if (!node || node.locked) return
          const size = sizes[index] ?? 0
          const axis = primaryPositions.get(id) ?? getPrimaryAxis(node.xywh, direction)
          const nodeSize = direction === "horizontal" ? node.xywh[3] : node.xywh[2]
          const centeredSecondary = cursor + (size - nodeSize) / 2
          const nextX = direction === "horizontal" ? axis : centeredSecondary
          const nextY = direction === "horizontal" ? centeredSecondary : axis
          layoutPositions.set(id, [nextX, nextY])
          cursor += size + NODE_GAP
        })
      })

      // Overlap resolution for sibling groups in the same layer
      resolveLayerOverlaps(ids, componentNodes, layoutPositions, direction)
    })
  }

  layoutSecondary()
  layoutSecondary()

  // Re-center to original secondary center
  const originalCenter = computeComponentSecondaryCenter(
    componentIds,
    componentNodes,
    direction,
  )
  const nextCenter = computeComponentSecondaryCenter(
    componentIds,
    componentNodes,
    direction,
    layoutPositions,
  )
  if (Number.isFinite(originalCenter) && Number.isFinite(nextCenter)) {
    const delta = originalCenter - nextCenter
    if (Math.abs(delta) > 0.1) {
      componentIds.forEach((nodeId) => {
        const node = componentNodes.get(nodeId)
        if (!node) return
        const pos = layoutPositions.get(nodeId)
        const [x, y] = pos ?? node.xywh
        const nextX = direction === "horizontal" ? x : x + delta
        const nextY = direction === "horizontal" ? y + delta : y
        layoutPositions.set(nodeId, [nextX, nextY])
      })
    }
  }
}

/** Resolve overlaps between nodes in the same layer by pushing apart from center. */
function resolveLayerOverlaps(
  ids: string[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
  direction: LayoutDirection,
): void {
  if (ids.length < 2) return
  const items = ids
    .map((id) => {
      const node = layoutNodes.get(id)
      if (!node) return null
      const pos = layoutPositions.get(id)
      const [x, y, w, h] = node.xywh
      const px = pos ? pos[0] : x
      const py = pos ? pos[1] : y
      const secStart = direction === "horizontal" ? py : px
      const secSize = direction === "horizontal" ? h : w
      return { id, secStart, secSize, px, py }
    })
    .filter(Boolean) as Array<{
    id: string
    secStart: number
    secSize: number
    px: number
    py: number
  }>

  items.sort((a, b) => a.secStart - b.secStart)

  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1]
    const curr = items[i]
    const overlap = prev.secStart + prev.secSize + NODE_GAP - curr.secStart
    if (overlap > 0) {
      curr.secStart = prev.secStart + prev.secSize + NODE_GAP
      if (direction === "horizontal") {
        layoutPositions.set(curr.id, [curr.px, curr.secStart])
      } else {
        layoutPositions.set(curr.id, [curr.secStart, curr.py])
      }
    }
  }
}

// ─── 2D Skyline Bin Packing for Global Component Arrangement ──────

type ComponentEntry = {
  id: string
  nodeIds: string[]
  locked: boolean
}

// ─── Grid-Aware Alignment for Unlinked Node Clusters ──────────────

type GridItem = { id: string; cx: number; cy: number; w: number; h: number }

/**
 * Detect existing row/column structure from node positions and snap to a clean grid.
 * A 2×2 arrangement stays 2×2; a 3×1 row stays a row, etc.
 */
function gridAlignCluster(
  clusterIds: string[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  if (clusterIds.length < 2) return

  const items: GridItem[] = []
  clusterIds.forEach((id) => {
    const node = layoutNodes.get(id)
    if (!node || node.locked) return
    const [x, y, w, h] = node.xywh
    items.push({ id, cx: x + w / 2, cy: y + h / 2, w, h })
  })
  if (items.length < 2) return

  // Original center
  let origCx = 0
  let origCy = 0
  items.forEach((item) => {
    origCx += item.cx
    origCy += item.cy
  })
  origCx /= items.length
  origCy /= items.length

  // Detect rows by clustering Y centers
  const sortedByY = [...items].sort((a, b) => a.cy - b.cy)
  const heights = items.map((i) => i.h)
  heights.sort((a, b) => a - b)
  const medianH = heights[Math.floor(heights.length / 2)]
  const rowThreshold = medianH * 0.6

  const rows: GridItem[][] = [[sortedByY[0]]]
  for (let i = 1; i < sortedByY.length; i += 1) {
    const lastRow = rows[rows.length - 1]
    const lastRowAvgY = lastRow.reduce((s, item) => s + item.cy, 0) / lastRow.length
    if (Math.abs(sortedByY[i].cy - lastRowAvgY) > rowThreshold) {
      rows.push([sortedByY[i]])
    } else {
      lastRow.push(sortedByY[i])
    }
  }

  // Sort each row by X
  rows.forEach((row) => row.sort((a, b) => a.cx - b.cx))

  // Compute per-column max width (not global max — avoids one wide node stretching all columns)
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const colWidths: number[] = new Array(maxCols).fill(0)
  rows.forEach((row) => {
    row.forEach((item, col) => {
      colWidths[col] = Math.max(colWidths[col], item.w)
    })
  })

  // Place nodes in detected grid structure
  let cursorY = 0
  rows.forEach((row) => {
    const rowMaxH = row.reduce((max, item) => Math.max(max, item.h), 0)
    let cursorX = 0
    row.forEach((item, col) => {
      const colW = colWidths[col]
      const px = cursorX + (colW - item.w) / 2
      const py = cursorY + (rowMaxH - item.h) / 2
      layoutPositions.set(item.id, [px, py])
      cursorX += colW + UNLINKED_NODE_GAP
    })
    cursorY += rowMaxH + UNLINKED_NODE_GAP
  })

  // Re-center to original center
  const newRect = computeComponentRect(
    items.map((item) => item.id),
    layoutNodes,
    layoutPositions,
  )
  const newCx = newRect[0] + newRect[2] / 2
  const newCy = newRect[1] + newRect[3] / 2
  const dx = origCx - newCx
  const dy = origCy - newCy

  items.forEach((item) => {
    const pos = layoutPositions.get(item.id)
    if (!pos) return
    layoutPositions.set(item.id, [pos[0] + dx, pos[1] + dy])
  })
}

// ─── Main: Full Board Auto Layout ─────────────────────────────────

/** Compute auto layout updates for the full board. */
export function computeAutoLayoutUpdates(elements: CanvasElement[]): AutoLayoutUpdate[] {
  const { layoutNodes, edges, linkedIds, nodeMap } = buildLayoutGraph(elements)
  if (layoutNodes.size < 2) return []

  const layoutPositions = new Map<string, [number, number]>()
  const linkedLayoutNodes = new Map<string, LayoutNode>()
  const unlinkedLayoutNodes = new Map<string, LayoutNode>()
  layoutNodes.forEach((node, id) => {
    if (linkedIds.has(id)) {
      linkedLayoutNodes.set(id, node)
      return
    }
    unlinkedLayoutNodes.set(id, node)
  })

  const linkedEdges = edges.filter(
    (edge) => linkedIds.has(edge.from) && linkedIds.has(edge.to),
  )
  const linkedComponents = linkedEdges.length
    ? buildConnectedComponents(Array.from(linkedLayoutNodes.keys()), linkedEdges)
    : []

  // Layout each connected component with per-component direction
  if (linkedLayoutNodes.size >= 2 && linkedEdges.length > 0) {
    linkedComponents.forEach((componentIds) => {
      if (componentIds.length < 2) return
      const componentSet = new Set(componentIds)
      const componentEdges = linkedEdges.filter(
        (edge) => componentSet.has(edge.from) && componentSet.has(edge.to),
      )
      if (componentEdges.length === 0) return

      const componentNodes = new Map<string, LayoutNode>()
      componentIds.forEach((id) => {
        const node = linkedLayoutNodes.get(id)
        if (node) componentNodes.set(id, node)
      })

      // Per-component direction detection
      const direction = detectComponentDirection(componentIds, componentEdges, componentNodes)

      layoutComponent(
        componentIds,
        componentEdges,
        componentNodes,
        direction,
        layoutPositions,
      )
    })
  }

  // Unlinked nodes: grid-align multi-node clusters, keep singles in place
  const unlinkedClusters = buildUnlinkedClusters(unlinkedLayoutNodes, UNLINKED_CLUSTER_PADDING)
  unlinkedClusters.forEach((cluster) => {
    if (cluster.length < 2) return
    gridAlignCluster(cluster, unlinkedLayoutNodes, layoutPositions)
  })

  // ── Global: only resolve overlaps between groups ──
  // Each group was already laid out in-place (Sugiyama centered on original,
  // grid-align centered on original). Now just push apart any groups that overlap.
  const getRectWithLayoutPosition = (node: LayoutNode): RectTuple => {
    const pos = layoutPositions.get(node.id)
    const [x, y, w, h] = node.xywh
    return pos ? [pos[0], pos[1], w, h] : [x, y, w, h]
  }

  const componentEntries: ComponentEntry[] = []
  linkedComponents.forEach((ids, index) => {
    const locked = ids.some((id) => layoutNodes.get(id)?.locked)
    componentEntries.push({ id: `linked-${index}`, nodeIds: ids, locked })
  })
  unlinkedClusters.forEach((cluster, index) => {
    if (cluster.length < 2) {
      const node = unlinkedLayoutNodes.get(cluster[0])
      componentEntries.push({
        id: cluster[0],
        nodeIds: [cluster[0]],
        locked: Boolean(node?.locked),
      })
    } else {
      const locked = cluster.some((id) => unlinkedLayoutNodes.get(id)?.locked)
      componentEntries.push({
        id: `unlinked-${index}`,
        nodeIds: cluster,
        locked,
      })
    }
  })

  const componentRects = new Map<string, RectTuple>()
  componentEntries.forEach((component) => {
    const rect = computeComponentRect(component.nodeIds, layoutNodes, layoutPositions)
    componentRects.set(component.id, rect)
  })

  // Place locked groups first as immovable obstacles
  const placedRects = new Map<string, RectTuple>()
  componentEntries.forEach((component) => {
    if (!component.locked) return
    const rect = componentRects.get(component.id)
    if (rect) placedRects.set(component.id, rect)
  })

  // Process movable groups sorted by Y — push away only when overlapping
  const movableComponents = componentEntries
    .filter((c) => !c.locked)
    .sort((a, b) => {
      const ar = componentRects.get(a.id)
      const br = componentRects.get(b.id)
      if (!ar || !br) return 0
      return ar[1] - br[1]
    })

  movableComponents.forEach((component) => {
    const rect = componentRects.get(component.id)
    if (!rect) return

    // Check overlap against all already-placed groups
    const obstacles = Array.from(placedRects.values()).filter((obs) =>
      rectsIntersect(
        [rect[0] - COMPONENT_GAP / 2, rect[1] - COMPONENT_GAP / 2, rect[2] + COMPONENT_GAP, rect[3] + COMPONENT_GAP],
        obs,
      ),
    )

    if (obstacles.length === 0) {
      placedRects.set(component.id, rect)
      return
    }

    // Find minimal Y shift to clear all overlapping obstacles
    const ySpans = obstacles
      .filter((obs) =>
        spansOverlap(
          { start: rect[0], end: rect[0] + rect[2] },
          { start: obs[0], end: obs[0] + obs[2] },
        ),
      )
      .map((obs) => ({
        start: obs[1] - COMPONENT_GAP,
        end: obs[1] + obs[3] + COMPONENT_GAP,
      }))

    const resolved = resolveSecondaryPosition(rect[1], rect[3], ySpans)
    if (Math.abs(resolved - rect[1]) < 1) {
      placedRects.set(component.id, rect)
      return
    }
    const dy = resolved - rect[1]
    component.nodeIds.forEach((nodeId) => {
      const node = layoutNodes.get(nodeId)
      if (!node || node.locked) return
      const [x, y] = getRectWithLayoutPosition(node)
      layoutPositions.set(nodeId, [x, y + dy])
    })
    const nextRect: RectTuple = [rect[0], resolved, rect[2], rect[3]]
    componentRects.set(component.id, nextRect)
    placedRects.set(component.id, nextRect)
  })

  // Build final updates with grid snapping
  const updates: AutoLayoutUpdate[] = []
  layoutNodes.forEach((layoutNode) => {
    if (layoutNode.locked) return
    const nextPos = layoutPositions.get(layoutNode.id)
    if (!nextPos) return
    const [nextX, nextY] = [snapToGrid(nextPos[0]), snapToGrid(nextPos[1])]
    const [x, y, w, h] = layoutNode.xywh
    if (layoutNode.isGroup) {
      const dx = nextX - x
      const dy = nextY - y
      updates.push({ id: layoutNode.id, xywh: [nextX, nextY, w, h] })
      layoutNode.childIds.forEach((childId) => {
        const child = nodeMap.get(childId)
        if (!child || child.locked) return
        const [cx, cy, cw, ch] = child.xywh
        updates.push({ id: child.id, xywh: [snapToGrid(cx + dx), snapToGrid(cy + dy), cw, ch] })
      })
      return
    }
    updates.push({ id: layoutNode.id, xywh: [nextX, nextY, w, h] })
  })

  return updates
}

// ─── Partial Layout for Selection ──────────────────────────────────

/**
 * Compute layout updates for selected nodes only.
 *
 * Key principle: **preserve user's spatial structure**.
 * - Nodes with connectors: run Sugiyama but fit result back to original region.
 * - Nodes without connectors: detect row/column structure, snap to clean grid in-place.
 * - Final result stays centered on the original selection center.
 */
export function computePartialLayoutUpdates(
  allElements: CanvasElement[],
  selectedNodeIds: Set<string>,
): AutoLayoutUpdate[] {
  const selectedNodes = allElements.filter(
    (element): element is CanvasNodeElement =>
      element.kind === "node" && selectedNodeIds.has(element.id) && !isExcludedNode(element),
  )
  if (selectedNodes.length < 2) return []

  // Collect internal connectors
  const internalConnectors = allElements.filter(
    (element): element is CanvasConnectorElement =>
      element.kind === "connector" &&
      "elementId" in element.source &&
      "elementId" in element.target &&
      selectedNodeIds.has(element.source.elementId) &&
      selectedNodeIds.has(element.target.elementId),
  )

  // Split into linked and unlinked sets
  const linkedNodeIds = new Set<string>()
  internalConnectors.forEach((connector) => {
    if ("elementId" in connector.source) linkedNodeIds.add(connector.source.elementId)
    if ("elementId" in connector.target) linkedNodeIds.add(connector.target.elementId)
  })

  const linkedNodes = selectedNodes.filter((n) => linkedNodeIds.has(n.id))
  const unlinkedNodes = selectedNodes.filter((n) => !linkedNodeIds.has(n.id))

  const allUpdates: AutoLayoutUpdate[] = []

  // ── Handle linked nodes: Sugiyama, then fit back to original region ──
  if (linkedNodes.length >= 2 && internalConnectors.length > 0) {
    const origRect = computeNodesBounds(linkedNodes)

    const subElements: CanvasElement[] = [...linkedNodes, ...internalConnectors]
    const updates = computeAutoLayoutUpdates(subElements)

    if (updates.length > 0) {
      const fitted = fitUpdatesToRegion(updates, origRect)
      allUpdates.push(...fitted)
    }
  }

  // ── Handle unlinked nodes: grid-align in-place ──
  if (unlinkedNodes.length >= 2) {
    const layoutPositions = new Map<string, [number, number]>()
    const layoutNodes = new Map<string, LayoutNode>()
    unlinkedNodes.forEach((node) => {
      layoutNodes.set(node.id, {
        id: node.id,
        xywh: node.xywh,
        locked: Boolean(node.locked),
        createdAt: 0,
        isGroup: false,
        childIds: [],
      })
    })
    gridAlignCluster(
      unlinkedNodes.map((n) => n.id),
      layoutNodes,
      layoutPositions,
    )
    unlinkedNodes.forEach((node) => {
      const pos = layoutPositions.get(node.id)
      if (!pos) return
      const [, , w, h] = node.xywh
      allUpdates.push({
        id: node.id,
        xywh: [snapToGrid(pos[0]), snapToGrid(pos[1]), w, h],
      })
    })
  } else if (unlinkedNodes.length === 1) {
    // Single unlinked node: don't move it
  }

  if (allUpdates.length === 0) return []

  // ── Collision avoidance with non-selected nodes ──
  const nonSelectedNodes = allElements.filter(
    (element): element is CanvasNodeElement =>
      element.kind === "node" && !selectedNodeIds.has(element.id) && !isExcludedNode(element),
  )

  if (nonSelectedNodes.length > 0) {
    const resultRect = computeBoundsFromUpdates(allUpdates)
    let hasCollision = false
    for (const node of nonSelectedNodes) {
      if (rectsIntersect(resultRect, node.xywh)) {
        hasCollision = true
        break
      }
    }

    if (hasCollision) {
      const shifts = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      const step = GRID_SNAP * 4
      for (let dist = step; dist < 2000; dist += step) {
        for (const [sx, sy] of shifts) {
          const dx = sx * dist
          const dy = sy * dist
          const testRect: RectTuple = [
            resultRect[0] + dx,
            resultRect[1] + dy,
            resultRect[2],
            resultRect[3],
          ]
          let collides = false
          for (const node of nonSelectedNodes) {
            if (rectsIntersect(testRect, node.xywh)) {
              collides = true
              break
            }
          }
          if (!collides) {
            return allUpdates.map((u) => ({
              id: u.id,
              xywh: [
                snapToGrid(u.xywh[0] + dx),
                snapToGrid(u.xywh[1] + dy),
                u.xywh[2],
                u.xywh[3],
              ] as [number, number, number, number],
            }))
          }
        }
      }
    }
  }

  return allUpdates
}

/** Compute bounding box of raw nodes. */
function computeNodesBounds(nodes: CanvasNodeElement[]): RectTuple {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  nodes.forEach((node) => {
    const [x, y, w, h] = node.xywh
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  })
  if (!Number.isFinite(minX)) return [0, 0, 0, 0]
  return [minX, minY, maxX - minX, maxY - minY]
}

/** Fit layout updates back to the original region (center + optional scale-down). */
function fitUpdatesToRegion(
  updates: AutoLayoutUpdate[],
  origRect: RectTuple,
): AutoLayoutUpdate[] {
  const newRect = computeBoundsFromUpdates(updates)
  const origCx = origRect[0] + origRect[2] / 2
  const origCy = origRect[1] + origRect[3] / 2
  const newCx = newRect[0] + newRect[2] / 2
  const newCy = newRect[1] + newRect[3] / 2

  // Scale down only if new layout is significantly larger than original
  let scale = 1
  if (
    newRect[2] > origRect[2] + PARTIAL_FIT_PADDING * 2 ||
    newRect[3] > origRect[3] + PARTIAL_FIT_PADDING * 2
  ) {
    const scaleX = origRect[2] > 0 ? origRect[2] / newRect[2] : 1
    const scaleY = origRect[3] > 0 ? origRect[3] / newRect[3] : 1
    scale = Math.min(scaleX, scaleY, 1)
  }

  return updates.map((update) => {
    const [x, y, w, h] = update.xywh
    const relX = (x - newCx) * scale
    const relY = (y - newCy) * scale
    return {
      id: update.id,
      xywh: [
        snapToGrid(origCx + relX),
        snapToGrid(origCy + relY),
        w,
        h,
      ] as [number, number, number, number],
    }
  })
}

function computeBoundsFromUpdates(updates: AutoLayoutUpdate[]): RectTuple {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  updates.forEach((u) => {
    const [x, y, w, h] = u.xywh
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  })
  if (!Number.isFinite(minX)) return [0, 0, 0, 0]
  return [minX, minY, maxX - minX, maxY - minY]
}

// ─── Crossing Count Helpers (for adjacent swap) ────────────────────

function countCrossings(
  ids: string[],
  i: number,
  j: number,
  edges: LayoutEdge[],
  layerOrders: Map<number, string[]>,
  layers: Map<string, number>,
): number {
  const a = ids[i]
  const b = ids[j]
  const layerA = layers.get(a)
  if (layerA === undefined) return 0

  let crossings = 0
  // Check crossings with adjacent layers
  for (const [, order] of layerOrders) {
    if (order.includes(a) || order.includes(b)) continue
    const posA = getEdgePositions(a, order, edges)
    const posB = getEdgePositions(b, order, edges)
    for (const pa of posA) {
      for (const pb of posB) {
        // i < j but pa > pb means crossing
        if (pa > pb) crossings += 1
      }
    }
  }
  return crossings
}

function countCrossingsSwapped(
  ids: string[],
  i: number,
  j: number,
  edges: LayoutEdge[],
  layerOrders: Map<number, string[]>,
  layers: Map<string, number>,
): number {
  const a = ids[i]
  const b = ids[j]
  const layerA = layers.get(a)
  if (layerA === undefined) return 0

  let crossings = 0
  for (const [, order] of layerOrders) {
    if (order.includes(a) || order.includes(b)) continue
    const posA = getEdgePositions(a, order, edges)
    const posB = getEdgePositions(b, order, edges)
    for (const pa of posA) {
      for (const pb of posB) {
        // After swap: j < i (b before a), so pb > pa means crossing
        if (pb > pa) crossings += 1
      }
    }
  }
  return crossings
}

function getEdgePositions(
  nodeId: string,
  neighborOrder: string[],
  edges: LayoutEdge[],
): number[] {
  const positions: number[] = []
  edges.forEach((edge) => {
    let neighborId: string | null = null
    if (edge.from === nodeId) neighborId = edge.to
    if (edge.to === nodeId) neighborId = edge.from
    if (!neighborId) return
    const pos = neighborOrder.indexOf(neighborId)
    if (pos >= 0) positions.push(pos)
  })
  return positions
}

// ─── Adaptive Primary Positions ────────────────────────────────────

/** Compute primary axis positions with adaptive gap based on node sizes. */
function computeAdaptivePrimaryPositions(
  order: string[],
  incomingMap: Map<string, string[]>,
  layoutNodes: Map<string, LayoutNode>,
  direction: LayoutDirection,
): Map<string, number> {
  const positions = new Map<string, number>()
  order.forEach((id) => {
    const node = layoutNodes.get(id)
    if (!node) return
    const currentAxis = getPrimaryAxis(node.xywh, direction)
    if (node.locked) {
      positions.set(id, currentAxis)
      return
    }
    const preds = incomingMap.get(id) ?? []
    let maxAxis = -Infinity
    preds.forEach((predId) => {
      const pred = layoutNodes.get(predId)
      if (!pred) return
      const predAxis = positions.get(predId) ?? getPrimaryAxis(pred.xywh, direction)
      const predSize = getPrimarySize(pred.xywh, direction)
      // Adaptive gap: wider nodes get more space after them
      const adaptiveGap = Math.max(LAYER_GAP, predSize * 0.4 + LAYER_GAP * 0.6)
      maxAxis = Math.max(maxAxis, predAxis + predSize + adaptiveGap)
    })
    positions.set(id, Number.isFinite(maxAxis) ? maxAxis : currentAxis)
  })
  return positions
}

// ─── Utility Functions (preserved from original) ───────────────────

function getRectCenter(rect: RectTuple): [number, number] {
  return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2]
}

function getAxisMin(layoutNodes: Map<string, LayoutNode>, direction: LayoutDirection): number {
  let min = Infinity
  layoutNodes.forEach((node) => {
    const value = getPrimaryAxis(node.xywh, direction)
    if (value < min) min = value
  })
  return Number.isFinite(min) ? min : 0
}

function getPrimaryAxis(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[0] : rect[1]
}

function getSecondaryAxis(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[1] : rect[0]
}

function getPrimarySize(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[2] : rect[3]
}

function getSecondaryCenter(rect: RectTuple, direction: LayoutDirection): number {
  return getSecondaryAxis(rect, direction) + (direction === "horizontal" ? rect[3] : rect[2]) / 2
}

function getSecondaryCenterWithPosition(
  id: string,
  node: LayoutNode,
  layoutPositions: Map<string, [number, number]> | undefined,
  direction: LayoutDirection,
): number {
  const pos = layoutPositions?.get(id)
  if (pos) {
    const [, , w, h] = node.xywh
    return getSecondaryCenter([pos[0], pos[1], w, h], direction)
  }
  return getSecondaryCenter(node.xywh, direction)
}

function getApproxLayer(
  rect: RectTuple,
  direction: LayoutDirection,
  axisMin: number,
): number {
  const axis = getPrimaryAxis(rect, direction)
  return Math.round((axis - axisMin) / LAYER_GAP)
}

function buildAcyclicOrder(
  nodeIds: string[],
  edges: LayoutEdge[],
): { order: string[]; edges: LayoutEdge[] } {
  let edgesLeft = [...edges]
  while (true) {
    const { order, remaining } = topoSort(nodeIds, edgesLeft)
    if (order.length === nodeIds.length) {
      return { order, edges: edgesLeft }
    }
    const remainingSet = new Set(remaining)
    const cycleEdges = edgesLeft.filter(
      (edge) => remainingSet.has(edge.from) && remainingSet.has(edge.to),
    )
    if (cycleEdges.length === 0) {
      return { order: nodeIds, edges: edgesLeft }
    }
    const weakest = cycleEdges.reduce((minEdge, edge) =>
      edge.weight < minEdge.weight ? edge : minEdge,
    )
    edgesLeft = edgesLeft.filter((edge) => edge !== weakest)
    if (edgesLeft.length === 0) {
      return { order: nodeIds, edges: [] }
    }
  }
}

function topoSort(
  nodeIds: string[],
  edges: LayoutEdge[],
): { order: string[]; remaining: string[] } {
  const indegree = new Map<string, number>()
  const outgoing = new Map<string, LayoutEdge[]>()
  nodeIds.forEach((id) => {
    indegree.set(id, 0)
    outgoing.set(id, [])
  })
  edges.forEach((edge) => {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
    outgoing.get(edge.from)?.push(edge)
  })
  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id) break
    order.push(id)
    const edgesOut = outgoing.get(id) ?? []
    edgesOut.forEach((edge) => {
      const next = (indegree.get(edge.to) ?? 0) - 1
      indegree.set(edge.to, next)
      if (next === 0) queue.push(edge.to)
    })
  }
  const visited = new Set(order)
  const remaining = nodeIds.filter((id) => !visited.has(id))
  return { order, remaining }
}

function assignLayers(
  nodeIds: string[],
  order: string[],
  edges: LayoutEdge[],
  fixedLayers: Map<string, number>,
  layoutNodes: Map<string, LayoutNode>,
  direction: LayoutDirection,
  axisMin: number,
): Map<string, number> {
  const layer = new Map<string, number>()
  fixedLayers.forEach((value, key) => layer.set(key, value))
  const incoming = new Map<string, LayoutEdge[]>()
  nodeIds.forEach((id) => incoming.set(id, []))
  edges.forEach((edge) => incoming.get(edge.to)?.push(edge))
  order.forEach((id) => {
    if (layer.has(id)) return
    const preds = incoming.get(id) ?? []
    let maxPred = -1
    preds.forEach((edge) => {
      const predLayer = layer.get(edge.from)
      if (predLayer !== undefined) {
        maxPred = Math.max(maxPred, predLayer)
      }
    })
    layer.set(id, maxPred >= 0 ? maxPred + 1 : 0)
  })
  nodeIds.forEach((id) => {
    if (layer.has(id)) return
    const rect = layoutNodes.get(id)?.xywh
    if (!rect) return
    layer.set(id, getApproxLayer(rect, direction, axisMin))
  })
  return layer
}

function reorderLayer(
  current: string[],
  neighbor: string[],
  edges: LayoutEdge[],
  layoutNodes: Map<string, LayoutNode>,
  direction: "forward" | "backward",
): string[] {
  if (current.length <= 1) return current
  const neighborIndex = new Map<string, number>()
  neighbor.forEach((id, index) => neighborIndex.set(id, index))
  const currentIndex = new Map<string, number>()
  current.forEach((id, index) => currentIndex.set(id, index))

  const scores = current.map((id) => {
    const neighbors = edges
      .filter((edge) =>
        direction === "forward"
          ? edge.to === id && neighborIndex.has(edge.from)
          : edge.from === id && neighborIndex.has(edge.to),
      )
      .map((edge) => (direction === "forward" ? edge.from : edge.to))
      .map((nodeId) => neighborIndex.get(nodeId) ?? 0)
    const barycenter =
      neighbors.length > 0
        ? neighbors.reduce((acc, value) => acc + value, 0) / neighbors.length
        : (currentIndex.get(id) ?? 0)
    return { id, barycenter }
  })

  const lockedPositions = new Map<number, string>()
  current.forEach((id, index) => {
    if (layoutNodes.get(id)?.locked) {
      lockedPositions.set(index, id)
    }
  })

  const unlocked = scores
    .filter((score) => !layoutNodes.get(score.id)?.locked)
    .sort((a, b) => {
      if (a.barycenter !== b.barycenter) return a.barycenter - b.barycenter
      const leftCreatedAt = layoutNodes.get(a.id)?.createdAt ?? 0
      const rightCreatedAt = layoutNodes.get(b.id)?.createdAt ?? 0
      return leftCreatedAt - rightCreatedAt
    })

  const nextOrder = new Array(current.length)
  lockedPositions.forEach((id, index) => {
    nextOrder[index] = id
  })

  let cursor = 0
  unlocked.forEach((score) => {
    while (cursor < nextOrder.length && nextOrder[cursor]) {
      cursor += 1
    }
    if (cursor < nextOrder.length) {
      nextOrder[cursor] = score.id
      cursor += 1
    }
  })

  return nextOrder.filter(Boolean) as string[]
}

function buildIncomingMap(
  layoutNodes: Map<string, LayoutNode>,
  edges: LayoutEdge[],
): Map<string, string[]> {
  const incoming = new Map<string, string[]>()
  layoutNodes.forEach((_, id) => {
    incoming.set(id, [])
  })
  edges.forEach((edge) => {
    const toBucket = incoming.get(edge.to)
    if (toBucket) toBucket.push(edge.from)
  })
  return incoming
}

function buildOutgoingMap(
  layoutNodes: Map<string, LayoutNode>,
  edges: LayoutEdge[],
): Map<string, string[]> {
  const outgoing = new Map<string, string[]>()
  layoutNodes.forEach((_, id) => {
    outgoing.set(id, [])
  })
  edges.forEach((edge) => {
    const fromBucket = outgoing.get(edge.from)
    if (fromBucket) fromBucket.push(edge.to)
  })
  return outgoing
}

function getRectWithPosition(
  id: string,
  node: LayoutNode,
  layoutPositions?: Map<string, [number, number]>,
): RectTuple {
  const pos = layoutPositions?.get(id)
  const [x, y, w, h] = node.xywh
  return pos ? [pos[0], pos[1], w, h] : [x, y, w, h]
}

function createSubtreeSecondarySpanResolver(
  layoutNodes: Map<string, LayoutNode>,
  outgoing: Map<string, string[]>,
  direction: LayoutDirection,
  layoutPositions?: Map<string, [number, number]>,
): (id: string) => { start: number; end: number } {
  const cache = new Map<string, { start: number; end: number }>()
  const visiting = new Set<string>()

  const resolve = (id: string): { start: number; end: number } => {
    const cached = cache.get(id)
    if (cached) return cached
    const node = layoutNodes.get(id)
    const baseRect = node ? getRectWithPosition(id, node, layoutPositions) : [0, 0, 0, 0]
    let span = getSpan(baseRect as RectTuple, direction)
    if (visiting.has(id)) return span
    visiting.add(id)
    const targets = outgoing.get(id) ?? []
    targets.forEach((targetId) => {
      if (!layoutNodes.has(targetId)) return
      const childSpan = resolve(targetId)
      span = {
        start: Math.min(span.start, childSpan.start),
        end: Math.max(span.end, childSpan.end),
      }
    })
    visiting.delete(id)
    cache.set(id, span)
    return span
  }

  return resolve
}

function computeDesiredCentersForLayer(
  ids: string[],
  layoutNodes: Map<string, LayoutNode>,
  incoming: Map<string, string[]>,
  direction: LayoutDirection,
  layoutPositions?: Map<string, [number, number]>,
): Map<string, number> {
  const centers = new Map<string, number>()
  ids.forEach((id) => {
    const node = layoutNodes.get(id)
    if (!node) return
    const sources = incoming.get(id) ?? []
    if (sources.length === 0) {
      centers.set(id, getSecondaryCenterWithPosition(id, node, layoutPositions, direction))
      return
    }
    let sum = 0
    let count = 0
    sources.forEach((sourceId) => {
      const source = layoutNodes.get(sourceId)
      if (!source) return
      sum += getSecondaryCenterWithPosition(sourceId, source, layoutPositions, direction)
      count += 1
    })
    centers.set(id, count > 0 ? sum / count : getSecondaryCenter(node.xywh, direction))
  })
  return centers
}

function groupByPrimaryParent(
  ids: string[],
  incoming: Map<string, string[]>,
  desiredCenters: Map<string, number>,
): string[][] {
  const groupsByParent = new Map<string, string[]>()
  ids.forEach((id) => {
    const sources = incoming.get(id) ?? []
    const parentId = sources[0] ?? `__root__${id}`
    const bucket = groupsByParent.get(parentId) ?? []
    bucket.push(id)
    groupsByParent.set(parentId, bucket)
  })

  const groups = Array.from(groupsByParent.values()).map((group) =>
    group.sort((left, right) => {
      const leftCenter = desiredCenters.get(left) ?? 0
      const rightCenter = desiredCenters.get(right) ?? 0
      if (leftCenter !== rightCenter) return leftCenter - rightCenter
      return left.localeCompare(right)
    }),
  )

  return groups.sort((left, right) => {
    const leftCenter = desiredCenters.get(left[0] ?? "") ?? 0
    const rightCenter = desiredCenters.get(right[0] ?? "") ?? 0
    return leftCenter - rightCenter
  })
}

function getSpan(
  rect: RectTuple,
  direction: LayoutDirection,
): { start: number; end: number } {
  const start = getSecondaryAxis(rect, direction)
  const size = direction === "horizontal" ? rect[3] : rect[2]
  return { start, end: start + size }
}

function computeComponentRect(
  nodeIds: string[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): RectTuple {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  nodeIds.forEach((id) => {
    const node = layoutNodes.get(id)
    if (!node) return
    const pos = layoutPositions.get(id)
    const [x, y, w, h] = node.xywh
    const rectX = pos ? pos[0] : x
    const rectY = pos ? pos[1] : y
    minX = Math.min(minX, rectX)
    minY = Math.min(minY, rectY)
    maxX = Math.max(maxX, rectX + w)
    maxY = Math.max(maxY, rectY + h)
  })
  if (!Number.isFinite(minX)) return [0, 0, 0, 0]
  return [minX, minY, maxX - minX, maxY - minY]
}

function computeComponentSecondaryCenter(
  nodeIds: string[],
  layoutNodes: Map<string, LayoutNode>,
  direction: LayoutDirection,
  layoutPositions?: Map<string, [number, number]>,
): number {
  let sum = 0
  let count = 0
  nodeIds.forEach((id) => {
    const node = layoutNodes.get(id)
    if (!node) return
    const center = getSecondaryCenterWithPosition(id, node, layoutPositions, direction)
    sum += center
    count += 1
  })
  return count > 0 ? sum / count : 0
}

function buildConnectedComponents(nodeIds: string[], edges: LayoutEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>()
  nodeIds.forEach((id) => adjacency.set(id, new Set()))
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.add(edge.to)
    adjacency.get(edge.to)?.add(edge.from)
  })
  const visited = new Set<string>()
  const components: string[][] = []
  nodeIds.forEach((id) => {
    if (visited.has(id)) return
    const queue = [id]
    const component: string[] = []
    visited.add(id)
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) break
      component.push(current)
      const neighbors = adjacency.get(current) ?? new Set()
      neighbors.forEach((neighbor) => {
        if (visited.has(neighbor)) return
        visited.add(neighbor)
        queue.push(neighbor)
      })
    }
    components.push(component)
  })
  return components
}

function spansOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.start <= right.end && left.end >= right.start
}

function buildUnlinkedClusters(
  layoutNodes: Map<string, LayoutNode>,
  padding: number,
): string[][] {
  const ids = Array.from(layoutNodes.keys())
  const visited = new Set<string>()
  const clusters: string[][] = []
  ids.forEach((id) => {
    if (visited.has(id)) return
    const cluster: string[] = []
    const queue = [id]
    visited.add(id)
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) break
      cluster.push(current)
      const currentNode = layoutNodes.get(current)
      if (!currentNode) continue
      const currentRect = expandRect(currentNode.xywh, padding)
      ids.forEach((candidateId) => {
        if (visited.has(candidateId)) return
        const candidate = layoutNodes.get(candidateId)
        if (!candidate) return
        const candidateRect = expandRect(candidate.xywh, padding)
        if (!rectsIntersect(currentRect, candidateRect)) return
        visited.add(candidateId)
        queue.push(candidateId)
      })
    }
    clusters.push(cluster)
  })
  return clusters
}

function expandRect(rect: RectTuple, padding: number): RectTuple {
  return [rect[0] - padding, rect[1] - padding, rect[2] + padding * 2, rect[3] + padding * 2]
}

function rectsIntersect(left: RectTuple, right: RectTuple): boolean {
  return (
    left[0] <= right[0] + right[2] &&
    left[0] + left[2] >= right[0] &&
    left[1] <= right[1] + right[3] &&
    left[1] + left[3] >= right[1]
  )
}

function findNextAvailable(
  start: number,
  size: number,
  spans: Array<{ start: number; end: number }>,
): number {
  let cursor = start
  for (const span of spans) {
    if (cursor + size <= span.start) return cursor
    if (cursor >= span.end) continue
    cursor = span.end + NODE_GAP
  }
  return cursor
}

function resolveSecondaryPosition(
  start: number,
  size: number,
  spans: Array<{ start: number; end: number }>,
): number {
  if (spans.length === 0) return start
  const merged = mergeSpans(spans)
  if (!intersectsAny(start, size, merged)) return start
  const candidates = [start]
  merged.forEach((span) => {
    candidates.push(span.start - size - NODE_GAP)
    candidates.push(span.end + NODE_GAP)
  })
  let best = start
  let bestDelta = Infinity
  candidates.forEach((candidate) => {
    if (!intersectsAny(candidate, size, merged)) {
      const delta = Math.abs(candidate - start)
      if (delta < bestDelta) {
        bestDelta = delta
        best = candidate
      }
    }
  })
  return best
}

function mergeSpans(
  spans: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  if (spans.length === 0) return []
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = [sorted[0]]
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
      continue
    }
    merged.push({ ...current })
  }
  return merged
}

function intersectsAny(
  start: number,
  size: number,
  spans: Array<{ start: number; end: number }>,
): boolean {
  const end = start + size
  return spans.some((span) => start <= span.end && end >= span.start)
}
