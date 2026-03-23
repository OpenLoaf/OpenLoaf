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

import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { PANEL_GAP_PX } from './useInlinePanelSync'
import type { CanvasEngine } from '../../engine/CanvasEngine'

export type InlinePanelPortalProps = {
  /** Whether the panel should be rendered. */
  expanded: boolean | undefined
  /** The portal target DOM element (panelOverlay layer). */
  panelOverlay: Element | null | undefined
  /** Ref attached to the panel container div for sync / position reads. */
  panelRef: RefObject<HTMLDivElement | null>
  /** Node position and size as [x, y, w, h] in canvas coordinates. */
  xywh: [number, number, number, number]
  /** Canvas engine instance, used to read the current viewport zoom. */
  engine: CanvasEngine
  /** Panel content to render inside the portal. */
  children: React.ReactNode
}

/**
 * Shared portal wrapper for inline AI panels on media nodes (image, video, audio).
 *
 * Renders children into the panelOverlay layer only when the node is expanded
 * and a valid overlay target exists. The panel is:
 * - Absolutely positioned below the node in canvas coordinates
 * - Scaled by 1/zoom so it stays a fixed screen size at all zoom levels
 * - Isolated from canvas pointer events (pointer-events-auto on the wrapper)
 * - Protected from canvas context-menu / drag takeover via stopPropagation
 */
export function InlinePanelPortal({
  expanded,
  panelOverlay,
  panelRef,
  xywh,
  engine,
  children,
}: InlinePanelPortalProps) {
  if (!expanded || !panelOverlay) return null

  return createPortal(
    <div
      ref={panelRef}
      className="pointer-events-auto absolute"
      data-board-editor
      style={{
        // 逻辑：面板在 panelOverlay 层（与 DomNodeLayer 同坐标系），
        // 用节点 xywh 定位在节点正下方居中。
        // top 由 syncPanelScale 实时更新（间距 = PANEL_GAP_PX / zoom，屏幕恒定像素）。
        // 初始值也需包含间距，避免 useEffect 执行前出现 0 间距闪烁。
        left: xywh[0] + xywh[2] / 2,
        top: xywh[1] + xywh[3] + PANEL_GAP_PX / engine.viewport.getState().zoom,
        transform: `translateX(-50%) scale(${1 / engine.viewport.getState().zoom})`,
        transformOrigin: 'top center',
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
      }}
      onContextMenu={(event) => {
        event.stopPropagation()
      }}
    >
      {children}
    </div>,
    panelOverlay,
  )
}
