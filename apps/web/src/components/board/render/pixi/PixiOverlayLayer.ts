/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Container, Graphics } from "pixi.js"
import type { CanvasEngine } from "../../engine/CanvasEngine"
import type { StrokeNodeProps } from "../../engine/types"
import type { PixiThemeResolver } from "./PixiThemeResolver"

/**
 * Renders screen-space overlays: selection box, anchor dots.
 * These are in the overlay container (not affected by viewport transform).
 */
export class PixiOverlayLayer {
  private engine: CanvasEngine
  private container: Container
  private worldContainer: Container
  private theme: PixiThemeResolver
  private selectionBoxGfx = new Graphics()
  private selectionOutlineGfx = new Graphics()
  /** 脏检查缓存 */
  private lastSelectionBox: import("../../engine/types").CanvasSelectionBox | null = null
  private lastSelectedKey = ''
  private lastDocRevision = -1
  private lastZoom = -1
  private lastOffsetX = -1
  private lastOffsetY = -1

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
    container.addChild(this.selectionOutlineGfx)
  }

  /** Sync overlays with engine snapshot (called on snapshot change). */
  sync(): void {
    const snapshot = this.engine.getSnapshot()
    const selectedKey = snapshot.selectedIds.join(',')
    const { zoom, offset } = snapshot.viewport

    // 脏检查：内容和视口都未变化时跳过重绘
    if (
      snapshot.selectionBox === this.lastSelectionBox
      && selectedKey === this.lastSelectedKey
      && snapshot.docRevision === this.lastDocRevision
      && zoom === this.lastZoom
      && offset[0] === this.lastOffsetX
      && offset[1] === this.lastOffsetY
    ) return

    this.lastSelectionBox = snapshot.selectionBox
    this.lastSelectedKey = selectedKey
    this.lastDocRevision = snapshot.docRevision
    this.lastZoom = zoom
    this.lastOffsetX = offset[0]
    this.lastOffsetY = offset[1]

    const palette = this.theme.getPalette()

    // 选区框（虚线直角）
    this.selectionBoxGfx.clear()
    if (snapshot.selectionBox) {
      const sb = snapshot.selectionBox
      const sx = sb.x * zoom + offset[0]
      const sy = sb.y * zoom + offset[1]
      const sw = sb.w * zoom
      const sh = sb.h * zoom

      // 半透明填充
      this.selectionBoxGfx.rect(sx, sy, sw, sh)
      this.selectionBoxGfx.fill({ color: palette.selectionFill, alpha: 0.06 })

      // 虚线边框
      const dash = 6
      const gap = 4
      this.selectionBoxGfx.setStrokeStyle({
        width: 1,
        color: palette.selectionBorder,
        alpha: 0.7,
      })
      drawDashedRect(this.selectionBoxGfx, sx, sy, sw, sh, dash, gap)
      this.selectionBoxGfx.stroke()
    }

    // 逻辑：stroke 节点没有 DOM 表示，选中时沿笔迹路径绘制加粗高亮轮廓。
    this.selectionOutlineGfx.clear()
    if (snapshot.selectedIds.length > 0) {
      for (const id of snapshot.selectedIds) {
        const element = snapshot.elements.find((e) => e.id === id)
        if (!element || element.kind !== "node") continue
        if (element.type !== "stroke") continue
        const [ex, ey] = element.xywh
        const props = element.props as StrokeNodeProps
        const { points, size, tool } = props
        if (!points || points.length === 0) continue

        const isHighlighter = tool === "highlighter"
        const lineWidth = isHighlighter ? size * 3 : size
        // 选中高亮：原始线宽 + 额外加粗，转换到屏幕空间
        const highlightWidth = (lineWidth + 6) * zoom

        const toScreenX = (px: number) => (ex + px) * zoom + offset[0]
        const toScreenY = (py: number) => (ey + py) * zoom + offset[1]

        if (points.length === 1) {
          const sx = toScreenX(points[0][0])
          const sy = toScreenY(points[0][1])
          this.selectionOutlineGfx.circle(sx, sy, highlightWidth / 2)
          this.selectionOutlineGfx.fill({
            color: palette.selectionBorder,
            alpha: 0.3,
          })
          continue
        }

        this.selectionOutlineGfx.setStrokeStyle({
          width: highlightWidth,
          color: palette.selectionBorder,
          alpha: 0.3,
          cap: "round",
          join: "round",
        })

        const fx = toScreenX(points[0][0])
        const fy = toScreenY(points[0][1])
        this.selectionOutlineGfx.moveTo(fx, fy)

        if (points.length === 2) {
          this.selectionOutlineGfx.lineTo(
            toScreenX(points[1][0]),
            toScreenY(points[1][1]),
          )
        } else {
          for (let i = 1; i < points.length - 1; i++) {
            const curr = points[i]
            const next = points[i + 1]
            const cx = toScreenX(curr[0])
            const cy = toScreenY(curr[1])
            const mx = toScreenX((curr[0] + next[0]) / 2)
            const my = toScreenY((curr[1] + next[1]) / 2)
            this.selectionOutlineGfx.quadraticCurveTo(cx, cy, mx, my)
          }
          const last = points[points.length - 1]
          this.selectionOutlineGfx.lineTo(
            toScreenX(last[0]),
            toScreenY(last[1]),
          )
        }

        this.selectionOutlineGfx.stroke()
      }
    }

    // 逻辑：锚点由 AnchorOverlay (DOM) 渲染，支持交互式折叠按钮。
  }

  /** Sync overlay positions on viewport change (no snapshot change). */
  syncView(): void {
    // 选区框依赖世界坐标，视口变化时需要重绘
    this.sync()
  }

  destroy(): void {
    this.selectionBoxGfx.destroy()
    this.selectionOutlineGfx.destroy()
  }
}

/** Draw a dashed line segment from (x1,y1) to (x2,y2). */
function drawDashedLine(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash: number,
  gap: number,
): void {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return
  const ux = dx / dist
  const uy = dy / dist
  let drawn = 0
  let drawing = true
  while (drawn < dist) {
    const seg = drawing ? dash : gap
    const end = Math.min(drawn + seg, dist)
    if (drawing) {
      gfx.moveTo(x1 + ux * drawn, y1 + uy * drawn)
      gfx.lineTo(x1 + ux * end, y1 + uy * end)
    }
    drawn = end
    drawing = !drawing
  }
}

/** Draw a dashed rectangle (4 edges). */
function drawDashedRect(
  gfx: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  dash: number,
  gap: number,
): void {
  drawDashedLine(gfx, x, y, x + w, y, dash, gap) // top
  drawDashedLine(gfx, x + w, y, x + w, y + h, dash, gap) // right
  drawDashedLine(gfx, x + w, y + h, x, y + h, dash, gap) // bottom
  drawDashedLine(gfx, x, y + h, x, y, dash, gap) // left
}

/** Draw a dashed arc (quarter circle) approximated with small line segments. */
function drawDashedArc(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  dash: number,
  gap: number,
): void {
  const arcLen = Math.abs(endAngle - startAngle) * r
  if (arcLen === 0) return
  const steps = Math.max(16, Math.ceil(arcLen / 2))
  const angleStep = (endAngle - startAngle) / steps

  let drawn = 0
  let drawing = true
  let segRemain = dash

  for (let i = 0; i < steps; i++) {
    const a0 = startAngle + angleStep * i
    const a1 = startAngle + angleStep * (i + 1)
    const x0 = cx + Math.cos(a0) * r
    const y0 = cy + Math.sin(a0) * r
    const x1 = cx + Math.cos(a1) * r
    const y1 = cy + Math.sin(a1) * r
    const segLen = arcLen / steps

    if (drawing) {
      gfx.moveTo(x0, y0)
      gfx.lineTo(x1, y1)
    }

    drawn += segLen
    segRemain -= segLen
    if (segRemain <= 0) {
      drawing = !drawing
      segRemain = drawing ? dash : gap
    }
  }
}

/** Draw a dashed rounded rectangle. */
function drawDashedRoundRect(
  gfx: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  dash: number,
  gap: number,
  radius: number,
): void {
  const r = Math.min(radius, w / 2, h / 2)
  const PI = Math.PI

  // top edge
  drawDashedLine(gfx, x + r, y, x + w - r, y, dash, gap)
  // top-right corner
  drawDashedArc(gfx, x + w - r, y + r, r, -PI / 2, 0, dash, gap)
  // right edge
  drawDashedLine(gfx, x + w, y + r, x + w, y + h - r, dash, gap)
  // bottom-right corner
  drawDashedArc(gfx, x + w - r, y + h - r, r, 0, PI / 2, dash, gap)
  // bottom edge
  drawDashedLine(gfx, x + w - r, y + h, x + r, y + h, dash, gap)
  // bottom-left corner
  drawDashedArc(gfx, x + r, y + h - r, r, PI / 2, PI, dash, gap)
  // left edge
  drawDashedLine(gfx, x, y + h - r, x, y + r, dash, gap)
  // top-left corner
  drawDashedArc(gfx, x + r, y + r, r, PI, PI * 1.5, dash, gap)
}
