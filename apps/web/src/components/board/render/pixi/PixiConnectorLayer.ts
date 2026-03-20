/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Container, Graphics } from 'pixi.js'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type {
  CanvasConnectorElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
} from '../../engine/types'
import { getGroupOutlinePadding, isGroupNodeType } from '../../engine/grouping'
import { applyGroupAnchorPadding } from '../../engine/anchors'
import {
  buildConnectorPath,
  buildSourceAxisPreferenceMap,
  flattenConnectorPath,
  resolveConnectorEndpointsSmart,
  type CanvasConnectorPath,
} from '../../utils/connector-path'
import type { PixiThemeResolver } from './PixiThemeResolver'

/** 连线箭头尺寸 */
const ARROW_SIZE = 7
/** 箭头张角 */
const ARROW_ANGLE = Math.PI / 7.5
/** 基础线宽 */
const STROKE_WIDTH = 1.2
/** 选中高亮外描边增量 */
const STROKE_OUTLINE_SELECTED = 0.8
/** 悬停高亮外描边增量 */
const STROKE_OUTLINE_HOVER = 0.5
/** 默认连线透明度 */
const STROKE_ALPHA = 0.55
/** 选中/悬停时的连线透明度 */
const STROKE_ALPHA_ACTIVE = 0.8

/** 选中节点关联连线的流动动画参数 */
const FLOW_DASH = 4
const FLOW_GAP = 14
const FLOW_SPEED = 50
const FLOW_WIDTH = 1.4
const FLOW_ALPHA = 0.65

type FlowConnectorData = { flatPoints: CanvasPoint[] }

/**
 * Renders connector elements as PixiJS Graphics paths.
 * 使用 connector-path 路径计算逻辑绘制曲线和锚点。
 */
export class PixiConnectorLayer {
  private engine: CanvasEngine
  private container: Container
  private theme: PixiThemeResolver
  private graphics = new Graphics()
  private flowGraphics = new Graphics()
  private lastRevision = -1
  private hadUiOverlay = false
  private lastSelectedKey = ''
  private flowConnectors: FlowConnectorData[] = []
  private flowOffset = 0
  private flowAnimationId: number | null = null
  private lastFlowTime = 0

  constructor(
    engine: CanvasEngine,
    container: Container,
    theme: PixiThemeResolver,
  ) {
    this.engine = engine
    this.container = container
    this.theme = theme
    this.container.addChild(this.graphics)
    this.container.addChild(this.flowGraphics)
  }

  /** Re-render all connectors from the current snapshot. */
  sync(): void {
    const snapshot = this.engine.getSnapshot()
    const hasUiOverlay = !!(snapshot.connectorDraft || snapshot.connectorDrop)
    const selectedKey = snapshot.selectedIds.join(',')
    const selectionChanged = selectedKey !== this.lastSelectedKey
    if (
      snapshot.docRevision === this.lastRevision
      && !hasUiOverlay && !this.hadUiOverlay
      && !selectionChanged
    ) return
    this.lastRevision = snapshot.docRevision
    this.hadUiOverlay = hasUiOverlay
    this.lastSelectedKey = selectedKey

    const palette = this.theme.getPalette()
    const g = this.graphics
    g.clear()

    // 计算节点包围盒
    const groupPadding = getGroupOutlinePadding(1)
    const boundsMap: Record<string, CanvasRect | undefined> = {}
    const connectorElements: CanvasConnectorElement[] = []

    for (const element of snapshot.elements) {
      if (element.kind === 'node') {
        boundsMap[element.id] = getNodeBounds(
          element as CanvasNodeElement,
          groupPadding,
        )
      } else if (element.kind === 'connector') {
        connectorElements.push(element)
      }
    }

    // 应用组节点锚点偏移
    const anchors = applyGroupAnchorPadding(
      snapshot.anchors,
      snapshot.elements,
      groupPadding,
    )

    // 计算源节点轴偏好
    const sourceAxisPreference = buildSourceAxisPreferenceMap(
      connectorElements,
      (elementId) => boundsMap[elementId],
    )

    // 选中节点 ID 集合（用于检测关联连线）
    const selectedSet = new Set(snapshot.selectedIds)
    const nextFlowConnectors: FlowConnectorData[] = []

    // 绘制所有连线
    for (const connector of connectorElements) {
      const resolved = resolveConnectorEndpointsSmart(
        connector.source,
        connector.target,
        anchors,
        boundsMap,
        { sourceAxisPreference },
      )
      if (!resolved.source || !resolved.target) continue

      const style = connector.style ?? snapshot.connectorStyle
      const path = buildConnectorPath(style, resolved.source, resolved.target, {
        sourceAnchorId: resolved.sourceAnchorId,
        targetAnchorId: resolved.targetAnchorId,
      })
      const points = flattenConnectorPath(path)

      const isSelected = snapshot.selectedIds.includes(connector.id)
      const isHovered = connector.id === snapshot.connectorHoverId
      const dashed = connector.dashed ?? snapshot.connectorDashed
      // 确定颜色
      const color = connector.color
        ? this.parseCssColor(connector.color) ?? palette.connector
        : palette.connector

      // 逻辑：选中态只改变高亮描边，不改变主线实际粗细。
      const width = STROKE_WIDTH

      const lineAlpha = isSelected || isHovered ? STROKE_ALPHA_ACTIVE : STROKE_ALPHA

      // 逻辑：选中态仅作为底部高亮描边，主线颜色始终使用 connector.color。
      if (isSelected || isHovered) {
        this.drawConnectorPath(g, path, points, dashed, {
          width: width + (isSelected ? STROKE_OUTLINE_SELECTED : STROKE_OUTLINE_HOVER),
          color: palette.selectionBorder,
          alpha: isSelected ? 0.2 : 0.14,
        })
      }

      // 主线
      this.drawConnectorPath(g, path, points, dashed, {
        width,
        color,
        alpha: lineAlpha,
      })

      // 箭头
      if (points.length >= 2) {
        if (isSelected || isHovered) {
          this.drawArrowHead(
            g,
            points[points.length - 2]!,
            points[points.length - 1]!,
            ARROW_SIZE,
            palette.selectionBorder,
            width + (isSelected ? STROKE_OUTLINE_SELECTED : STROKE_OUTLINE_HOVER),
            isSelected ? 0.2 : 0.14,
          )
        }
        this.drawArrowHead(
          g,
          points[points.length - 2]!,
          points[points.length - 1]!,
          ARROW_SIZE,
          color,
          width,
          lineAlpha,
        )
      }

      // 流动动画：收集关联到选中节点的连线路径
      const sourceNodeId = 'elementId' in connector.source ? connector.source.elementId : null
      const targetNodeId = 'elementId' in connector.target ? connector.target.elementId : null
      if ((sourceNodeId && selectedSet.has(sourceNodeId)) || (targetNodeId && selectedSet.has(targetNodeId))) {
        nextFlowConnectors.push({ flatPoints: points })
      }
    }

    // 绘制 draft connector
    const draft = snapshot.connectorDraft
    if (draft) {
      const resolved = resolveConnectorEndpointsSmart(
        draft.source,
        draft.target,
        anchors,
        boundsMap,
        { sourceAxisPreference },
      )
      if (resolved.source && resolved.target) {
        const style = draft.style ?? snapshot.connectorStyle
        const dashed = draft.dashed ?? snapshot.connectorDashed
        const path = buildConnectorPath(
          style,
          resolved.source,
          resolved.target,
          {
            sourceAnchorId: resolved.sourceAnchorId,
            targetAnchorId: resolved.targetAnchorId,
          },
        )

        this.drawConnectorPath(g, path, flattenConnectorPath(path), dashed, {
          width: STROKE_WIDTH,
          color: palette.connector,
          alpha: STROKE_ALPHA,
        })
      }
    }

    // 管理流动动画生命周期
    this.flowConnectors = nextFlowConnectors
    if (nextFlowConnectors.length > 0) {
      if (this.flowAnimationId === null) this.startFlowAnimation()
    } else {
      this.stopFlowAnimation()
      this.flowGraphics.clear()
    }
  }

  /** 启动流动动画循环 */
  private startFlowAnimation(): void {
    this.lastFlowTime = performance.now()
    const cycle = FLOW_DASH + FLOW_GAP
    const animate = (now: number) => {
      const dt = (now - this.lastFlowTime) / 1000
      this.lastFlowTime = now
      this.flowOffset = (this.flowOffset + FLOW_SPEED * dt) % cycle

      const palette = this.theme.getPalette()
      const fg = this.flowGraphics
      fg.clear()
      for (const fc of this.flowConnectors) {
        this.drawFlowingDash(fg, fc.flatPoints, palette.selectionBorder)
      }
      this.flowAnimationId = requestAnimationFrame(animate)
    }
    this.flowAnimationId = requestAnimationFrame(animate)
  }

  /** 停止流动动画 */
  private stopFlowAnimation(): void {
    if (this.flowAnimationId !== null) {
      cancelAnimationFrame(this.flowAnimationId)
      this.flowAnimationId = null
    }
  }

  /** 绘制带时间偏移的流动虚线（沿 source→target 方向移动） */
  private drawFlowingDash(
    g: Graphics,
    flatPoints: CanvasPoint[],
    color: number,
  ): void {
    if (flatPoints.length < 2) return

    const cycle = FLOW_DASH + FLOW_GAP
    // 逻辑：反转偏移使虚线沿路径正方向（source→target）流动
    const phase = (cycle - (this.flowOffset % cycle)) % cycle
    let drawing = phase < FLOW_DASH
    let remaining = drawing ? FLOW_DASH - phase : cycle - phase

    g.setStrokeStyle({
      width: FLOW_WIDTH,
      color,
      alpha: FLOW_ALPHA,
      cap: 'round',
      join: 'round',
    })

    let [cx, cy] = flatPoints[0]
    if (drawing) {
      g.moveTo(cx, cy)
    }

    for (let i = 1; i < flatPoints.length; i++) {
      const [nx, ny] = flatPoints[i]
      let dx = nx - cx
      let dy = ny - cy
      let segLen = Math.hypot(dx, dy)

      while (segLen > 0) {
        const step = Math.min(remaining, segLen)
        const ratio = step / segLen
        const px = cx + dx * ratio
        const py = cy + dy * ratio

        if (drawing) {
          g.lineTo(px, py)
        } else {
          g.moveTo(px, py)
        }

        remaining -= step
        if (remaining <= 0) {
          drawing = !drawing
          remaining = drawing ? FLOW_DASH : FLOW_GAP
        }

        cx = px
        cy = py
        dx = nx - cx
        dy = ny - cy
        segLen = Math.hypot(dx, dy)
      }
    }
    g.stroke()
  }

  /** Draw connector path with dashed or solid stroke. */
  private drawConnectorPath(
    g: Graphics,
    path: CanvasConnectorPath,
    flatPoints: CanvasPoint[],
    dashed: boolean,
    style: { width: number; color: number; alpha: number },
  ): void {
    if (dashed) {
      this.drawDashedPath(g, flatPoints, style)
      return
    }
    this.drawSolidPath(g, path, style)
  }

  /** Draw dashed connector path. */
  private drawDashedPath(
    g: Graphics,
    flatPoints: CanvasPoint[],
    style: { width: number; color: number; alpha: number },
    dashLength = 6,
    gapLength = 4,
  ): void {
    if (flatPoints.length < 2) return
    g.setStrokeStyle({
      width: style.width,
      color: style.color,
      alpha: style.alpha,
      cap: 'round',
      join: 'round',
    })

    let drawing = true
    let remaining = dashLength
    let [cx, cy] = flatPoints[0]
    g.moveTo(cx, cy)

    for (let i = 1; i < flatPoints.length; i++) {
      const [nx, ny] = flatPoints[i]
      let dx = nx - cx
      let dy = ny - cy
      let segLen = Math.hypot(dx, dy)

      while (segLen > 0) {
        const step = Math.min(remaining, segLen)
        const ratio = step / segLen
        const px = cx + dx * ratio
        const py = cy + dy * ratio

        if (drawing) {
          g.lineTo(px, py)
        } else {
          g.moveTo(px, py)
        }

        remaining -= step
        if (remaining <= 0) {
          drawing = !drawing
          remaining = drawing ? dashLength : gapLength
        }

        cx = px
        cy = py
        dx = nx - cx
        dy = ny - cy
        segLen = Math.hypot(dx, dy)
      }
    }
    g.stroke()
  }

  /** Draw solid connector path. */
  private drawSolidPath(
    g: Graphics,
    path: CanvasConnectorPath,
    style: { width: number; color: number; alpha: number },
  ): void {
    g.setStrokeStyle({
      width: style.width,
      color: style.color,
      alpha: style.alpha,
      cap: 'round',
      join: 'round',
    })
    if (path.kind === 'polyline') {
      const pts = path.points
      if (pts.length < 2) return
      g.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i][0], pts[i][1])
      }
    } else {
      const [p0, p1, p2, p3] = path.points
      g.moveTo(p0[0], p0[1])
      g.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1])
    }
    g.stroke()
  }

  /** 绘制箭头 */
  private drawArrowHead(
    g: Graphics,
    from: CanvasPoint,
    to: CanvasPoint,
    size: number,
    color: number,
    width: number,
    alpha: number,
  ): void {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const sin = Math.sin(ARROW_ANGLE)
    const cos = Math.cos(ARROW_ANGLE)

    const lx = ux * cos - uy * sin
    const ly = ux * sin + uy * cos
    const rx = ux * cos + uy * sin
    const ry = -ux * sin + uy * cos

    const leftX = to[0] - lx * size
    const leftY = to[1] - ly * size
    const rightX = to[0] - rx * size
    const rightY = to[1] - ry * size

    g.setStrokeStyle({ width, color, alpha, cap: 'round', join: 'round' })
    g.moveTo(to[0], to[1])
    g.lineTo(leftX, leftY)
    g.moveTo(to[0], to[1])
    g.lineTo(rightX, rightY)
    g.stroke()
  }

  /** Parse CSS color string to PixiJS hex number. */
  private parseCssColor(color: string): number | null {
    if (color.startsWith('#')) {
      let hex = color.slice(1)
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
      }
      return Number.parseInt(hex.slice(0, 6), 16)
    }
    const rgbMatch = color.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
    )
    if (rgbMatch) {
      const r = Number.parseInt(rgbMatch[1], 10)
      const g = Number.parseInt(rgbMatch[2], 10)
      const b = Number.parseInt(rgbMatch[3], 10)
      return (r << 16) | (g << 8) | b
    }
    return null
  }

  destroy(): void {
    this.stopFlowAnimation()
    this.graphics.destroy()
    this.flowGraphics.destroy()
  }
}

/** 计算节点包围盒 */
function getNodeBounds(
  element: CanvasNodeElement,
  groupPadding: number,
): CanvasRect {
  const [x, y, w, h] = element.xywh
  const padding = isGroupNodeType(element.type) ? groupPadding : 0
  const paddedX = x - padding
  const paddedY = y - padding
  const paddedW = w + padding * 2
  const paddedH = h + padding * 2
  if (!element.rotate) {
    return { x: paddedX, y: paddedY, w: paddedW, h: paddedH }
  }
  const rad = (element.rotate * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // 旋转节点转成轴对齐包围盒
  const halfW = (Math.abs(paddedW * cos) + Math.abs(paddedH * sin)) / 2
  const halfH = (Math.abs(paddedW * sin) + Math.abs(paddedH * cos)) / 2
  const cx = paddedX + paddedW / 2
  const cy = paddedY + paddedH / 2
  return {
    x: cx - halfW,
    y: cy - halfH,
    w: halfW * 2,
    h: halfH * 2,
  }
}
