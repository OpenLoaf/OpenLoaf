/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Container, Graphics } from "pixi.js"
import type { CanvasEngine } from "../../engine/CanvasEngine"
import type {
  CanvasConnectorElement,
  CanvasConnectorEnd,
  CanvasAnchorMap,
  CanvasPoint,
} from "../../engine/types"
import type { PixiThemeResolver } from "./PixiThemeResolver"

/** Resolve an endpoint to a world point. */
function resolveEndpoint(
  end: CanvasConnectorEnd,
  anchors: CanvasAnchorMap,
  engine: CanvasEngine,
): CanvasPoint | null {
  if ("point" in end) return end.point

  const element = engine.doc.getElementById(end.elementId)
  if (!element || element.kind !== "node") return null

  const [x, y, w, h] = element.xywh
  const elementAnchors = anchors[end.elementId]

  if (end.anchorId && elementAnchors) {
    const anchor = elementAnchors.find((a) => a.id === end.anchorId)
    if (anchor) return anchor.point
  }

  // 默认使用节点中心
  return [x + w / 2, y + h / 2]
}

/** Draw an arrow head at the target point. */
function drawArrowHead(
  g: Graphics,
  from: CanvasPoint,
  to: CanvasPoint,
  size: number,
): void {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
  const a1 = angle + Math.PI * 0.85
  const a2 = angle - Math.PI * 0.85
  g.moveTo(to[0] + Math.cos(a1) * size, to[1] + Math.sin(a1) * size)
  g.lineTo(to[0], to[1])
  g.lineTo(to[0] + Math.cos(a2) * size, to[1] + Math.sin(a2) * size)
  g.stroke()
}

/**
 * Renders connector elements as PixiJS Graphics paths.
 * Replaces SvgConnectorLayer — all connectors rendered on GPU.
 */
export class PixiConnectorLayer {
  private engine: CanvasEngine
  private container: Container
  private theme: PixiThemeResolver
  private graphics = new Graphics()
  private lastRevision = -1

  constructor(
    engine: CanvasEngine,
    container: Container,
    theme: PixiThemeResolver,
  ) {
    this.engine = engine
    this.container = container
    this.theme = theme
    this.container.addChild(this.graphics)
  }

  /** Re-render all connectors from the current snapshot. */
  sync(): void {
    const snapshot = this.engine.getSnapshot()
    if (snapshot.docRevision === this.lastRevision) return
    this.lastRevision = snapshot.docRevision

    const palette = this.theme.getPalette()
    const g = this.graphics
    g.clear()

    const connectors = snapshot.elements.filter(
      (el): el is CanvasConnectorElement => el.kind === "connector",
    )
    const anchors = snapshot.anchors

    for (const connector of connectors) {
      const source = resolveEndpoint(connector.source, anchors, this.engine)
      const target = resolveEndpoint(connector.target, anchors, this.engine)
      if (!source || !target) continue

      const color = connector.color
        ? this.parseCssColor(connector.color) ?? palette.connector
        : palette.connector
      const isHovered = connector.id === snapshot.connectorHoverId
      const alpha = isHovered ? 1 : 0.7
      const width = isHovered ? 2.5 : 1.5

      const dashArray = connector.dashed ? [6, 4] : undefined

      g.setStrokeStyle({
        width,
        color,
        alpha,
        cap: "round",
        join: "round",
        ...(dashArray ? { dash: dashArray } : {}),
      })

      const style = connector.style || "curve"

      if (style === "straight") {
        g.moveTo(source[0], source[1])
        g.lineTo(target[0], target[1])
      } else if (style === "curve") {
        const dx = target[0] - source[0]
        const cpOffset = Math.min(Math.abs(dx) * 0.5, 150)
        g.moveTo(source[0], source[1])
        g.bezierCurveTo(
          source[0] + cpOffset,
          source[1],
          target[0] - cpOffset,
          target[1],
          target[0],
          target[1],
        )
      } else if (style === "elbow") {
        const midX = (source[0] + target[0]) / 2
        g.moveTo(source[0], source[1])
        g.lineTo(midX, source[1])
        g.lineTo(midX, target[1])
        g.lineTo(target[0], target[1])
      } else {
        // hand, fly — 简化为曲线
        const dx = target[0] - source[0]
        const cpOffset = Math.min(Math.abs(dx) * 0.5, 150)
        g.moveTo(source[0], source[1])
        g.bezierCurveTo(
          source[0] + cpOffset,
          source[1],
          target[0] - cpOffset,
          target[1],
          target[0],
          target[1],
        )
      }
      g.stroke()

      // 箭头
      const secondLast: CanvasPoint =
        style === "elbow"
          ? [(source[0] + target[0]) / 2, target[1]]
          : [
              target[0] -
                (target[0] - source[0]) * 0.1,
              target[1] -
                (target[1] - source[1]) * 0.1,
            ]
      drawArrowHead(g, secondLast, target, 8)
    }

    // 绘制 draft connector
    const draft = snapshot.connectorDraft
    if (draft) {
      const draftSource = resolveEndpoint(draft.source, anchors, this.engine)
      const draftTarget = resolveEndpoint(draft.target, anchors, this.engine)
      if (draftSource && draftTarget) {
        g.setStrokeStyle({
          width: 1.5,
          color: palette.connector,
          alpha: 0.5,
          dash: [4, 3],
        })
        const dx = draftTarget[0] - draftSource[0]
        const cpOffset = Math.min(Math.abs(dx) * 0.5, 150)
        g.moveTo(draftSource[0], draftSource[1])
        g.bezierCurveTo(
          draftSource[0] + cpOffset,
          draftSource[1],
          draftTarget[0] - cpOffset,
          draftTarget[1],
          draftTarget[0],
          draftTarget[1],
        )
        g.stroke()
      }
    }
  }

  /** Parse CSS color string to PixiJS hex number. */
  private parseCssColor(color: string): number | null {
    if (color.startsWith("#")) {
      let hex = color.slice(1)
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
      }
      return Number.parseInt(hex.slice(0, 6), 16)
    }
    return null
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
