/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import type {
  CanvasConnectorElement,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
} from '../engine/types'
import type { CanvasEngine } from '../engine/CanvasEngine'
import { useMemo } from 'react'
import { Scissors } from 'lucide-react'
import {
  buildConnectorPath,
  buildSourceAxisPreferenceMap,
  flattenConnectorPath,
  resolveConnectorEndpointsSmart,
} from '../utils/connector-path'
import { applyGroupAnchorPadding } from '../engine/anchors'
import { getGroupOutlinePadding, isGroupNodeType } from '../engine/grouping'

type ConnectorHoverScissorsProps = {
  snapshot: CanvasSnapshot
  engine: CanvasEngine
}

/**
 * 连线 hover 时在中点浮现剪刀图标，点击即可删除连线。
 *
 * 渲染在 WorldToolbarLayer 内部（世界坐标 + counter-scale），
 * 与锚点 overlay 采用相同定位策略。
 */
export function ConnectorHoverScissors({ snapshot, engine }: ConnectorHoverScissorsProps) {
  const hoveredId = snapshot.connectorHoverId
  const selectedIds = snapshot.selectedIds

  // 逻辑：hover 或选中连线时都显示剪刀。
  const targetId = hoveredId
    ?? (selectedIds.length === 1 ? selectedIds[0] : null)

  const connector = useMemo(() => {
    if (!targetId) return null
    const el = snapshot.elements.find(e => e.id === targetId)
    return el && el.kind === 'connector' ? el as CanvasConnectorElement : null
  }, [targetId, snapshot.elements])

  const midpoint = useMemo(() => {
    if (!connector) return null
    return resolveConnectorMidpoint(connector, snapshot)
  }, [connector, snapshot])

  if (!midpoint || !connector) return null

  const zoom = snapshot.viewport.zoom
  const size = 28

  const handleClick = (event: React.PointerEvent) => {
    event.stopPropagation()
    // 逻辑：选中该连线后删除，确保 deleteSelection 删的是正确的元素。
    engine.selection.setSelection([connector.id])
    engine.deleteSelection()
  }

  return (
    <div
      className="absolute"
      style={{
        left: midpoint[0],
        top: midpoint[1],
        transform: `scale(${1 / zoom})`,
        transformOrigin: '0 0',
      }}
    >
      <button
        type="button"
        className="pointer-events-auto absolute flex items-center justify-center rounded-full border border-ol-divider bg-background text-ol-text-auxiliary shadow-md transition-all duration-150 hover:scale-110 hover:bg-red-50 hover:text-red-500 hover:border-red-300 active:scale-95 dark:hover:bg-red-950"
        style={{
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        }}
        onPointerDown={handleClick}
      >
        <Scissors size={14} />
      </button>
    </div>
  )
}

/** Compute the world-space midpoint of a connector path. */
function resolveConnectorMidpoint(
  connector: CanvasConnectorElement,
  snapshot: CanvasSnapshot,
): CanvasPoint | null {
  const zoom = snapshot.viewport.zoom
  const groupPadding = getGroupOutlinePadding(zoom)
  const anchors = applyGroupAnchorPadding(snapshot.anchors, snapshot.elements, groupPadding)
  const boundsMap: Record<string, CanvasRect | undefined> = {}

  for (const element of snapshot.elements) {
    if (element.kind !== 'node') continue
    const [nx, ny, nw, nh] = element.xywh
    const padding = isGroupNodeType(element.type) ? groupPadding : 0
    boundsMap[element.id] = {
      x: nx - padding,
      y: ny - padding,
      w: nw + padding * 2,
      h: nh + padding * 2,
    }
  }

  const sourceAxisPreference = buildSourceAxisPreferenceMap(
    snapshot.elements.filter(
      (e): e is CanvasConnectorElement => e.kind === 'connector',
    ),
    id => boundsMap[id],
  )

  const resolved = resolveConnectorEndpointsSmart(
    connector.source,
    connector.target,
    anchors,
    boundsMap,
    { sourceAxisPreference },
  )
  if (!resolved.source || !resolved.target) return null

  const style = connector.style ?? snapshot.connectorStyle
  const path = buildConnectorPath(style, resolved.source, resolved.target, {
    sourceAnchorId: resolved.sourceAnchorId,
    targetAnchorId: resolved.targetAnchorId,
  })
  const polyline = flattenConnectorPath(path, 20)
  return resolvePolylineMidpoint(polyline)
}

/** Find the midpoint of a polyline by accumulated length. */
function resolvePolylineMidpoint(points: CanvasPoint[]): CanvasPoint | null {
  if (points.length < 2) return null
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  if (total <= 0) return points[0] ?? null
  const target = total / 2
  let traveled = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    const segment = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (traveled + segment >= target) {
      const t = segment > 0 ? (target - traveled) / segment : 0
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    traveled += segment
  }
  return points[points.length - 1] ?? null
}
