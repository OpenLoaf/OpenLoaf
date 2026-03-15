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
import { PixiConnectorLayer } from './PixiConnectorLayer'
import { PixiStrokeLayer } from './PixiStrokeLayer'
import { PixiOverlayLayer } from './PixiOverlayLayer'
import { PixiThemeResolver } from './PixiThemeResolver'
import { DomNodeLayer } from './DomNodeLayer'

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
 *     +-- overlayContainer (screen-space, no viewport transform)
 *           +-- selectionBoxGraphics
 *           +-- alignmentGuideGraphics
 *           +-- anchorGraphics
 */
export function PixiCanvas({ engine, snapshot }: PixiApplicationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

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
    // 逻辑：暴露 renderer 全局引用，供 PixiStrokeLayer 的 RenderTexture 使用。
    ;(globalThis as Record<string, unknown>).__pixiRenderer = app.renderer

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

    const overlayContainer = new Container()
    overlayContainer.label = 'overlayContainer'
    app.stage.addChild(overlayContainer)

    // 主题解析器
    const themeResolver = new PixiThemeResolver(container)

    // 视口同步：engine viewport → worldContainer transform
    const viewportSync = new PixiViewportSync(engine, worldContainer)

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
    // 逻辑：节点由 DomNodeLayer 渲染，PixiJS 只渲染连线/笔画/叠层。
    const unsubSnapshot = engine.subscribe(() => {
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
    strokeLayerRenderer.sync()
    connectorLayerRenderer.sync()

    cleanupRef.current = () => {
      unsubSnapshot()
      unsubView()
      viewportSync.destroy()
      strokeLayerRenderer.destroy()
      connectorLayerRenderer.destroy()
      overlayLayerRenderer.destroy()
      themeResolver.destroy()
      app.destroy(true, { children: true })
      appRef.current = null
      delete (globalThis as Record<string, unknown>).__pixiRenderer
    }
  }, [engine])

  useEffect(() => {
    void init()
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [init])

  return (
    <>
      {/* PixiJS WebGL 层：连线 + 笔画 + 选区叠层 */}
      <div
        ref={containerRef}
        className="pointer-events-none absolute inset-0"
        style={{ touchAction: 'none' }}
      />
      {/* DOM 节点层：所有节点始终用 React 组件渲染，保证完整交互 */}
      <DomNodeLayer engine={engine} snapshot={snapshot} />
    </>
  )
}
