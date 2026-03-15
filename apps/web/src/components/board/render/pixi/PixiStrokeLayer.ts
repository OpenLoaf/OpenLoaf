/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Container, Graphics } from 'pixi.js'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type {
  CanvasNodeElement,
  StrokeNodeProps,
} from '../../engine/types'
import { STROKE_NODE_TYPE } from '../../engine/types'
import type { PixiThemeResolver } from './PixiThemeResolver'

/** 每条笔画的 PixiJS 状态 */
type StrokeState = {
  graphics: Graphics
  lastPropsKey: string
  lastXywhKey: string
}

/**
 * 渲染笔画节点的专用图层。
 * 使用 PixiJS 原生线条描边（非轮廓填充），避免三角形伪影。
 *
 * 支持：
 * - 笔（pen）：圆角描边线条
 * - 荧光笔（highlighter）：半透明宽笔
 */
export class PixiStrokeLayer {
  private engine: CanvasEngine
  private container: Container
  private theme: PixiThemeResolver
  private strokes = new Map<string, StrokeState>()
  private lastRevision = -1

  constructor(
    engine: CanvasEngine,
    container: Container,
    theme: PixiThemeResolver,
  ) {
    this.engine = engine
    this.container = container
    this.theme = theme
  }

  /** 同步笔画渲染与引擎状态 */
  sync(): void {
    const snapshot = this.engine.getSnapshot()
    if (snapshot.docRevision === this.lastRevision) return
    this.lastRevision = snapshot.docRevision

    const currentIds = new Set<string>()

    const strokeElements = snapshot.elements.filter(
      (el): el is CanvasNodeElement<StrokeNodeProps> =>
        el.kind === 'node' && el.type === STROKE_NODE_TYPE,
    )

    for (const element of strokeElements) {
      currentIds.add(element.id)
      const propsKey = JSON.stringify(element.props)
      const xywhKey = element.xywh.join(',')
      const existing = this.strokes.get(element.id)

      if (existing) {
        if (
          existing.lastPropsKey !== propsKey ||
          existing.lastXywhKey !== xywhKey
        ) {
          this.renderStroke(existing.graphics, element)
          existing.lastPropsKey = propsKey
          existing.lastXywhKey = xywhKey
        }
      } else {
        const graphics = new Graphics()
        graphics.label = `stroke:${element.id}`
        graphics.cullable = true
        this.renderStroke(graphics, element)
        this.container.addChild(graphics)
        this.strokes.set(element.id, {
          graphics,
          lastPropsKey: propsKey,
          lastXywhKey: xywhKey,
        })
      }

      const state = this.strokes.get(element.id)!
      this.applyTransform(state.graphics, element)
      state.graphics.zIndex = element.zIndex ?? 0
      if (element.opacity !== undefined) {
        state.graphics.alpha = element.opacity
      }
    }

    for (const [id, state] of this.strokes) {
      if (!currentIds.has(id)) {
        this.container.removeChild(state.graphics)
        state.graphics.destroy()
        this.strokes.delete(id)
      }
    }
  }

  /** 使用 PixiJS 原生线条渲染笔画（非轮廓填充） */
  private renderStroke(
    g: Graphics,
    element: CanvasNodeElement<StrokeNodeProps>,
  ): void {
    g.clear()

    const { points, color, size, opacity, tool } = element.props
    if (points.length === 0) return

    const parsedColor = this.parseCssColor(color) ?? 0xf59e0b
    const isHighlighter = tool === 'highlighter'
    const lineWidth = isHighlighter ? size * 3 : size
    const lineAlpha = isHighlighter ? opacity * 0.4 : opacity

    // 单点笔画：绘制圆点
    if (points.length === 1) {
      const [px, py] = points[0]
      g.circle(px, py, lineWidth / 2)
      g.fill({ color: parsedColor, alpha: lineAlpha })
      return
    }

    // 设置描边样式
    g.setStrokeStyle({
      width: lineWidth,
      color: parsedColor,
      alpha: lineAlpha,
      cap: 'round',
      join: 'round',
    })

    // 逻辑：用二次贝塞尔曲线平滑连接原始点，避免锯齿。
    const [firstX, firstY] = points[0]
    g.moveTo(firstX, firstY)

    if (points.length === 2) {
      // 两点直接连线
      g.lineTo(points[1][0], points[1][1])
    } else {
      // 多点：用中点 + quadraticCurveTo 平滑
      for (let i = 1; i < points.length - 1; i++) {
        const curr = points[i]
        const next = points[i + 1]
        const midX = (curr[0] + next[0]) / 2
        const midY = (curr[1] + next[1]) / 2
        g.quadraticCurveTo(curr[0], curr[1], midX, midY)
      }
      // 最后一个点
      const last = points[points.length - 1]
      g.lineTo(last[0], last[1])
    }

    g.stroke()
  }

  /** 应用节点位置和旋转 */
  private applyTransform(
    target: Graphics,
    element: CanvasNodeElement,
  ): void {
    const [x, y, w, h] = element.xywh
    target.position.set(x, y)
    if (element.rotate) {
      target.pivot.set(w / 2, h / 2)
      target.position.set(x + w / 2, y + h / 2)
      target.rotation = (element.rotate * Math.PI) / 180
    } else {
      target.pivot.set(0, 0)
      target.rotation = 0
    }
  }

  /** 解析 CSS 颜色到十六进制数值 */
  private parseCssColor(color: string): number | null {
    if (!color) return null
    const trimmed = color.trim()
    if (trimmed.startsWith('#')) {
      let hex = trimmed.slice(1)
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
      }
      if (hex.length >= 6) {
        return Number.parseInt(hex.slice(0, 6), 16)
      }
    }
    const rgbMatch = trimmed.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
    )
    if (rgbMatch) {
      const r = Number.parseInt(rgbMatch[1], 10)
      const gVal = Number.parseInt(rgbMatch[2], 10)
      const b = Number.parseInt(rgbMatch[3], 10)
      return (r << 16) | (gVal << 8) | b
    }
    return null
  }

  destroy(): void {
    for (const [, state] of this.strokes) {
      state.graphics.destroy()
    }
    this.strokes.clear()
  }
}
