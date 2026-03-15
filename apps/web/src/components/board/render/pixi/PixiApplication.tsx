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

/** 创建并初始化一个 PixiJS Application */
async function createPixiApp(container: HTMLDivElement) {
  const app = new Application()
  await app.init({
    resizeTo: container,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  })
  const canvasEl = app.canvas as HTMLCanvasElement
  canvasEl.style.pointerEvents = 'none'
  container.appendChild(canvasEl)
  return app
}

export type PixiApplicationProps = {
  engine: CanvasEngine
  snapshot: CanvasSnapshot
}

/**
 * PixiJS 双层画布 + DOM 节点层。
 *
 * 渲染层叠顺序（从底到顶）：
 *   1. 底层 PixiJS canvas — 连线
 *   2. DOM 节点层 — 所有节点（React 组件，完整交互）
 *   3. 上层 PixiJS canvas — 笔画/荧光笔 + 选区框 + 对齐线
 *
 * 这样画笔/荧光笔始终覆盖在节点上方，连线始终在节点下方。
 */
export function PixiCanvas({ engine, snapshot }: PixiApplicationProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  // 逻辑：防止异步 init 在组件卸载后继续执行，避免访问已销毁的 PixiJS 对象。
  const disposedRef = useRef(false)

  const init = useCallback(async () => {
    const bottomContainer = bottomRef.current
    const topContainer = topRef.current
    if (!bottomContainer || !topContainer) return

    // 底层 PixiJS：连线
    const bottomApp = await createPixiApp(bottomContainer)
    if (disposedRef.current) {
      bottomApp.destroy(true, { children: true })
      return
    }

    const bottomWorld = new Container()
    bottomWorld.label = 'bottomWorld'
    bottomApp.stage.addChild(bottomWorld)

    const connectorLayer = new Container()
    connectorLayer.label = 'connectorLayer'
    bottomWorld.addChild(connectorLayer)

    // 上层 PixiJS：笔画 + 叠层
    const topApp = await createPixiApp(topContainer)
    if (disposedRef.current) {
      bottomApp.destroy(true, { children: true })
      topApp.destroy(true, { children: true })
      return
    }

    const topWorld = new Container()
    topWorld.label = 'topWorld'
    topApp.stage.addChild(topWorld)

    const strokeLayer = new Container()
    strokeLayer.label = 'strokeLayer'
    strokeLayer.sortableChildren = true
    topWorld.addChild(strokeLayer)

    const overlayContainer = new Container()
    overlayContainer.label = 'overlayContainer'
    topApp.stage.addChild(overlayContainer)

    // 主题解析器
    const themeResolver = new PixiThemeResolver(bottomContainer)

    // 视口同步：两个 worldContainer 都要同步
    const bottomViewportSync = new PixiViewportSync(engine, bottomWorld)
    const topViewportSync = new PixiViewportSync(engine, topWorld)

    // 渲染器
    const connectorRenderer = new PixiConnectorLayer(engine, connectorLayer, themeResolver)
    const strokeRenderer = new PixiStrokeLayer(engine, strokeLayer, themeResolver)
    const overlayRenderer = new PixiOverlayLayer(engine, overlayContainer, topWorld, themeResolver)

    const unsubSnapshot = engine.subscribe(() => {
      connectorRenderer.sync()
      strokeRenderer.sync()
      overlayRenderer.sync()
    })

    const unsubView = engine.subscribeView(() => {
      bottomViewportSync.sync()
      topViewportSync.sync()
      overlayRenderer.syncView()
    })

    // 初始同步
    bottomViewportSync.sync()
    topViewportSync.sync()
    connectorRenderer.sync()
    strokeRenderer.sync()

    cleanupRef.current = () => {
      unsubSnapshot()
      unsubView()
      bottomViewportSync.destroy()
      topViewportSync.destroy()
      connectorRenderer.destroy()
      strokeRenderer.destroy()
      overlayRenderer.destroy()
      themeResolver.destroy()
      bottomApp.destroy(true, { children: true })
      topApp.destroy(true, { children: true })
    }
  }, [engine])

  useEffect(() => {
    disposedRef.current = false
    void init()
    return () => {
      disposedRef.current = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [init])

  return (
    <>
      {/* 1. 底层 PixiJS：连线（在节点下方） */}
      <div
        ref={bottomRef}
        className="pointer-events-none absolute inset-0"
        style={{ touchAction: 'none' }}
      />
      {/* 2. DOM 节点层：所有节点（React 组件，完整交互） */}
      <DomNodeLayer engine={engine} snapshot={snapshot} />
      {/* 3. 上层 PixiJS：笔画 + 选区框 + 对齐线（在节点上方） */}
      <div
        ref={topRef}
        className="pointer-events-none absolute inset-0"
        style={{ touchAction: 'none' }}
      />
    </>
  )
}
