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
  CanvasPoint,
  CanvasStrokePoint,
  StrokeNodeProps,
} from '../../engine/types'
import { STROKE_NODE_TYPE } from '../../engine/types'
import { buildStrokeOutline } from '../../utils/stroke-path'
import type { PixiThemeResolver } from './PixiThemeResolver'

/** 每条笔画的 PixiJS 状态 */
type StrokeState = {
  graphics: Graphics
  lastPropsKey: string
  lastXywhKey: string
}

/**
 * 渲染笔画节点的专用图层。
 * 使用 perfect-freehand 计算轮廓，通过 PixiJS Graphics 填充路径，
 * 和 StrokeNode 的 SVG 渲染保持视觉一致。
 *
 * 支持：
 * - 笔（pen）：带压力敏感的细腻线条
 * - 荧光笔（highlighter）：半透明均匀宽笔
 * - 二次贝塞尔曲线平滑轮廓
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

    // 找到所有笔画节点
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
        // 检查是否需要重绘
        if (
          existing.lastPropsKey !== propsKey ||
          existing.lastXywhKey !== xywhKey
        ) {
          this.renderStroke(existing.graphics, element)
          existing.lastPropsKey = propsKey
          existing.lastXywhKey = xywhKey
        }
      } else {
        // 新建笔画
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

      // 应用节点变换
      const state = this.strokes.get(element.id)!
      this.applyTransform(state.graphics, element)
      state.graphics.zIndex = element.zIndex ?? 0
      if (element.opacity !== undefined) {
        state.graphics.alpha = element.opacity
      }
    }

    // 移除已删除的笔画
    for (const [id, state] of this.strokes) {
      if (!currentIds.has(id)) {
        this.container.removeChild(state.graphics)
        state.graphics.destroy()
        this.strokes.delete(id)
      }
    }
  }

  /** 渲染单条笔画 */
  private renderStroke(
    g: Graphics,
    element: CanvasNodeElement<StrokeNodeProps>,
  ): void {
    g.clear()

    const { points, color, size, opacity, tool } = element.props
    if (points.length === 0) return

    const parsedColor = this.parseCssColor(color) ?? 0xf59e0b

    // 单点笔画：绘制圆点（转为节点本地坐标）
    if (points.length === 1) {
      const [ox, oy] = element.xywh
      const [px, py] = points[0]
      g.circle(px - ox, py - oy, size / 2)
      g.fill({ color: parsedColor, alpha: opacity })
      return
    }

    // 使用 perfect-freehand 计算轮廓点（世界坐标）
    const outline = buildStrokeOutline(points, { size, tool })
    if (outline.length === 0) return

    // 逻辑：轮廓点是世界坐标，但 Graphics 已被 applyTransform 移到 (x,y)，
    // 需要减去节点原点偏移转为节点本地坐标。
    const [ox, oy] = element.xywh
    const localOutline: CanvasPoint[] = outline.map(([px, py]) => [
      px - ox,
      py - oy,
    ])

    // 使用二次贝塞尔曲线平滑轮廓并填充
    this.drawSmoothOutline(g, localOutline, parsedColor, opacity)
  }

  /** 使用二次贝塞尔曲线绘制平滑的填充轮廓 */
  private drawSmoothOutline(
    g: Graphics,
    outline: CanvasPoint[],
    color: number,
    alpha: number,
  ): void {
    if (outline.length < 2) return

    const first = outline[0]
    g.moveTo(first[0], first[1])

    // 使用二次贝塞尔曲线连接轮廓点，和 StrokeNode SVG 实现保持一致
    for (let i = 0; i < outline.length; i++) {
      const current = outline[i]
      const next = outline[(i + 1) % outline.length]
      const midX = (current[0] + next[0]) / 2
      const midY = (current[1] + next[1]) / 2
      g.quadraticCurveTo(current[0], current[1], midX, midY)
    }

    g.closePath()
    g.fill({ color, alpha })
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
      const g = Number.parseInt(rgbMatch[2], 10)
      const b = Number.parseInt(rgbMatch[3], 10)
      return (r << 16) | (g << 8) | b
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
