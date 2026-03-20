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
  const [width, height] = DEFAULT_SIZE_MAP[targetType]

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

  const xywh: [number, number, number, number] = placement
    ? [placement.x, placement.y, width, height]
    : [fallbackX, sourceElement.xywh[1], width, height]

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
