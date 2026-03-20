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

import { createContext, useContext, useEffect, useRef, useCallback } from 'react'
import { Application, Container } from 'pixi.js'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type { CanvasSnapshot } from '../../engine/types'
import { PixiViewportSync } from './PixiViewportSync'
import { PixiConnectorLayer } from './PixiConnectorLayer'
import { PixiStrokeLayer } from './PixiStrokeLayer'
import { PixiOverlayLayer } from './PixiOverlayLayer'
import { PixiThemeResolver } from './PixiThemeResolver'
import { DomNodeLayer } from './DomNodeLayer'
import { patchPixiBindGroupCascade } from './patchPixiBindGroup'

// 修复 PixiJS v8 的 BindGroup 级联销毁 bug：
// 当 TextureGC 回收了 _globalFilterBindGroup 引用的 texture 时，
// 原生 onResourceChange 会销毁整个共享 BindGroup，导致后续所有 filter 渲染崩溃。
patchPixiBindGroupCascade()

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

/** Stop a PixiJS application ticker before releasing render resources. */
function stopPixiApp(app: Application): void {
  app.stop?.()
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

/**
 * Panel overlay layer — follows the same viewport transform as DomNodeLayer,
 * but renders above the Pixi stroke layer so expanded panels aren't occluded.
 */
function PanelOverlayLayer({ engine, panelOverlayRef, snapshot }: {
  engine: CanvasEngine
  panelOverlayRef: React.RefObject<HTMLDivElement | null>
  snapshot: CanvasSnapshot
}) {
  useEffect(() => {
    const sync = () => {
      const layer = panelOverlayRef.current
      if (!layer) return
      const { zoom, offset } = engine.viewport.getState()
      layer.style.transform = `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`
    }
    sync()
    const unsub = engine.subscribeView(sync)
    return unsub
  }, [engine, panelOverlayRef])

  const { zoom, offset } = engine.viewport.getState()
  const isDragging = !!snapshot.draggingId

  return (
    <div
      ref={panelOverlayRef}
      className="pointer-events-none absolute inset-0 z-[15] origin-top-left"
      data-panel-overlay
      data-dragging={isDragging || undefined}
      style={{
        transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`,
        opacity: isDragging ? 0 : 1,
        transition: isDragging ? 'none' : 'opacity 150ms ease',
      }}
    />
  )
}

/** Context for the panel overlay portal target (rendered above stroke layer). */
const PanelOverlayContext = createContext<React.RefObject<HTMLDivElement | null>>({ current: null })

/** Access the panel overlay portal target. Returns null if not inside PixiCanvas. */
export function usePanelOverlay(): HTMLDivElement | null {
  return useContext(PanelOverlayContext).current
}

export function PixiCanvas({ engine, snapshot }: PixiApplicationProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const panelOverlayRef = useRef<HTMLDivElement>(null)
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
      stopPixiApp(bottomApp)
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
      stopPixiApp(bottomApp)
      stopPixiApp(topApp)
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
      // 逻辑：先停 ticker，再清理图层资源，避免渲染还在进行时底层 texture/filter 已被销毁。
      stopPixiApp(bottomApp)
      stopPixiApp(topApp)
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
    <PanelOverlayContext.Provider value={panelOverlayRef}>
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
      {/* 4. 面板覆盖层：展开的 AI 参数面板通过 Portal 渲染到此层，在笔画上方 */}
      <PanelOverlayLayer engine={engine} panelOverlayRef={panelOverlayRef} snapshot={snapshot} />
    </PanelOverlayContext.Provider>
  )
}
