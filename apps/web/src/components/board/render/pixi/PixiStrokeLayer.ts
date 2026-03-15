/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type {
  CanvasNodeElement,
  StrokeNodeProps,
} from '../../engine/types'
import { STROKE_NODE_TYPE } from '../../engine/types'
import type { PixiThemeResolver } from './PixiThemeResolver'

/** 每条笔画的 PixiJS 状态 */
type StrokeState = {
  /** 容器（持有 graphics 或 sprite） */
  container: Container
  /** 原始 Graphics（pen 直接用，highlighter 离屏渲染后销毁） */
  graphics: Graphics
  /** 荧光笔专用：离屏纹理渲染后的 Sprite */
  sprite: Sprite | null
  /** 荧光笔专用：离屏纹理 */
  renderTexture: RenderTexture | null
  lastPropsKey: string
  lastXywhKey: string
}

/**
 * 渲染笔画节点的专用图层。
 *
 * - 笔（pen）：PixiJS Graphics 原生线条描边
 * - 荧光笔（highlighter）：先以 alpha=1 绘制到 RenderTexture，
 *   再用 Sprite 以目标 alpha 显示，避免自交叉处颜色叠加
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
          this.renderStroke(existing, element)
          existing.lastPropsKey = propsKey
          existing.lastXywhKey = xywhKey
        }
      } else {
        const state = this.createStrokeState(element)
        this.strokes.set(element.id, state)
        this.container.addChild(state.container)
      }

      const state = this.strokes.get(element.id)!
      this.applyTransform(state.container, element)
      state.container.zIndex = element.zIndex ?? 0
    }

    for (const [id, state] of this.strokes) {
      if (!currentIds.has(id)) {
        this.container.removeChild(state.container)
        this.destroyState(state)
        this.strokes.delete(id)
      }
    }
  }

  /** 创建笔画状态 */
  private createStrokeState(
    element: CanvasNodeElement<StrokeNodeProps>,
  ): StrokeState {
    const cont = new Container()
    cont.label = `stroke:${element.id}`
    cont.cullable = true

    const graphics = new Graphics()

    const state: StrokeState = {
      container: cont,
      graphics,
      sprite: null,
      renderTexture: null,
      lastPropsKey: JSON.stringify(element.props),
      lastXywhKey: element.xywh.join(','),
    }

    this.renderStroke(state, element)
    return state
  }

  /** 渲染单条笔画 */
  private renderStroke(
    state: StrokeState,
    element: CanvasNodeElement<StrokeNodeProps>,
  ): void {
    const { points, color, size, opacity, tool } = element.props
    const g = state.graphics
    g.clear()

    // 清理上一次的 sprite/texture
    if (state.sprite) {
      state.container.removeChild(state.sprite)
      state.sprite.destroy()
      state.sprite = null
    }
    if (state.renderTexture) {
      state.renderTexture.destroy(true)
      state.renderTexture = null
    }
    // 先把 graphics 从容器移除（重新添加或用 sprite 替代）
    if (g.parent) g.parent.removeChild(g)

    if (points.length === 0) return

    const parsedColor = this.parseCssColor(color) ?? 0xf59e0b
    const isHighlighter = tool === 'highlighter'
    const lineWidth = isHighlighter ? size * 3 : size

    // 单点笔画
    if (points.length === 1) {
      const [px, py] = points[0]
      g.circle(px, py, lineWidth / 2)
      g.fill({ color: parsedColor, alpha: 1 })
      state.container.addChild(g)
      state.container.alpha = isHighlighter ? opacity * 0.4 : opacity
      return
    }

    // 绘制线条（alpha=1，颜色不叠加）
    g.setStrokeStyle({
      width: lineWidth,
      color: parsedColor,
      alpha: 1,
      cap: 'round',
      join: 'round',
    })
    this.drawSmoothLine(g, points)
    g.stroke()

    if (isHighlighter) {
      // 逻辑：荧光笔用 RenderTexture 离屏渲染后以目标 alpha 显示。
      // 这样同一笔画内自交叉处不会 alpha 叠加。
      const renderer = this.getRenderer()
      if (renderer) {
        const [, , w, h] = element.xywh
        // 离屏纹理尺寸需要覆盖笔画范围（加边距避免截断）
        const padding = lineWidth
        const texW = Math.ceil(w + padding * 2) || 1
        const texH = Math.ceil(h + padding * 2) || 1

        const rt = RenderTexture.create({ width: texW, height: texH })
        // 将 graphics 偏移到纹理坐标系
        g.position.set(padding, padding)
        renderer.render({ container: g, target: rt })
        g.position.set(0, 0)

        const sprite = new Sprite(rt)
        sprite.position.set(-padding, -padding)
        sprite.alpha = opacity * 0.4
        state.container.addChild(sprite)
        state.sprite = sprite
        state.renderTexture = rt
      } else {
        // renderer 不可用时回退到直接显示
        state.container.addChild(g)
        state.container.alpha = opacity * 0.4
      }
    } else {
      // 普通笔：直接添加 Graphics
      state.container.addChild(g)
      state.container.alpha = opacity
    }
  }

  /** 用二次贝塞尔曲线平滑连接点 */
  private drawSmoothLine(
    g: Graphics,
    points: StrokeNodeProps['points'],
  ): void {
    const [firstX, firstY] = points[0]
    g.moveTo(firstX, firstY)

    if (points.length === 2) {
      g.lineTo(points[1][0], points[1][1])
      return
    }

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

  /** 获取 PixiJS renderer 引用 */
  private getRenderer() {
    // 通过 container 的 parent chain 找到 Application 的 renderer
    let current: Container | null = this.container
    while (current) {
      // PixiJS v8: stage 的 parent 为 null，但 Application 可通过全局获取
      current = current.parent ?? null
    }
    // 回退：通过全局引用获取（PixiApplication 会设置）
    return (globalThis as Record<string, unknown>).__pixiRenderer as
      | import('pixi.js').Renderer
      | undefined
  }

  /** 应用节点位置和旋转 */
  private applyTransform(
    target: Container,
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

  private destroyState(state: StrokeState): void {
    if (state.sprite) state.sprite.destroy()
    if (state.renderTexture) state.renderTexture.destroy(true)
    state.graphics.destroy()
    state.container.destroy({ children: true })
  }

  destroy(): void {
    for (const [, state] of this.strokes) {
      this.destroyState(state)
    }
    this.strokes.clear()
  }
}
