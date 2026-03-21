/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasEngine } from '../engine/CanvasEngine'
import type { CanvasNodeElement } from '../engine/types'
import {
  IMAGE_NODE_DEFAULT_MAX_SIZE,
  VIDEO_GENERATE_OUTPUT_WIDTH,
  VIDEO_GENERATE_OUTPUT_HEIGHT,
} from '../nodes/node-config'
import { resolveDirectionalStackPlacement } from './output-placement'

/** Default node dimensions per target type. */
const DEFAULT_SIZE_MAP: Record<DeriveTargetType, [width: number, height: number]> = {
  image: [IMAGE_NODE_DEFAULT_MAX_SIZE, IMAGE_NODE_DEFAULT_MAX_SIZE],
  video: [VIDEO_GENERATE_OUTPUT_WIDTH, VIDEO_GENERATE_OUTPUT_HEIGHT],
  audio: [280, 100],
  text: [200, 200],
}

/** Minimum gap when pushing nodes to avoid overlap. */
const COLLISION_GAP = 16

/**
 * Visual elements (NodeLabel + toolbar) rendered above the xywh rect.
 * The collision check expands the proposed rect upward by this amount
 * so that labels/toolbars don't visually overlap with existing nodes.
 */
const NODE_VISUAL_TOP_PADDING = 50

/** Side gap between source and derived node (horizontal, downstream). */
const DERIVE_SIDE_GAP = 60
/** Side gap for upstream derivation (left side, typically larger nodes). */
const DERIVE_UPSTREAM_SIDE_GAP = 120
/** Stack gap between stacked derived nodes. */
const DERIVE_STACK_GAP = 16

/** Supported target node types for derivation. */
export type DeriveTargetType = 'image' | 'video' | 'audio' | 'text'

/** Direction of derivation relative to the source node. */
export type DeriveDirection = 'downstream' | 'upstream'

export type DeriveNodeOptions = {
  /** Canvas engine instance. */
  engine: CanvasEngine
  /** Source node id to derive from. */
  sourceNodeId: string
  /** Target node type to create. */
  targetType: DeriveTargetType
  /** Optional props for the new node. */
  targetProps?: Record<string, unknown>
  /**
   * Direction of derivation:
   * - 'downstream' (default): new node to the right, connector source→target
   * - 'upstream': new node to the left, connector target←source (new node is upstream)
   */
  direction?: DeriveDirection
}

/**
 * Collect outbound target node rects for a source node.
 * Used to stack new derived nodes below existing ones.
 */
function collectOutboundTargetRects(
  engine: CanvasEngine,
  sourceElementId: string,
): Array<[number, number, number, number]> {
  return engine.doc
    .getElements()
    .reduce<Array<[number, number, number, number]>>((rects, element) => {
      if (element.kind !== 'connector') return rects
      if (
        !('elementId' in element.source) ||
        element.source.elementId !== sourceElementId
      ) {
        return rects
      }
      if (!('elementId' in element.target)) return rects
      const targetElement = engine.doc.getElementById(element.target.elementId)
      if (!targetElement || targetElement.kind !== 'node') return rects
      return [...rects, targetElement.xywh]
    }, [])
}

/**
 * Collect inbound source node rects for a target node.
 * Used to stack new upstream nodes to the left.
 */
function collectInboundSourceRects(
  engine: CanvasEngine,
  targetElementId: string,
): Array<[number, number, number, number]> {
  return engine.doc
    .getElements()
    .reduce<Array<[number, number, number, number]>>((rects, element) => {
      if (element.kind !== 'connector') return rects
      if (
        !('elementId' in element.target) ||
        element.target.elementId !== targetElementId
      ) {
        return rects
      }
      if (!('elementId' in element.source)) return rects
      const sourceElement = engine.doc.getElementById(element.source.elementId)
      if (!sourceElement || sourceElement.kind !== 'node') return rects
      return [...rects, sourceElement.xywh]
    }, [])
}

/**
 * Check if two rects overlap.
 */
function rectsOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return (
    a[0] < b[0] + b[2] &&
    a[0] + a[2] > b[0] &&
    a[1] < b[1] + b[3] &&
    a[1] + a[3] > b[1]
  )
}

/**
 * Shift the proposed rect to avoid overlapping any existing node.
 * For left/right derivation: push downward.
 * For top/bottom derivation: push rightward.
 *
 * The check expands the proposed rect upward by NODE_VISUAL_TOP_PADDING
 * to account for NodeLabel and toolbar rendered above the xywh rect via
 * `absolute bottom-full`.  This prevents the visual header area from
 * overlapping existing nodes even when the xywh rects don't touch.
 */
export function avoidNodeCollisions(
  proposed: [number, number, number, number],
  allNodes: CanvasNodeElement[],
  sourceNodeId: string,
  direction: 'left' | 'right' | 'top' | 'bottom',
): [number, number, number, number] {
  const result: [number, number, number, number] = [...proposed]
  const pushVertical = direction === 'left' || direction === 'right'
  const maxIterations = 50

  for (let i = 0; i < maxIterations; i++) {
    let hasCollision = false
    for (const node of allNodes) {
      if (node.id === sourceNodeId) continue

      // 逻辑：向上扩展提议矩形，覆盖 NodeLabel + toolbar 的视觉高度，
      // 防止节点标签覆盖上方已有节点。
      const checkRect: [number, number, number, number] = pushVertical
        ? [result[0], result[1] - NODE_VISUAL_TOP_PADDING, result[2], result[3] + NODE_VISUAL_TOP_PADDING]
        : result
      if (!rectsOverlap(checkRect, node.xywh)) continue

      hasCollision = true
      if (pushVertical) {
        // Push down below the colliding node + leave room for this node's header
        result[1] = node.xywh[1] + node.xywh[3] + COLLISION_GAP + NODE_VISUAL_TOP_PADDING
      } else {
        // Push right past the colliding node
        result[0] = node.xywh[0] + node.xywh[2] + COLLISION_GAP
      }
    }
    if (!hasCollision) break
  }

  return result
}

/**
 * Create a new node to the right of the source node, connect them,
 * and select the new node (triggering expand).
 *
 * @returns The new node id, or `null` if creation failed.
 */
export function deriveNode(options: DeriveNodeOptions): string | null {
  const { engine, sourceNodeId, targetType, targetProps, direction = 'downstream' } = options
  const isUpstream = direction === 'upstream'

  // 1. 获取源节点
  const sourceElement = engine.doc.getElementById(sourceNodeId)
  if (!sourceElement || sourceElement.kind !== 'node') return null

  // 2. 计算新节点尺寸
  // 图片类型：继承源节点尺寸作为上限，保持视觉一致性
  let [width, height] = DEFAULT_SIZE_MAP[targetType]
  if (targetType === 'image') {
    width = sourceElement.xywh[2]
    height = sourceElement.xywh[3]
  }

  // 3. 收集已有的同侧节点，用于堆叠计算
  const existingNeighbors = isUpstream
    ? collectInboundSourceRects(engine, sourceNodeId)
    : collectOutboundTargetRects(engine, sourceNodeId)

  // 4. 使用统一的放置算法计算位置
  const placementDirection = isUpstream ? 'left' : 'right'
  const sideGap = isUpstream ? DERIVE_UPSTREAM_SIDE_GAP : DERIVE_SIDE_GAP
  const placement = resolveDirectionalStackPlacement(
    sourceElement.xywh,
    existingNeighbors,
    {
      direction: placementDirection,
      sideGap,
      stackGap: DERIVE_STACK_GAP,
      outputSize: [width, height],
    },
  )

  const fallbackX = isUpstream
    ? sourceElement.xywh[0] - sideGap - width
    : sourceElement.xywh[0] + sourceElement.xywh[2] + sideGap

  const proposedXywh: [number, number, number, number] = placement
    ? [placement.x, placement.y, width, height]
    : [fallbackX, sourceElement.xywh[1], width, height]

  // 4.5 碰撞避让：检查画布上所有节点，避免盖住已有节点
  const allNodes = engine.doc
    .getElements()
    .filter((el): el is CanvasNodeElement => el.kind === 'node')
  const xywh = avoidNodeCollisions(proposedXywh, allNodes, sourceNodeId, placementDirection)

  // 5. 构建节点 props，标记来源为 AI 生成
  const props: Record<string, unknown> = {
    ...targetProps,
    origin: 'ai-generate',
  }

  // 6. 创建节点（addNodeElement 内部会 select + commitHistory）
  const newNodeId = engine.addNodeElement(targetType, props, xywh)
  if (!newNodeId) return null

  // 7. 创建连线：upstream 时新节点是 source，downstream 时源节点是 source
  const connectorSource = isUpstream ? newNodeId : sourceNodeId
  const connectorTarget = isUpstream ? sourceNodeId : newNodeId
  engine.addConnectorElement(
    {
      source: { elementId: connectorSource },
      target: { elementId: connectorTarget },
      style: engine.getConnectorStyle(),
    },
    { skipHistory: true, select: false, skipLayout: isUpstream },
  )

  // 8. 确保新节点被选中（触发 expand / 打开参数面板）
  engine.selection.setSelection([newNodeId])

  return newNodeId
}
