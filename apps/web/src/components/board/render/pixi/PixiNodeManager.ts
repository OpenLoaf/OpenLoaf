/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Container, Graphics, Text, Sprite, Texture, type TextStyleOptions } from "pixi.js"
import type { CanvasEngine } from "../../engine/CanvasEngine"
import type { CanvasNodeElement, CanvasElement } from "../../engine/types"
import { isGroupNodeType } from "../../engine/grouping"
import type { PixiThemeResolver } from "./PixiThemeResolver"

/** Per-node PixiJS state. */
type PixiNodeState = {
  container: Container
  bg: Graphics
  label: Text | null
  sprite: Sprite | null
  lastXywh: string
  lastProps: string
  lastZIndex: number
}

const TEXT_STYLE: TextStyleOptions = {
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 14,
  fill: 0xffffff,
  wordWrap: true,
  wordWrapWidth: 280,
}

/**
 * Manages PixiJS containers for all canvas node elements.
 * On each sync(), diffs the engine snapshot against current nodes
 * and creates/updates/destroys PixiJS objects as needed.
 *
 * Rendering strategy per node type:
 * - TextNode: PixiJS Text with background Graphics
 * - ImageNode: PixiJS Sprite from image URL texture
 * - GroupNode: Semi-transparent Graphics overlay
 * - StrokeNode: Graphics path drawing
 * - Others: Rounded rect placeholder with title
 *
 * Active editing uses a DOM overlay (managed externally).
 */
export class PixiNodeManager {
  private engine: CanvasEngine
  private nodeLayer: Container
  private theme: PixiThemeResolver
  private nodes = new Map<string, PixiNodeState>()
  private lastRevision = -1

  constructor(
    engine: CanvasEngine,
    nodeLayer: Container,
    theme: PixiThemeResolver,
  ) {
    this.engine = engine
    this.nodeLayer = nodeLayer
    this.theme = theme
  }

  /** Synchronize PixiJS nodes with engine state. */
  sync(): void {
    const snapshot = this.engine.getSnapshot()
    if (snapshot.docRevision === this.lastRevision) return
    this.lastRevision = snapshot.docRevision

    const palette = this.theme.getPalette()
    const currentIds = new Set<string>()

    // 按 zIndex 排序的节点元素
    const nodeElements = snapshot.elements.filter(
      (el): el is CanvasNodeElement => el.kind === "node",
    )

    for (const element of nodeElements) {
      currentIds.add(element.id)
      const existing = this.nodes.get(element.id)
      const xywhKey = element.xywh.join(",")
      const propsKey = JSON.stringify(element.props ?? {})
      const zIndex = element.zIndex ?? 0

      if (existing) {
        // 更新已有节点
        let needsRedraw = false
        if (existing.lastXywh !== xywhKey) {
          this.applyTransform(existing.container, element)
          existing.lastXywh = xywhKey
        }
        if (existing.lastProps !== propsKey) {
          needsRedraw = true
          existing.lastProps = propsKey
        }
        if (existing.lastZIndex !== zIndex) {
          existing.container.zIndex = zIndex
          existing.lastZIndex = zIndex
        }
        if (needsRedraw) {
          this.redrawNode(existing, element, palette)
        }
      } else {
        // 创建新节点
        const state = this.createNode(element, palette)
        this.nodes.set(element.id, state)
        this.nodeLayer.addChild(state.container)
      }
    }

    // 删除已移除的节点
    for (const [id, state] of this.nodes) {
      if (!currentIds.has(id)) {
        this.nodeLayer.removeChild(state.container)
        state.container.destroy({ children: true })
        this.nodes.delete(id)
      }
    }
  }

  /** Create a PixiJS node container for an element. */
  private createNode(
    element: CanvasNodeElement,
    palette: ReturnType<PixiThemeResolver["getPalette"]>,
  ): PixiNodeState {
    const container = new Container()
    container.label = `node:${element.id}`
    container.cullable = true

    const bg = new Graphics()
    container.addChild(bg)

    let label: Text | null = null
    let sprite: Sprite | null = null

    const [, , w, h] = element.xywh

    if (isGroupNodeType(element.type)) {
      // 分组节点：半透明遮罩
      bg.roundRect(0, 0, w, h, 8)
      bg.fill({ color: palette.groupOutline, alpha: 0.1 })
      bg.stroke({ color: palette.groupOutline, width: 1, alpha: 0.3 })
    } else if (element.type === "image") {
      // 图片节点：加载纹理
      const props = element.props as Record<string, unknown>
      const src =
        (props.previewSrc as string) || (props.src as string) || ""
      if (src) {
        try {
          const texture = Texture.from(src)
          sprite = new Sprite(texture)
          sprite.width = w
          sprite.height = h
          container.addChild(sprite)
        } catch {
          // 加载失败，显示占位
          bg.roundRect(0, 0, w, h, 8)
          bg.fill({ color: palette.nodeBg })
        }
      } else {
        bg.roundRect(0, 0, w, h, 8)
        bg.fill({ color: palette.nodeBg })
      }
    } else if (element.type === "stroke") {
      // 笔画节点：绘制路径
      this.drawStroke(bg, element)
    } else {
      // 通用节点：圆角矩形 + 标题
      bg.roundRect(0, 0, w, h, 8)
      bg.fill({ color: palette.nodeBg })
      bg.stroke({ color: palette.nodeBorder, width: 1 })

      const title = this.getNodeTitle(element)
      if (title) {
        label = new Text({
          text: title,
          style: {
            ...TEXT_STYLE,
            fill: palette.nodeText,
            wordWrapWidth: Math.max(40, w - 20),
          },
        })
        label.position.set(10, 10)
        container.addChild(label)
      }
    }

    this.applyTransform(container, element)
    container.zIndex = element.zIndex ?? 0
    if (element.opacity !== undefined) {
      container.alpha = element.opacity
    }

    return {
      container,
      bg,
      label,
      sprite,
      lastXywh: element.xywh.join(","),
      lastProps: JSON.stringify(element.props ?? {}),
      lastZIndex: element.zIndex ?? 0,
    }
  }

  /** Redraw a node's visual content after props change. */
  private redrawNode(
    state: PixiNodeState,
    element: CanvasNodeElement,
    palette: ReturnType<PixiThemeResolver["getPalette"]>,
  ): void {
    const [, , w, h] = element.xywh
    state.bg.clear()

    if (isGroupNodeType(element.type)) {
      state.bg.roundRect(0, 0, w, h, 8)
      state.bg.fill({ color: palette.groupOutline, alpha: 0.1 })
      state.bg.stroke({ color: palette.groupOutline, width: 1, alpha: 0.3 })
    } else if (element.type === "stroke") {
      this.drawStroke(state.bg, element)
    } else {
      state.bg.roundRect(0, 0, w, h, 8)
      state.bg.fill({ color: palette.nodeBg })
      state.bg.stroke({ color: palette.nodeBorder, width: 1 })

      if (state.label) {
        const title = this.getNodeTitle(element)
        state.label.text = title || ""
        state.label.style.wordWrapWidth = Math.max(40, w - 20)
      }
    }

    if (state.sprite && element.type === "image") {
      state.sprite.width = w
      state.sprite.height = h
    }
  }

  /** Apply position and rotation to a container. */
  private applyTransform(container: Container, element: CanvasNodeElement): void {
    const [x, y, w, h] = element.xywh
    container.position.set(x, y)
    if (element.rotate) {
      container.pivot.set(w / 2, h / 2)
      container.position.set(x + w / 2, y + h / 2)
      container.rotation = (element.rotate * Math.PI) / 180
    } else {
      container.pivot.set(0, 0)
      container.rotation = 0
    }
  }

  /** Draw a stroke path on a Graphics object. */
  private drawStroke(g: Graphics, element: CanvasNodeElement): void {
    const props = element.props as {
      points?: [number, number, number?][]
      color?: string
      size?: number
      opacity?: number
      tool?: string
    }
    if (!props.points || props.points.length < 2) return

    const [ox, oy] = element.xywh
    const color = props.color || "#ffffff"
    const size = props.size || 2
    const alpha = props.tool === "highlighter" ? (props.opacity ?? 0.4) : 1

    g.setStrokeStyle({
      width: size,
      color,
      alpha,
      cap: "round",
      join: "round",
    })

    const points = props.points
    g.moveTo(points[0][0] - ox, points[0][1] - oy)
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i][0] - ox, points[i][1] - oy)
    }
    g.stroke()
  }

  /** Extract a display title from node props. */
  private getNodeTitle(element: CanvasNodeElement): string {
    const props = element.props as Record<string, unknown>
    if (typeof props.title === "string") return props.title
    if (typeof props.name === "string") return props.name
    if (typeof props.label === "string") return props.label
    if (typeof props.text === "string") return props.text.slice(0, 100)
    return element.type
  }

  /** Set the visibility of a specific node by id. */
  setNodeVisible(nodeId: string, visible: boolean): void {
    const state = this.nodes.get(nodeId)
    if (state) {
      state.container.visible = visible
    }
  }

  destroy(): void {
    for (const [, state] of this.nodes) {
      state.container.destroy({ children: true })
    }
    this.nodes.clear()
  }
}
