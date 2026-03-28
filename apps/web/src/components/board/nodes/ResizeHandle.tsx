/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use no memo'

import { useRef } from 'react'
import type { CanvasEngine } from '../engine/CanvasEngine'
import type { CanvasNodeElement } from '../engine/types'

type ResizeHandleProps = {
  engine: CanvasEngine
  element: CanvasNodeElement
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
}

type DragState = {
  startX: number
  startY: number
  startW: number
  startH: number
  zoom: number
}

/**
 * Right-bottom resize handle rendered inside a board node.
 *
 * Placed inside `DomNodeItem` so it follows the CSS transform layer
 * and stays perfectly synchronised with the node DOM (no frame lag).
 *
 * During drag the handle directly mutates the parent node's DOM style
 * for zero-latency visual feedback, then commits the final size to
 * `engine.doc` + history on pointer-up.
 */
export function ResizeHandle({
  engine,
  element,
  minW,
  maxW,
  minH,
  maxH,
}: ResizeHandleProps) {
  const dragRef = useRef<DragState | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)

    const [, , w, h] = element.xywh
    const zoom = engine.viewport.getState().zoom

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: w,
      startH: h,
      zoom,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return

    const dx = (e.clientX - drag.startX) / drag.zoom
    const dy = (e.clientY - drag.startY) / drag.zoom

    let nextW = drag.startW + dx
    let nextH = drag.startH + dy

    if (minW != null) nextW = Math.max(nextW, minW)
    if (maxW != null) nextW = Math.min(nextW, maxW)
    if (minH != null) nextH = Math.max(nextH, minH)
    if (maxH != null) nextH = Math.min(nextH, maxH)

    // Direct DOM mutation for zero-latency feedback
    const node = e.currentTarget.closest<HTMLElement>('[data-board-node]')
    if (node) {
      node.style.width = `${nextW}px`
      node.style.height = `${nextH}px`
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null

    const dx = (e.clientX - drag.startX) / drag.zoom
    const dy = (e.clientY - drag.startY) / drag.zoom

    let nextW = drag.startW + dx
    let nextH = drag.startH + dy

    if (minW != null) nextW = Math.max(nextW, minW)
    if (maxW != null) nextW = Math.min(nextW, maxW)
    if (minH != null) nextH = Math.max(nextH, minH)
    if (maxH != null) nextH = Math.min(nextH, maxH)

    const [x, y] = element.xywh
    engine.doc.updateElement(element.id, {
      xywh: [x, y, Math.round(nextW), Math.round(nextH)],
    })
    engine.commitHistory()
  }

  return (
    <div
      data-resize-handle
      className="pointer-events-auto absolute bottom-0 right-0 z-10 flex cursor-nwse-resize items-center justify-center opacity-0 transition-opacity duration-150 group-data-[selected]/node:opacity-100"
      style={{ width: 16, height: 16 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
        className="text-muted-foreground"
      >
        {/* Three diagonal lines */}
        <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1" />
        <line x1="7" y1="3.5" x2="3.5" y2="7" stroke="currentColor" strokeWidth="1" />
        <line x1="7" y1="6" x2="6" y2="7" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  )
}
