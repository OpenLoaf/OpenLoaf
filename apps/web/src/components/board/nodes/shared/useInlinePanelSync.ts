/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useRef } from 'react'
import type { CanvasEngine } from '../../engine/CanvasEngine'

/** Inline panel gap from node bottom edge in screen pixels (zoom-independent). */
export const PANEL_GAP_PX = 8

export type UseInlinePanelSyncOptions = {
  /** The canvas engine instance. */
  engine: CanvasEngine
  /** Current node position and size as [x, y, w, h]. */
  xywh: [number, number, number, number]
  /** Whether the inline panel is currently expanded/open. */
  expanded: boolean | undefined
}

export type UseInlinePanelSyncReturn = {
  /** Ref to attach to the inline panel DOM element. */
  panelRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Shared hook that keeps an inline AI panel positioned and scaled correctly
 * relative to its parent node during viewport zoom/pan.
 *
 * Responsibilities:
 * 1. Provides a `panelRef` to attach to the panel container `<div>`.
 * 2. Subscribes to `engine.subscribeView` to directly manipulate the panel DOM
 *    (avoiding React re-render latency on every viewport change).
 * 3. Applies `scale(1/zoom)` so the panel stays a fixed screen size.
 * 4. Positions the panel `PANEL_GAP_PX` below the node bottom edge (zoom-corrected).
 *
 * Only activates when `expanded` is true.
 */
export function useInlinePanelSync({
  engine,
  xywh,
  expanded,
}: UseInlinePanelSyncOptions): UseInlinePanelSyncReturn {
  const panelRef = useRef<HTMLDivElement>(null)

  // 逻辑：通过 subscribeView 直接操作 DOM 同步面板缩放，避免 React 渲染延迟。
  // 面板通过 Portal 渲染到 panelOverlay 层（笔画上方），用 scale(1/zoom) 保持固定屏幕大小。
  // 间距用 PANEL_GAP_PX / zoom 保证屏幕上恒定像素间距。
  const xywhRef = useRef(xywh)
  xywhRef.current = xywh

  useEffect(() => {
    if (!expanded) return
    const syncPanelScale = () => {
      const panel = panelRef.current
      if (!panel) return
      const zoom = engine.viewport.getState().zoom
      const [, ny, , nh] = xywhRef.current
      panel.style.transform = `translateX(-50%) scale(${1 / zoom})`
      panel.style.top = `${ny + nh + PANEL_GAP_PX / zoom}px`
    }
    syncPanelScale()
    const unsub = engine.subscribeView(syncPanelScale)
    return unsub
  }, [engine, expanded])

  return { panelRef }
}
