/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Container, Graphics } from "pixi.js"
import type { CanvasEngine } from "../../engine/CanvasEngine"
import type { PixiThemeResolver } from "./PixiThemeResolver"

/**
 * Renders screen-space overlays: selection box, alignment guides, anchor dots.
 * These are in the overlay container (not affected by viewport transform).
 */
/** 锚点圆点大小（屏幕像素） */
const ANCHOR_DOT_RADIUS = 4
/** 锚点外环大小 */
const ANCHOR_DOT_RING = 6

export class PixiOverlayLayer {
  private engine: CanvasEngine
  private container: Container
  private worldContainer: Container
  private theme: PixiThemeResolver
  private selectionBoxGfx = new Graphics()
  private alignmentGfx = new Graphics()
  private selectionOutlineGfx = new Graphics()
  private anchorGfx = new Graphics()

  constructor(
    engine: CanvasEngine,
    container: Container,
    worldContainer: Container,
    theme: PixiThemeResolver,
  ) {
    this.engine = engine
    this.container = container
    this.worldContainer = worldContainer
    this.theme = theme

    container.addChild(this.selectionBoxGfx)
    container.addChild(this.alignmentGfx)
    container.addChild(this.selectionOutlineGfx)
    container.addChild(this.anchorGfx)
  }

  /** Sync overlays with engine snapshot (called on snapshot change). */
  sync(): void {
    const snapshot = this.engine.getSnapshot()
    const palette = this.theme.getPalette()
    const { zoom, offset } = snapshot.viewport

    // 选区框
    this.selectionBoxGfx.clear()
    if (snapshot.selectionBox) {
      const sb = snapshot.selectionBox
      const sx = sb.x * zoom + offset[0]
      const sy = sb.y * zoom + offset[1]
      const sw = sb.w * zoom
      const sh = sb.h * zoom
      this.selectionBoxGfx.rect(sx, sy, sw, sh)
      this.selectionBoxGfx.fill({ color: palette.selectionFill, alpha: 0.08 })
      this.selectionBoxGfx.stroke({ color: palette.selectionBorder, width: 1, alpha: 0.5 })
    }

    // 对齐参考线
    this.alignmentGfx.clear()
    if (snapshot.alignmentGuides.length > 0) {
      this.alignmentGfx.setStrokeStyle({
        width: 1,
        color: palette.alignmentGuide,
        alpha: 0.8,
      })
      for (const guide of snapshot.alignmentGuides) {
        if (guide.axis === "x") {
          const sx = guide.value * zoom + offset[0]
          const sy1 = guide.start * zoom + offset[1]
          const sy2 = guide.end * zoom + offset[1]
          this.alignmentGfx.moveTo(sx, sy1)
          this.alignmentGfx.lineTo(sx, sy2)
        } else {
          const sy = guide.value * zoom + offset[1]
          const sx1 = guide.start * zoom + offset[0]
          const sx2 = guide.end * zoom + offset[0]
          this.alignmentGfx.moveTo(sx1, sy)
          this.alignmentGfx.lineTo(sx2, sy)
        }
      }
      this.alignmentGfx.stroke()
    }

    // 逻辑：stroke 节点没有 DOM 表示，需要在 PixiJS 中绘制选中轮廓。
    this.selectionOutlineGfx.clear()
    if (snapshot.selectedIds.length > 0) {
      for (const id of snapshot.selectedIds) {
        const element = snapshot.elements.find((e) => e.id === id)
        if (!element || element.kind !== "node") continue
        if (element.type !== "stroke") continue
        const [x, y, w, h] = element.xywh
        // 逻辑：笔画线宽会超出 xywh 包围盒，需要外扩半个线宽作为选中轮廓的边距。
        const props = element.props as { size?: number; tool?: string }
        const strokeSize = props.size ?? 2
        const lineWidth = props.tool === "highlighter" ? strokeSize * 3 : strokeSize
        const pad = lineWidth / 2 + 4
        const sx = (x - pad) * zoom + offset[0]
        const sy = (y - pad) * zoom + offset[1]
        const sw = (w + pad * 2) * zoom
        const sh = (h + pad * 2) * zoom
        this.selectionOutlineGfx.roundRect(sx, sy, sw, sh, 4)
        this.selectionOutlineGfx.stroke({
          color: palette.selectionBorder,
          width: 1.5,
          alpha: 0.8,
        })
      }
    }

    // 锚点圆点（hover 节点和选中节点显示连接锚点）
    this.anchorGfx.clear()
    const anchorNodeIds = new Set<string>()
    // 悬停的节点显示锚点
    if (snapshot.nodeHoverId) {
      anchorNodeIds.add(snapshot.nodeHoverId)
    }
    // 选中的节点也显示锚点
    for (const id of snapshot.selectedIds) {
      const el = snapshot.elements.find(e => e.id === id)
      if (el?.kind === "node") anchorNodeIds.add(id)
    }

    if (anchorNodeIds.size > 0) {
      for (const nodeId of anchorNodeIds) {
        const anchors = snapshot.anchors[nodeId]
        if (!anchors) continue
        for (const anchor of anchors) {
          const sx = anchor.point[0] * zoom + offset[0]
          const sy = anchor.point[1] * zoom + offset[1]
          // 外环（白色）
          this.anchorGfx.circle(sx, sy, ANCHOR_DOT_RING)
          this.anchorGfx.fill({ color: 0xffffff, alpha: 0.9 })
          // 内圆（蓝色）
          this.anchorGfx.circle(sx, sy, ANCHOR_DOT_RADIUS)
          this.anchorGfx.fill({ color: palette.anchor, alpha: 1 })
        }
      }
    }
  }

  /** Sync overlay positions on viewport change (no snapshot change). */
  syncView(): void {
    // 对齐线和选区框依赖世界坐标，视口变化时需要重绘
    this.sync()
  }

  destroy(): void {
    this.selectionBoxGfx.destroy()
    this.alignmentGfx.destroy()
    this.selectionOutlineGfx.destroy()
    this.anchorGfx.destroy()
  }
}
