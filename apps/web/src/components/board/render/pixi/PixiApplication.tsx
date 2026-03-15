/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Application, Container } from 'pixi.js'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type { CanvasSnapshot } from '../../engine/types'
import { PixiViewportSync } from './PixiViewportSync'
import { PixiNodeManager } from './PixiNodeManager'
import { PixiConnectorLayer } from './PixiConnectorLayer'
import { PixiStrokeLayer } from './PixiStrokeLayer'
import { PixiOverlayLayer } from './PixiOverlayLayer'
import { PixiThemeResolver } from './PixiThemeResolver'
import { DomOverlayManager } from './DomOverlayManager'

export type PixiApplicationProps = {
  engine: CanvasEngine
  snapshot: CanvasSnapshot
}

/**
 * React component wrapping a PixiJS v8 Application.
 * This is the single entry point for the PixiJS canvas renderer.
 *
 * Scene graph:
 *   Stage
 *     +-- worldContainer (viewport transform: zoom + offset)
 *     |     +-- strokeLayer (pen/highlighter strokes via PixiStrokeLayer)
 *     |     +-- connectorLayer (connector paths)
 *     |     +-- nodeLayer (node sprites/containers)
 *     +-- overlayContainer (screen-space, no viewport transform)
 *           +-- selectionBoxGraphics
 *           +-- alignmentGuideGraphics
 *           +-- anchorGraphics
 */
export function PixiCanvas({ engine, snapshot }: PixiApplicationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const nodeManagerRef = useRef<PixiNodeManager | null>(null)

  const init = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    const app = new Application()
    await app.init({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgl',
    })

    // PixiJS canvas 需要 pointer-events: none，让事件穿透到 engine 绑定的容器
    const canvasEl = app.canvas as HTMLCanvasElement
    canvasEl.style.pointerEvents = 'none'
    container.appendChild(canvasEl)
    appRef.current = app

    // 场景图层结构
    const worldContainer = new Container()
    worldContainer.label = 'worldContainer'
    app.stage.addChild(worldContainer)

    const strokeLayerContainer = new Container()
    strokeLayerContainer.label = 'strokeLayer'
    strokeLayerContainer.sortableChildren = true
    worldContainer.addChild(strokeLayerContainer)

    const connectorLayerContainer = new Container()
    connectorLayerContainer.label = 'connectorLayer'
    worldContainer.addChild(connectorLayerContainer)

    const nodeLayerContainer = new Container()
    nodeLayerContainer.label = 'nodeLayer'
    nodeLayerContainer.sortableChildren = true
    worldContainer.addChild(nodeLayerContainer)

    const overlayContainer = new Container()
    overlayContainer.label = 'overlayContainer'
    app.stage.addChild(overlayContainer)

    // 主题解析器
    const themeResolver = new PixiThemeResolver(container)

    // 视口同步：engine viewport → worldContainer transform
    const viewportSync = new PixiViewportSync(engine, worldContainer)

    // 节点管理器：engine snapshot → PixiJS 节点
    const nodeManager = new PixiNodeManager(
      engine,
      nodeLayerContainer,
      themeResolver,
    )
    nodeManagerRef.current = nodeManager

    // 笔画渲染器
    const strokeLayerRenderer = new PixiStrokeLayer(
      engine,
      strokeLayerContainer,
      themeResolver,
    )

    // 连线渲染器
    const connectorLayerRenderer = new PixiConnectorLayer(
      engine,
      connectorLayerContainer,
      themeResolver,
    )

    // 叠层渲染器（选区框、对齐线、锚点）
    const overlayLayerRenderer = new PixiOverlayLayer(
      engine,
      overlayContainer,
      worldContainer,
      themeResolver,
    )

    // 启动渲染循环
    const unsubSnapshot = engine.subscribe(() => {
      nodeManager.sync()
      strokeLayerRenderer.sync()
      connectorLayerRenderer.sync()
      overlayLayerRenderer.sync()
    })

    const unsubView = engine.subscribeView(() => {
      viewportSync.sync()
      overlayLayerRenderer.syncView()
    })

    // 初始同步
    viewportSync.sync()
    nodeManager.sync()
    strokeLayerRenderer.sync()
    connectorLayerRenderer.sync()

    cleanupRef.current = () => {
      unsubSnapshot()
      unsubView()
      viewportSync.destroy()
      nodeManager.destroy()
      strokeLayerRenderer.destroy()
      connectorLayerRenderer.destroy()
      overlayLayerRenderer.destroy()
      themeResolver.destroy()
      app.destroy(true, { children: true })
      appRef.current = null
      nodeManagerRef.current = null
    }
  }, [engine])

  useEffect(() => {
    void init()
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [init])

  // 编辑模式下控制 PixiJS 节点可见性的回调
  const handlePixiNodeVisibility = useCallback(
    (nodeId: string, visible: boolean) => {
      nodeManagerRef.current?.setNodeVisible(nodeId, visible)
    },
    [],
  )

  return (
    <>
      <div
        ref={containerRef}
        className="pointer-events-none absolute inset-0"
        style={{ touchAction: 'none' }}
      />
      <DomOverlayManager
        engine={engine}
        snapshot={snapshot}
        onPixiNodeVisibility={handlePixiNodeVisibility}
      />
    </>
  )
}
