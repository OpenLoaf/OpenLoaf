/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AlphaFilter, Container, Graphics } from 'pixi.js'
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
  alphaFilter: AlphaFilter | null
  lastPropsKey: string
  lastXywhKey: string
}

/**
 * 渲染笔画节点的专用图层。
 *
 * - 笔（pen）：PixiJS Graphics 原生线条描边
 * - 荧光笔（highlighter）：Graphics 以 alpha=1 绘制，容器 alpha 控制整体透明度，
 *   避免自交叉处颜色叠加。PixiJS 容器的 alpha 作用于合成阶段，不会导致内部像素叠加。
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
          this.renderStroke(existing.graphics, element, existing.alphaFilter)
          existing.lastPropsKey = propsKey
          existing.lastXywhKey = xywhKey
        }
      } else {
        const graphics = new Graphics()
        graphics.label = `stroke:${element.id}`
        graphics.cullable = true
        this.container.addChild(graphics)
        this.strokes.set(element.id, {
          graphics,
          alphaFilter: null,
          lastPropsKey: propsKey,
          lastXywhKey: xywhKey,
        })
        this.renderStroke(graphics, element, null)
      }

      const state = this.strokes.get(element.id)!
      this.applyTransform(state.graphics, element)
      state.graphics.zIndex = element.zIndex ?? 0
    }

    for (const [id, state] of this.strokes) {
      if (!currentIds.has(id)) {
        this.container.removeChild(state.graphics)
        state.alphaFilter?.destroy()
        state.graphics.destroy()
        this.strokes.delete(id)
      }
    }
  }

  /** 使用 PixiJS 原生线条渲染笔画 */
  private renderStroke(
    g: Graphics,
    element: CanvasNodeElement<StrokeNodeProps>,
    existingFilter: AlphaFilter | null,
  ): void {
    g.clear()

    const { points, color, size, opacity, tool } = element.props
    if (points.length === 0) return

    const parsedColor = this.parseCssColor(color) ?? 0xf59e0b
    const isHighlighter = tool === 'highlighter'
    const lineWidth = isHighlighter ? size * 3 : size

    // 单点笔画
    if (points.length === 1) {
      const [px, py] = points[0]
      g.circle(px, py, lineWidth / 2)
      g.fill({ color: parsedColor, alpha: 1 })
      if (isHighlighter) {
        const targetAlpha = opacity * 0.4
        const filter = existingFilter ?? new AlphaFilter({ alpha: targetAlpha })
        filter.alpha = targetAlpha
        g.filters = [filter]
        this.updateStrokeFilter(element.id, filter)
      } else {
        g.filters = []
        g.alpha = opacity
        this.updateStrokeFilter(element.id, null)
      }
      return
    }

    // 逻辑：所有笔画以 alpha=1 绘制线条。
    g.setStrokeStyle({
      width: lineWidth,
      color: parsedColor,
      alpha: 1,
      cap: 'round',
      join: 'round',
    })

    const [firstX, firstY] = points[0]
    g.moveTo(firstX, firstY)

    if (points.length === 2) {
      g.lineTo(points[1][0], points[1][1])
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const curr = points[i]
        const next = points[i + 1]
        const midX = (curr[0] + next[0]) / 2
        const midY = (curr[1] + next[1]) / 2
        g.quadraticCurveTo(curr[0], curr[1], midX, midY)
      }
      const last = points[points.length - 1]
      g.lineTo(last[0], last[1])
    }

    g.stroke()

    if (isHighlighter) {
      // 逻辑：AlphaFilter 会先将 Graphics 渲染到离屏帧缓冲（alpha=1，无自叠加），
      // 再以目标 alpha 合成到画布。这是 PixiJS 中实现"组透明度"的标准方式。
      // 复用已有的 AlphaFilter 实例，避免 GPU 资源在帧内被回收导致 BindGroup.setResource 报错。
      const targetAlpha = opacity * 0.8
      const filter = existingFilter ?? new AlphaFilter({ alpha: targetAlpha })
      filter.alpha = targetAlpha
      g.filters = [filter]
      this.updateStrokeFilter(element.id, filter)
    } else {
      g.filters = []
      g.alpha = opacity
      this.updateStrokeFilter(element.id, null)
    }
  }

  /** 更新笔画状态中缓存的 AlphaFilter 引用 */
  private updateStrokeFilter(id: string, filter: AlphaFilter | null): void {
    const state = this.strokes.get(id)
    if (state) {
      state.alphaFilter = filter
    }
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
    // hsl(h, s%, l%) 支持
    const hslMatch = trimmed.match(
      /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/,
    )
    if (hslMatch) {
      const h = Number.parseFloat(hslMatch[1]) / 360
      const s = Number.parseFloat(hslMatch[2]) / 100
      const l = Number.parseFloat(hslMatch[3]) / 100
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
      }
      let r: number, g: number, b: number
      if (s === 0) {
        r = g = b = l
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const p = 2 * l - q
        r = hue2rgb(p, q, h + 1 / 3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1 / 3)
      }
      const ri = Math.round(r * 255)
      const gi = Math.round(g * 255)
      const bi = Math.round(b * 255)
      return (ri << 16) | (gi << 8) | bi
    }
    return null
  }

  destroy(): void {
    for (const [, state] of this.strokes) {
      state.alphaFilter?.destroy()
      state.graphics.destroy()
    }
    this.strokes.clear()
  }
}
