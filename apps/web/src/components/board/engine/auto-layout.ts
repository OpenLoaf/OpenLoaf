/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Auto-layout v2: Spatial Tidying algorithm.
 * Core principle: each node's final position is the "nearest tidy position" to its original.
 */
import type { CanvasConnectorElement, CanvasElement, CanvasNodeElement } from "./types"
import { STROKE_NODE_TYPE } from "./types"
import { getNodeGroupId, isGroupNodeType } from "./grouping"

// ─── Types ────────────────────────────────────────────────────────

export type AutoLayoutUpdate = {
  /** Element id to update. */
  id: string
  /** New xywh rectangle. */
  xywh: [number, number, number, number]
}

type LayoutDirection = "horizontal" | "vertical"

type LayoutEdge = {
  from: string
  to: string
  weight: number
}

type LayoutNode = {
  id: string
  xywh: [number, number, number, number]
  locked: boolean
  createdAt: number
  isGroup: boolean
  childIds: string[]
}

type RectTuple = [number, number, number, number]

type StructureType = "grid" | "row" | "column" | "scattered"

type DetectedStructure = {
  type: StructureType
  rows: string[][] // each row sorted by X
}

// ─── Constants ────────────────────────────────────────────────────

const GRID_SNAP = 16
const MIN_GAP = 40
const MIN_ROW_THRESHOLD = 60
const ROW_THRESHOLD_RATIO = 0.4
const CLUSTER_RATIO = 1.5
const CROSS_ROW_SIZE_RATIO = 3.0
const LAYER_GAP = 200
const NODE_GAP = 80
const COMPONENT_GAP = 120
const DIRECTION_THRESHOLD = 1.3

// ─── Utility Functions ────────────────────────────────────────────

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SNAP) * GRID_SNAP
}

function rectsIntersect(a: RectTuple, b: RectTuple): boolean {
  return (
    a[0] < b[0] + b[2] &&
    a[0] + a[2] > b[0] &&
    a[1] < b[1] + b[3] &&
    a[1] + a[3] > b[1]
  )
}

function getRectCenter(rect: RectTuple): [number, number] {
  return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2]
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function rectDiagonal(rect: RectTuple): number {
  return Math.sqrt(rect[2] * rect[2] + rect[3] * rect[3])
}

function expandRect(rect: RectTuple, padding: number): RectTuple {
  return [rect[0] - padding, rect[1] - padding, rect[2] + padding * 2, rect[3] + padding * 2]
}

function spansOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && a.end > b.start
}

// ─── Node Filtering ───────────────────────────────────────────────

function isExcludedNode(node: CanvasNodeElement): boolean {
  if (node.type === STROKE_NODE_TYPE) return true
  const meta = node.meta as Record<string, unknown> | undefined
  if (meta?.mindmapGhost) return true
  if (meta?.mindmapHidden) return true
  return false
}

// ─── Build Layout Graph ───────────────────────────────────────────

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

// ─── Proximity Clustering ─────────────────────────────────────────

function buildProximityClusters(
  layoutNodes: Map<string, LayoutNode>,
): string[][] {
  const ids = Array.from(layoutNodes.keys())
  if (ids.length === 0) return []

  const visited = new Set<string>()
  const clusters: string[][] = []

  ids.forEach((id) => {
    if (visited.has(id)) return
    const cluster: string[] = []
    const queue = [id]
    visited.add(id)

    while (queue.length > 0) {
      const current = queue.shift()!
      cluster.push(current)
      const currentNode = layoutNodes.get(current)
      if (!currentNode) continue
      const currentDiag = rectDiagonal(currentNode.xywh)

      ids.forEach((candidateId) => {
        if (visited.has(candidateId)) return
        const candidate = layoutNodes.get(candidateId)
        if (!candidate) return
        const candidateDiag = rectDiagonal(candidate.xywh)
        const avgDiag = (currentDiag + candidateDiag) / 2
        const threshold = avgDiag * CLUSTER_RATIO

        // Compute edge-to-edge distance between bounding boxes
        const gapX = Math.max(
          0,
          Math.max(currentNode.xywh[0], candidate.xywh[0]) -
            Math.min(
              currentNode.xywh[0] + currentNode.xywh[2],
              candidate.xywh[0] + candidate.xywh[2],
            ),
        )
        const gapY = Math.max(
          0,
          Math.max(currentNode.xywh[1], candidate.xywh[1]) -
            Math.min(
              currentNode.xywh[1] + currentNode.xywh[3],
              candidate.xywh[1] + candidate.xywh[3],
            ),
        )
        const edgeDist = Math.sqrt(gapX * gapX + gapY * gapY)

        if (edgeDist < threshold) {
          visited.add(candidateId)
          queue.push(candidateId)
        }
      })
    }
    clusters.push(cluster)
  })

  return clusters
}

// ─── Structure Detection ──────────────────────────────────────────

function detectStructure(
  clusterIds: string[],
  layoutNodes: Map<string, LayoutNode>,
): DetectedStructure {
  if (clusterIds.length <= 1) {
    return { type: "row", rows: [clusterIds] }
  }

  // Collect items with centers
  const items = clusterIds
    .map((id) => {
      const node = layoutNodes.get(id)
      if (!node) return null
      const [x, y, w, h] = node.xywh
      return { id, cx: x + w / 2, cy: y + h / 2, w, h }
    })
    .filter(Boolean) as Array<{ id: string; cx: number; cy: number; w: number; h: number }>

  if (items.length <= 1) {
    return { type: "row", rows: [clusterIds] }
  }

  // Compute row threshold
  const heights = items.map((item) => item.h)
  const medianH = median(heights)
  const rowThreshold = Math.max(MIN_ROW_THRESHOLD, medianH * ROW_THRESHOLD_RATIO)

  // Row detection: sort by Y center, cluster
  const sortedByY = [...items].sort((a, b) => a.cy - b.cy)
  const rows: typeof items[] = [[sortedByY[0]]]
  for (let i = 1; i < sortedByY.length; i += 1) {
    const lastRow = rows[rows.length - 1]
    const lastRowMedianY = median(lastRow.map((item) => item.cy))
    if (Math.abs(sortedByY[i].cy - lastRowMedianY) > rowThreshold) {
      rows.push([sortedByY[i]])
    } else {
      lastRow.push(sortedByY[i])
    }
  }

  // Sort each row by X
  rows.forEach((row) => row.sort((a, b) => a.cx - b.cx))

  // Convert to id arrays
  const rowIds = rows.map((row) => row.map((item) => item.id))

  // Structure judgment
  const rowCount = rows.length
  const n = items.length

  if (rowCount === 1) {
    return { type: "row", rows: rowIds }
  }

  // Check column: all rows have exactly 1 item
  if (rows.every((row) => row.length === 1)) {
    return { type: "column", rows: rowIds }
  }

  // Check grid: rows >= 2 and column counts are consistent (±1)
  if (rowCount >= 2) {
    const colCounts = rows.map((row) => row.length)
    const minCols = Math.min(...colCounts)
    const maxCols = Math.max(...colCounts)
    if (maxCols - minCols <= 1) {
      return { type: "grid", rows: rowIds }
    }
  }

  // Check scattered: too many rows relative to sqrt(n)
  const avgPerRow = n / rowCount
  if (rowCount > Math.sqrt(n) && avgPerRow < 2) {
    return { type: "scattered", rows: rowIds }
  }

  // Default: treat as grid (handles jagged grids gracefully)
  return { type: "grid", rows: rowIds }
}

// ─── Spatial Tidying ──────────────────────────────────────────────

function tidyGrid(
  rows: string[][],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  if (rows.length === 0) return

  // Identify cross-row nodes (height > median * 3)
  const allHeights: number[] = []
  rows.forEach((row) => {
    row.forEach((id) => {
      const node = layoutNodes.get(id)
      if (node) allHeights.push(node.xywh[3])
    })
  })
  const medianHeight = median(allHeights)
  const crossRowIds = new Set<string>()
  rows.forEach((row) => {
    row.forEach((id) => {
      const node = layoutNodes.get(id)
      if (node && node.xywh[3] > medianHeight * CROSS_ROW_SIZE_RATIO) {
        crossRowIds.add(id)
      }
    })
  })

  // Compute row align Y = median of Y centers (excluding cross-row nodes)
  const rowAlignY: number[] = rows.map((row) => {
    const yCenters = row
      .filter((id) => !crossRowIds.has(id))
      .map((id) => {
        const node = layoutNodes.get(id)!
        return node.xywh[1] + node.xywh[3] / 2
      })
    return yCenters.length > 0 ? median(yCenters) : 0
  })

  // Compute row heights (max height of non-cross-row nodes)
  const rowHeights: number[] = rows.map((row) => {
    const heights = row
      .filter((id) => !crossRowIds.has(id))
      .map((id) => layoutNodes.get(id)?.xywh[3] ?? 0)
    return heights.length > 0 ? Math.max(...heights) : 0
  })

  // Detect columns: for grid, max columns across all rows
  const maxCols = Math.max(...rows.map((row) => row.length))

  // Compute column align X = median of X centers per column
  const colAlignX: number[] = []
  const colWidths: number[] = []
  for (let col = 0; col < maxCols; col += 1) {
    const xCenters: number[] = []
    let maxW = 0
    rows.forEach((row) => {
      if (col >= row.length) return
      const node = layoutNodes.get(row[col])
      if (!node) return
      xCenters.push(node.xywh[0] + node.xywh[2] / 2)
      maxW = Math.max(maxW, node.xywh[2])
    })
    colAlignX.push(xCenters.length > 0 ? median(xCenters) : 0)
    colWidths.push(maxW)
  }

  // Compute actual column gaps — use smallest gap as the "intended" spacing
  const actualColGaps: number[] = []
  for (let col = 1; col < maxCols; col += 1) {
    const prevRight = colAlignX[col - 1] + colWidths[col - 1] / 2
    const currLeft = colAlignX[col] - colWidths[col] / 2
    actualColGaps.push(currLeft - prevRight)
  }
  const colGap = actualColGaps.length > 0
    ? Math.max(Math.min(...actualColGaps), MIN_GAP)
    : MIN_GAP

  // Compute actual row gaps — use smallest gap as the "intended" spacing
  const actualRowGaps: number[] = []
  for (let row = 1; row < rows.length; row += 1) {
    const prevBottom = rowAlignY[row - 1] + rowHeights[row - 1] / 2
    const currTop = rowAlignY[row] - rowHeights[row] / 2
    actualRowGaps.push(currTop - prevBottom)
  }
  const rowGap = actualRowGaps.length > 0
    ? Math.max(Math.min(...actualRowGaps), MIN_GAP)
    : MIN_GAP

  // Anchor: first row first column
  const anchorNode = layoutNodes.get(rows[0][0])
  const anchorX = anchorNode ? anchorNode.xywh[0] + anchorNode.xywh[2] / 2 : colAlignX[0]
  const anchorY = anchorNode ? anchorNode.xywh[1] + anchorNode.xywh[3] / 2 : rowAlignY[0]

  // Compute final column X positions (centered)
  const finalColX: number[] = [anchorX]
  for (let col = 1; col < maxCols; col += 1) {
    const prevCenter = finalColX[col - 1]
    const prevHalfW = colWidths[col - 1] / 2
    const currHalfW = colWidths[col] / 2
    finalColX.push(prevCenter + prevHalfW + colGap + currHalfW)
  }

  // Compute final row Y positions (centered)
  const finalRowY: number[] = [anchorY]
  for (let row = 1; row < rows.length; row += 1) {
    const prevCenter = finalRowY[row - 1]
    const prevHalfH = rowHeights[row - 1] / 2
    const currHalfH = rowHeights[row] / 2
    finalRowY.push(prevCenter + prevHalfH + rowGap + currHalfH)
  }

  // Compute original cluster centroid
  let origCxSum = 0
  let origCySum = 0
  let count = 0
  rows.forEach((row) => {
    row.forEach((id) => {
      const node = layoutNodes.get(id)
      if (!node) return
      origCxSum += node.xywh[0] + node.xywh[2] / 2
      origCySum += node.xywh[1] + node.xywh[3] / 2
      count += 1
    })
  })
  const origCx = count > 0 ? origCxSum / count : 0
  const origCy = count > 0 ? origCySum / count : 0

  // Place nodes
  rows.forEach((row, rowIdx) => {
    row.forEach((id, colIdx) => {
      const node = layoutNodes.get(id)
      if (!node || node.locked) return
      const [, , w, h] = node.xywh
      const cx = finalColX[colIdx]
      const cy = finalRowY[rowIdx]
      layoutPositions.set(id, [cx - w / 2, cy - h / 2])
    })
  })

  // Re-center to original cluster centroid
  let newCxSum = 0
  let newCySum = 0
  let newCount = 0
  rows.forEach((row) => {
    row.forEach((id) => {
      const node = layoutNodes.get(id)
      if (!node) return
      const pos = layoutPositions.get(id)
      if (!pos) return
      newCxSum += pos[0] + node.xywh[2] / 2
      newCySum += pos[1] + node.xywh[3] / 2
      newCount += 1
    })
  })
  if (newCount > 0) {
    const newCx = newCxSum / newCount
    const newCy = newCySum / newCount
    const dx = origCx - newCx
    const dy = origCy - newCy
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      rows.forEach((row) => {
        row.forEach((id) => {
          const pos = layoutPositions.get(id)
          if (!pos) return
          layoutPositions.set(id, [pos[0] + dx, pos[1] + dy])
        })
      })
    }
  }
}

function tidyRow(
  row: string[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  if (row.length < 2) return

  const items = row
    .map((id) => {
      const node = layoutNodes.get(id)
      if (!node) return null
      return { id, node }
    })
    .filter(Boolean) as Array<{ id: string; node: LayoutNode }>

  if (items.length < 2) return

  // Y align line = median of Y centers
  const yCenters = items.map((item) => item.node.xywh[1] + item.node.xywh[3] / 2)
  const alignY = median(yCenters)

  // Preserve original X order (already sorted from structure detection)
  // Compute actual gaps
  const actualGaps: number[] = []
  for (let i = 1; i < items.length; i += 1) {
    const prevRight = items[i - 1].node.xywh[0] + items[i - 1].node.xywh[2]
    const currLeft = items[i].node.xywh[0]
    actualGaps.push(currLeft - prevRight)
  }
  const gap = actualGaps.length > 0 ? Math.max(Math.min(...actualGaps), MIN_GAP) : MIN_GAP

  // Original centroid
  let origCx = 0
  items.forEach((item) => {
    origCx += item.node.xywh[0] + item.node.xywh[2] / 2
  })
  origCx /= items.length

  // First node X stays, subsequent nodes placed with uniform gap
  let cursorX = items[0].node.xywh[0]
  items.forEach((item, idx) => {
    if (item.node.locked) {
      cursorX = item.node.xywh[0] + item.node.xywh[2] + gap
      return
    }
    const [, , w, h] = item.node.xywh
    if (idx > 0) {
      layoutPositions.set(item.id, [cursorX, alignY - h / 2])
    } else {
      layoutPositions.set(item.id, [cursorX, alignY - h / 2])
    }
    cursorX = cursorX + w + gap
  })

  // Re-center to original centroid X
  let newCx = 0
  items.forEach((item) => {
    const pos = layoutPositions.get(item.id)
    if (!pos) return
    newCx += pos[0] + item.node.xywh[2] / 2
  })
  newCx /= items.length
  const dx = origCx - newCx
  if (Math.abs(dx) > 0.5) {
    items.forEach((item) => {
      const pos = layoutPositions.get(item.id)
      if (!pos) return
      layoutPositions.set(item.id, [pos[0] + dx, pos[1]])
    })
  }
}

function tidyColumn(
  rows: string[][],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  // Flatten: each row has 1 item, sorted by Y
  const items = rows
    .map((row) => row[0])
    .filter(Boolean)
    .map((id) => {
      const node = layoutNodes.get(id)
      return node ? { id, node } : null
    })
    .filter(Boolean) as Array<{ id: string; node: LayoutNode }>

  if (items.length < 2) return

  // X align line = median of X centers
  const xCenters = items.map((item) => item.node.xywh[0] + item.node.xywh[2] / 2)
  const alignX = median(xCenters)

  // Compute actual gaps
  const actualGaps: number[] = []
  for (let i = 1; i < items.length; i += 1) {
    const prevBottom = items[i - 1].node.xywh[1] + items[i - 1].node.xywh[3]
    const currTop = items[i].node.xywh[1]
    actualGaps.push(currTop - prevBottom)
  }
  const gap = actualGaps.length > 0 ? Math.max(Math.min(...actualGaps), MIN_GAP) : MIN_GAP

  // Original centroid
  let origCy = 0
  items.forEach((item) => {
    origCy += item.node.xywh[1] + item.node.xywh[3] / 2
  })
  origCy /= items.length

  // Place
  let cursorY = items[0].node.xywh[1]
  items.forEach((item) => {
    if (item.node.locked) {
      cursorY = item.node.xywh[1] + item.node.xywh[3] + gap
      return
    }
    const [, , w, h] = item.node.xywh
    layoutPositions.set(item.id, [alignX - w / 2, cursorY])
    cursorY += h + gap
  })

  // Re-center to original centroid Y
  let newCy = 0
  items.forEach((item) => {
    const pos = layoutPositions.get(item.id)
    if (!pos) return
    newCy += pos[1] + item.node.xywh[3] / 2
  })
  newCy /= items.length
  const dy = origCy - newCy
  if (Math.abs(dy) > 0.5) {
    items.forEach((item) => {
      const pos = layoutPositions.get(item.id)
      if (!pos) return
      layoutPositions.set(item.id, [pos[0], pos[1] + dy])
    })
  }
}

function tidyScattered(
  clusterIds: string[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  // Most conservative: only resolve overlaps with minimum displacement
  resolveOverlapsMinimal(clusterIds, layoutNodes, layoutPositions)
}

function resolveOverlapsMinimal(
  ids: string[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  // Sort by area descending (large nodes get priority)
  const items = ids
    .map((id) => {
      const node = layoutNodes.get(id)
      if (!node) return null
      const pos = layoutPositions.get(id)
      const [x, y, w, h] = node.xywh
      return {
        id,
        x: pos ? pos[0] : x,
        y: pos ? pos[1] : y,
        w,
        h,
        area: w * h,
        locked: node.locked,
      }
    })
    .filter(Boolean) as Array<{
    id: string
    x: number
    y: number
    w: number
    h: number
    area: number
    locked: boolean
  }>

  items.sort((a, b) => b.area - a.area)

  // For each pair, if overlapping, push the smaller one away
  const maxPasses = 10
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let anyOverlap = false
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i]
        const b = items[j]
        const aRect: RectTuple = [a.x, a.y, a.w, a.h]
        const bRect: RectTuple = [b.x, b.y, b.w, b.h]
        const padded: RectTuple = [aRect[0] - MIN_GAP / 2, aRect[1] - MIN_GAP / 2, aRect[2] + MIN_GAP, aRect[3] + MIN_GAP]
        if (!rectsIntersect(padded, bRect)) continue

        anyOverlap = true

        // Determine which to move
        const mover = a.locked ? b : b.locked ? a : b // move smaller by default
        if (a.locked && b.locked) continue

        // Compute minimal displacement in 4 directions
        const aCx = a.x + a.w / 2
        const aCy = a.y + a.h / 2
        const bCx = b.x + b.w / 2
        const bCy = b.y + b.h / 2
        const pushRight = (a.x + a.w + MIN_GAP) - b.x
        const pushLeft = b.x + b.w + MIN_GAP - a.x
        const pushDown = (a.y + a.h + MIN_GAP) - b.y
        const pushUp = b.y + b.h + MIN_GAP - a.y

        if (mover === b) {
          // Push b away from a, choosing direction based on center offset
          const dx = bCx - aCx
          const dy = bCy - aCy
          if (Math.abs(dx) >= Math.abs(dy)) {
            b.x = dx >= 0 ? a.x + a.w + MIN_GAP : a.x - b.w - MIN_GAP
          } else {
            b.y = dy >= 0 ? a.y + a.h + MIN_GAP : a.y - b.h - MIN_GAP
          }
        } else {
          const dx = aCx - bCx
          const dy = aCy - bCy
          if (Math.abs(dx) >= Math.abs(dy)) {
            a.x = dx >= 0 ? b.x + b.w + MIN_GAP : b.x - a.w - MIN_GAP
          } else {
            a.y = dy >= 0 ? b.y + b.h + MIN_GAP : b.y - a.h - MIN_GAP
          }
        }
      }
    }
    if (!anyOverlap) break
  }

  // Write back positions
  items.forEach((item) => {
    if (item.locked) return
    layoutPositions.set(item.id, [item.x, item.y])
  })
}

function tidyCluster(
  clusterIds: string[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  if (clusterIds.length < 2) return

  const structure = detectStructure(clusterIds, layoutNodes)

  switch (structure.type) {
    case "grid":
      tidyGrid(structure.rows, layoutNodes, layoutPositions)
      break
    case "row":
      tidyRow(structure.rows[0], layoutNodes, layoutPositions)
      break
    case "column":
      tidyColumn(structure.rows, layoutNodes, layoutPositions)
      break
    case "scattered":
      tidyScattered(clusterIds, layoutNodes, layoutPositions)
      break
  }
}

// ─── Conservative DAG Layout ──────────────────────────────────────

function layoutDAGConservative(
  componentIds: string[],
  componentEdges: LayoutEdge[],
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  if (componentIds.length < 2) return

  const direction = detectComponentDirection(componentIds, componentEdges, layoutNodes)
  const { order, edges: dagEdges } = buildAcyclicOrder(componentIds, componentEdges)

  const axisMin = getAxisMin(layoutNodes, direction)
  const fixedLayers = new Map<string, number>()
  layoutNodes.forEach((node) => {
    if (!node.locked) return
    fixedLayers.set(node.id, getApproxLayer(node.xywh, direction, axisMin))
  })

  const layers = assignLayers(
    componentIds,
    order,
    dagEdges,
    fixedLayers,
    layoutNodes,
    direction,
    axisMin,
  )

  // Build layer map
  const layerMap = new Map<number, string[]>()
  layers.forEach((layer, nodeId) => {
    const bucket = layerMap.get(layer) ?? []
    bucket.push(nodeId)
    layerMap.set(layer, bucket)
  })

  const layerIndices = Array.from(layerMap.keys()).sort((a, b) => a - b)

  // Within each layer, sort by original position (preserve user's left-right order)
  layerIndices.forEach((layer) => {
    const ids = layerMap.get(layer) ?? []
    ids.sort((a, b) => {
      const nodeA = layoutNodes.get(a)
      const nodeB = layoutNodes.get(b)
      if (!nodeA || !nodeB) return 0
      if (direction === "horizontal") {
        return nodeA.xywh[1] - nodeB.xywh[1]
      }
      return nodeA.xywh[0] - nodeB.xywh[0]
    })
    layerMap.set(layer, ids)
  })

  // Original centroid
  let origPrimSum = 0
  let origSecSum = 0
  let count = 0
  componentIds.forEach((id) => {
    const node = layoutNodes.get(id)
    if (!node) return
    const center = getRectCenter(node.xywh)
    origPrimSum += direction === "horizontal" ? center[0] : center[1]
    origSecSum += direction === "horizontal" ? center[1] : center[0]
    count += 1
  })
  const origPrimCenter = count > 0 ? origPrimSum / count : 0
  const origSecCenter = count > 0 ? origSecSum / count : 0

  // Compute primary positions: preserve actual layer spacing from original positions
  const layerPrimary = new Map<number, number>()

  if (layerIndices.length > 0) {
    // Use median of original primary positions for first layer
    const firstLayerIds = layerMap.get(layerIndices[0]) ?? []
    const firstPrimaries = firstLayerIds
      .map((id) => layoutNodes.get(id))
      .filter(Boolean)
      .map((node) => getPrimaryAxis(node!.xywh, direction))
    layerPrimary.set(layerIndices[0], firstPrimaries.length > 0 ? median(firstPrimaries) : 0)

    // Compute actual layer gaps from original positions
    const actualLayerGaps: number[] = []
    for (let i = 1; i < layerIndices.length; i += 1) {
      const prevIds = layerMap.get(layerIndices[i - 1]) ?? []
      const currIds = layerMap.get(layerIndices[i]) ?? []
      const prevMaxEnd = prevIds.reduce((max, id) => {
        const node = layoutNodes.get(id)
        return node
          ? Math.max(max, getPrimaryAxis(node.xywh, direction) + getPrimarySize(node.xywh, direction))
          : max
      }, -Infinity)
      const currMinStart = currIds.reduce((min, id) => {
        const node = layoutNodes.get(id)
        return node ? Math.min(min, getPrimaryAxis(node.xywh, direction)) : min
      }, Infinity)
      if (Number.isFinite(prevMaxEnd) && Number.isFinite(currMinStart)) {
        actualLayerGaps.push(currMinStart - prevMaxEnd)
      }
    }
    const layerGap = actualLayerGaps.length > 0
      ? Math.max(Math.min(...actualLayerGaps), MIN_GAP)
      : LAYER_GAP

    for (let i = 1; i < layerIndices.length; i += 1) {
      const prevLayer = layerIndices[i - 1]
      const prevPrimary = layerPrimary.get(prevLayer) ?? 0

      // Max primary size in previous layer
      const prevIds = layerMap.get(prevLayer) ?? []
      const maxPrevSize = prevIds.reduce((max, id) => {
        const node = layoutNodes.get(id)
        return node ? Math.max(max, getPrimarySize(node.xywh, direction)) : max
      }, 0)

      layerPrimary.set(layerIndices[i], prevPrimary + maxPrevSize + layerGap)
    }
  }

  // Compute secondary positions: median align + preserve actual spacing
  layerIndices.forEach((layer) => {
    const ids = layerMap.get(layer) ?? []
    if (ids.length === 0) return

    const primaryPos = layerPrimary.get(layer) ?? 0

    // Single node in layer: preserve original secondary position
    if (ids.length === 1) {
      const node = layoutNodes.get(ids[0])
      if (!node) return
      if (node.locked) {
        layoutPositions.set(ids[0], [node.xywh[0], node.xywh[1]])
      } else if (direction === "horizontal") {
        layoutPositions.set(ids[0], [primaryPos, node.xywh[1]])
      } else {
        layoutPositions.set(ids[0], [node.xywh[0], primaryPos])
      }
      return
    }

    // Use median of original secondary positions for this layer
    const secCenters = ids
      .map((id) => layoutNodes.get(id))
      .filter(Boolean)
      .map((node) => getSecondaryCenter(node!.xywh, direction))
    const layerSecCenter = median(secCenters)

    // Compute actual gaps between adjacent nodes in this layer
    const sizes = ids.map((id) => {
      const node = layoutNodes.get(id)
      return node ? getSecondarySize(node.xywh, direction) : 0
    })
    const actualGaps: number[] = []
    for (let i = 1; i < ids.length; i += 1) {
      const prevNode = layoutNodes.get(ids[i - 1])
      const currNode = layoutNodes.get(ids[i])
      if (!prevNode || !currNode) continue
      const prevEnd = direction === "horizontal"
        ? prevNode.xywh[1] + prevNode.xywh[3]
        : prevNode.xywh[0] + prevNode.xywh[2]
      const currStart = direction === "horizontal" ? currNode.xywh[1] : currNode.xywh[0]
      actualGaps.push(currStart - prevEnd)
    }
    const gap = actualGaps.length > 0 ? Math.max(Math.min(...actualGaps), MIN_GAP) : MIN_GAP
    const totalSize = sizes.reduce((s, v) => s + v, 0) + gap * Math.max(ids.length - 1, 0)

    let cursor = layerSecCenter - totalSize / 2
    ids.forEach((id, idx) => {
      const node = layoutNodes.get(id)
      if (!node) return
      if (node.locked) {
        layoutPositions.set(id, [node.xywh[0], node.xywh[1]])
        return
      }
      const size = sizes[idx]
      const nodeSecSize = getSecondarySize(node.xywh, direction)
      const secPos = cursor + (size - nodeSecSize) / 2

      if (direction === "horizontal") {
        layoutPositions.set(id, [primaryPos, secPos])
      } else {
        layoutPositions.set(id, [secPos, primaryPos])
      }
      cursor += size + gap
    })
  })

  // Post-pass: center parent nodes on their children's secondary positions
  const outgoing = new Map<string, string[]>()
  componentIds.forEach((id) => outgoing.set(id, []))
  dagEdges.forEach((edge) => {
    outgoing.get(edge.from)?.push(edge.to)
  })

  // Process layers from leaves back to roots so parent centering cascades
  for (let li = layerIndices.length - 1; li >= 0; li -= 1) {
    const ids = layerMap.get(layerIndices[li]) ?? []
    for (const id of ids) {
      const children = outgoing.get(id) ?? []
      if (children.length === 0) continue
      const node = layoutNodes.get(id)
      if (!node || node.locked) continue

      // Compute average secondary center of children
      let secSum = 0
      let secCount = 0
      for (const childId of children) {
        const childNode = layoutNodes.get(childId)
        const childPos = layoutPositions.get(childId)
        if (!childNode || !childPos) continue
        if (direction === "horizontal") {
          secSum += childPos[1] + childNode.xywh[3] / 2
        } else {
          secSum += childPos[0] + childNode.xywh[2] / 2
        }
        secCount += 1
      }
      if (secCount === 0) continue

      const childrenSecCenter = secSum / secCount
      const pos = layoutPositions.get(id)
      if (!pos) continue

      if (direction === "horizontal") {
        pos[1] = childrenSecCenter - node.xywh[3] / 2
      } else {
        pos[0] = childrenSecCenter - node.xywh[2] / 2
      }
    }
  }

  // Re-center to original centroid
  let newPrimSum = 0
  let newSecSum = 0
  let newCount = 0
  componentIds.forEach((id) => {
    const node = layoutNodes.get(id)
    if (!node) return
    const pos = layoutPositions.get(id)
    if (!pos) return
    const cx = pos[0] + node.xywh[2] / 2
    const cy = pos[1] + node.xywh[3] / 2
    newPrimSum += direction === "horizontal" ? cx : cy
    newSecSum += direction === "horizontal" ? cy : cx
    newCount += 1
  })

  if (newCount > 0) {
    const newPrimCenter = newPrimSum / newCount
    const newSecCenter = newSecSum / newCount
    const dPrim = origPrimCenter - newPrimCenter
    const dSec = origSecCenter - newSecCenter
    if (Math.abs(dPrim) > 0.5 || Math.abs(dSec) > 0.5) {
      componentIds.forEach((id) => {
        const pos = layoutPositions.get(id)
        if (!pos) return
        if (direction === "horizontal") {
          layoutPositions.set(id, [pos[0] + dPrim, pos[1] + dSec])
        } else {
          layoutPositions.set(id, [pos[0] + dSec, pos[1] + dPrim])
        }
      })
    }
  }
}

// ─── Direction Detection ──────────────────────────────────────────

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

  const { order, edges: dagEdges } = buildAcyclicOrder(componentIds, componentEdges)
  const outgoing = new Map<string, string[]>()
  order.forEach((id) => outgoing.set(id, []))
  dagEdges.forEach((edge) => {
    outgoing.get(edge.from)?.push(edge.to)
  })

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

  let sinkId = order[0]
  let maxDist = 0
  dist.forEach((d, id) => {
    if (d > maxDist) {
      maxDist = d
      sinkId = id
    }
  })

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

// ─── Cycle Breaking & Topological Sort ────────────────────────────

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

// ─── Layer Assignment ─────────────────────────────────────────────

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

// ─── Connected Components ─────────────────────────────────────────

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

// ─── Axis Helpers ─────────────────────────────────────────────────

function getPrimaryAxis(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[0] : rect[1]
}

function getPrimarySize(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[2] : rect[3]
}

function getSecondaryCenter(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal"
    ? rect[1] + rect[3] / 2
    : rect[0] + rect[2] / 2
}

function getSecondarySize(rect: RectTuple, direction: LayoutDirection): number {
  return direction === "horizontal" ? rect[3] : rect[2]
}

function getAxisMin(layoutNodes: Map<string, LayoutNode>, direction: LayoutDirection): number {
  let min = Infinity
  layoutNodes.forEach((node) => {
    const value = getPrimaryAxis(node.xywh, direction)
    if (value < min) min = value
  })
  return Number.isFinite(min) ? min : 0
}

function getApproxLayer(
  rect: RectTuple,
  direction: LayoutDirection,
  axisMin: number,
): number {
  const axis = getPrimaryAxis(rect, direction)
  return Math.round((axis - axisMin) / LAYER_GAP)
}

// ─── Global Collision Resolution ──────────────────────────────────

function resolveCollisions(
  layoutNodes: Map<string, LayoutNode>,
  layoutPositions: Map<string, [number, number]>,
): void {
  // Build items sorted by area descending
  const items = Array.from(layoutNodes.entries())
    .map(([id, node]) => {
      const pos = layoutPositions.get(id)
      return {
        id,
        x: pos ? pos[0] : node.xywh[0],
        y: pos ? pos[1] : node.xywh[1],
        w: node.xywh[2],
        h: node.xywh[3],
        area: node.xywh[2] * node.xywh[3],
        locked: node.locked,
        moved: !!pos,
      }
    })
    .sort((a, b) => b.area - a.area)

  const maxPasses = 8
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let anyOverlap = false
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i]
        const b = items[j]
        const aRect: RectTuple = [a.x, a.y, a.w, a.h]
        const bRect: RectTuple = [b.x, b.y, b.w, b.h]

        if (!rectsIntersect(aRect, bRect)) continue
        if (a.locked && b.locked) continue

        anyOverlap = true

        // Compute 4 push directions for b relative to a
        const pushRight = (a.x + a.w + COMPONENT_GAP) - b.x
        const pushLeft = (b.x + b.w + COMPONENT_GAP) - a.x
        const pushDown = (a.y + a.h + COMPONENT_GAP) - b.y
        const pushUp = (b.y + b.h + COMPONENT_GAP) - a.y

        const options = [
          { dx: pushRight, dy: 0, cost: Math.abs(pushRight) },
          { dx: -pushLeft, dy: 0, cost: Math.abs(pushLeft) },
          { dx: 0, dy: pushDown, cost: Math.abs(pushDown) },
          { dx: 0, dy: -pushUp, cost: Math.abs(pushUp) },
        ].sort((x, y) => x.cost - y.cost)

        const best = options[0]
        if (a.locked) {
          b.x += best.dx
          b.y += best.dy
        } else if (b.locked) {
          a.x -= best.dx
          a.y -= best.dy
        } else {
          // Move the smaller one
          b.x += best.dx
          b.y += best.dy
        }
      }
    }
    if (!anyOverlap) break
  }

  // Write back
  items.forEach((item) => {
    if (item.locked) return
    layoutPositions.set(item.id, [item.x, item.y])
  })
}

// ─── Main: Full Board Auto Layout ─────────────────────────────────

export function computeAutoLayoutUpdates(elements: CanvasElement[]): AutoLayoutUpdate[] {
  const { layoutNodes, edges, linkedIds, nodeMap } = buildLayoutGraph(elements)
  if (layoutNodes.size < 2) return []

  const layoutPositions = new Map<string, [number, number]>()

  // Separate linked vs unlinked
  const linkedLayoutNodes = new Map<string, LayoutNode>()
  const unlinkedLayoutNodes = new Map<string, LayoutNode>()
  layoutNodes.forEach((node, id) => {
    if (linkedIds.has(id)) {
      linkedLayoutNodes.set(id, node)
    } else {
      unlinkedLayoutNodes.set(id, node)
    }
  })

  // ── Handle linked nodes: conservative DAG layout ──
  const linkedEdges = edges.filter(
    (edge) => linkedIds.has(edge.from) && linkedIds.has(edge.to),
  )

  if (linkedLayoutNodes.size >= 2 && linkedEdges.length > 0) {
    const components = buildConnectedComponents(
      Array.from(linkedLayoutNodes.keys()),
      linkedEdges,
    )
    components.forEach((componentIds) => {
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

      layoutDAGConservative(componentIds, componentEdges, componentNodes, layoutPositions)
    })
  }

  // ── Handle unlinked nodes: spatial tidying ──
  if (unlinkedLayoutNodes.size >= 2) {
    const clusters = buildProximityClusters(unlinkedLayoutNodes)
    clusters.forEach((cluster) => {
      if (cluster.length < 2) return
      tidyCluster(cluster, unlinkedLayoutNodes, layoutPositions)
    })
  }

  // ── Global collision resolution ──
  resolveCollisions(layoutNodes, layoutPositions)

  // ── Build final updates with grid snapping ──
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

// ─── Partial Layout for Selection ─────────────────────────────────

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

  // Split into linked and unlinked
  const linkedNodeIds = new Set<string>()
  internalConnectors.forEach((connector) => {
    if ("elementId" in connector.source) linkedNodeIds.add(connector.source.elementId)
    if ("elementId" in connector.target) linkedNodeIds.add(connector.target.elementId)
  })

  const linkedNodes = selectedNodes.filter((n) => linkedNodeIds.has(n.id))
  const unlinkedNodes = selectedNodes.filter((n) => !linkedNodeIds.has(n.id))

  const allUpdates: AutoLayoutUpdate[] = []

  // ── Linked nodes: conservative DAG layout ──
  if (linkedNodes.length >= 2 && internalConnectors.length > 0) {
    const layoutPositions = new Map<string, [number, number]>()
    const layoutNodes = new Map<string, LayoutNode>()
    const edges: LayoutEdge[] = []

    linkedNodes.forEach((node) => {
      layoutNodes.set(node.id, {
        id: node.id,
        xywh: node.xywh,
        locked: Boolean(node.locked),
        createdAt: 0,
        isGroup: false,
        childIds: [],
      })
    })

    internalConnectors.forEach((conn) => {
      if (!("elementId" in conn.source) || !("elementId" in conn.target)) return
      const srcId = conn.source.elementId
      const tgtId = conn.target.elementId
      if (!layoutNodes.has(srcId) || !layoutNodes.has(tgtId)) return
      edges.push({ from: srcId, to: tgtId, weight: 1 })
    })

    const components = buildConnectedComponents(
      linkedNodes.map((n) => n.id),
      edges,
    )
    components.forEach((componentIds) => {
      if (componentIds.length < 2) return
      const componentSet = new Set(componentIds)
      const componentEdges = edges.filter(
        (e) => componentSet.has(e.from) && componentSet.has(e.to),
      )
      if (componentEdges.length === 0) return
      const componentNodes = new Map<string, LayoutNode>()
      componentIds.forEach((id) => {
        const node = layoutNodes.get(id)
        if (node) componentNodes.set(id, node)
      })
      layoutDAGConservative(componentIds, componentEdges, componentNodes, layoutPositions)
    })

    linkedNodes.forEach((node) => {
      const pos = layoutPositions.get(node.id)
      if (!pos) return
      const [, , w, h] = node.xywh
      allUpdates.push({
        id: node.id,
        xywh: [snapToGrid(pos[0]), snapToGrid(pos[1]), w, h],
      })
    })
  }

  // ── Unlinked nodes: spatial tidying ──
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

    tidyCluster(
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
  }

  if (allUpdates.length === 0) return []

  // ── Re-center to original selection center ──
  const origBounds = computeNodesBounds(selectedNodes)
  const origCx = origBounds[0] + origBounds[2] / 2
  const origCy = origBounds[1] + origBounds[3] / 2
  const newBounds = computeBoundsFromUpdates(allUpdates)
  const newCx = newBounds[0] + newBounds[2] / 2
  const newCy = newBounds[1] + newBounds[3] / 2
  const dx = origCx - newCx
  const dy = origCy - newCy

  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    allUpdates.forEach((u) => {
      u.xywh = [snapToGrid(u.xywh[0] + dx), snapToGrid(u.xywh[1] + dy), u.xywh[2], u.xywh[3]]
    })
  }

  // ── Collision detection with non-selected nodes ──
  const nonSelectedNodes = allElements.filter(
    (element): element is CanvasNodeElement =>
      element.kind === "node" && !selectedNodeIds.has(element.id) && !isExcludedNode(element),
  )

  if (nonSelectedNodes.length > 0) {
    // Check each update against non-selected nodes, compute minimum push
    const updatedBounds = computeBoundsFromUpdates(allUpdates)

    let hasCollision = false
    for (const node of nonSelectedNodes) {
      if (rectsIntersect(updatedBounds, node.xywh)) {
        hasCollision = true
        break
      }
    }

    if (hasCollision) {
      // Compute minimum shift to avoid all collisions
      const shifts: Array<{ dx: number; dy: number; cost: number }> = []

      for (const node of nonSelectedNodes) {
        if (!rectsIntersect(updatedBounds, node.xywh)) continue
        const pushRight = node.xywh[0] + node.xywh[2] + MIN_GAP - updatedBounds[0]
        const pushLeft = updatedBounds[0] + updatedBounds[2] + MIN_GAP - node.xywh[0]
        const pushDown = node.xywh[1] + node.xywh[3] + MIN_GAP - updatedBounds[1]
        const pushUp = updatedBounds[1] + updatedBounds[3] + MIN_GAP - node.xywh[1]

        shifts.push(
          { dx: pushRight, dy: 0, cost: Math.abs(pushRight) },
          { dx: -pushLeft, dy: 0, cost: Math.abs(pushLeft) },
          { dx: 0, dy: pushDown, cost: Math.abs(pushDown) },
          { dx: 0, dy: -pushUp, cost: Math.abs(pushUp) },
        )
      }

      if (shifts.length > 0) {
        // Try each candidate shift and pick the cheapest that clears all
        shifts.sort((a, b) => a.cost - b.cost)
        for (const shift of shifts) {
          const testRect: RectTuple = [
            updatedBounds[0] + shift.dx,
            updatedBounds[1] + shift.dy,
            updatedBounds[2],
            updatedBounds[3],
          ]
          let collides = false
          for (const node of nonSelectedNodes) {
            if (rectsIntersect(testRect, node.xywh)) {
              collides = true
              break
            }
          }
          if (!collides) {
            allUpdates.forEach((u) => {
              u.xywh = [
                snapToGrid(u.xywh[0] + shift.dx),
                snapToGrid(u.xywh[1] + shift.dy),
                u.xywh[2],
                u.xywh[3],
              ]
            })
            break
          }
        }
      }
    }
  }

  return allUpdates
}

// ─── Bounds Helpers ───────────────────────────────────────────────

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
