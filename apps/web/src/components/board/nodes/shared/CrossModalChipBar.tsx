/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * CrossModalChipBar — hover-triggered cross-modal derive shortcuts.
 *
 * Shows small pill-shaped chips below an unselected node, one per target
 * modality that can consume this node's media type. Clicking a chip spawns
 * a new downstream node pre-locked to the corresponding feature/variant and
 * auto-connects it to the source node, letting the user jump straight into
 * generating (e.g. image → video).
 *
 * Rendering: chips render through the shared `panelOverlay` portal (same
 * layer used by InlinePanelPortal) so they're not clipped by the node's
 * `overflow-hidden` content wrapper. Position is computed from the node's
 * xywh in canvas coordinates and scaled by 1/zoom to stay a constant screen
 * size regardless of canvas zoom.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@udecode/cn'
import { useTranslation } from 'react-i18next'
import { FileText, Image as ImageIcon, Music, Video } from 'lucide-react'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import { deriveNode, type DeriveTargetType } from '../../utils/derive-node'
import {
  useCrossModalTargets,
  type CrossModalTarget,
} from '../../panels/hooks/useCrossModalTargets'
import type { MediaType } from '../../panels/variants/slot-types'
import { usePanelOverlay } from '../../render/pixi/PixiApplication'

const ENTER_DELAY_MS = 200
const LEAVE_DELAY_MS = 300
/** Screen-space gap (px) between node bottom and chip row. */
const CHIP_GAP_PX = 10

function renderIcon(type: DeriveTargetType) {
  const size = 13
  switch (type) {
    case 'video':
      return <Video size={size} strokeWidth={1.75} />
    case 'text':
      return <FileText size={size} strokeWidth={1.75} />
    case 'audio':
      return <Music size={size} strokeWidth={1.75} />
    case 'image':
      return <ImageIcon size={size} strokeWidth={1.75} />
  }
}

export interface CrossModalChipBarProps {
  /** Host element to watch for hover (typically the NodeFrame root). */
  hostRef: React.RefObject<HTMLElement | null>
  /** Canvas engine for deriveNode. */
  engine: CanvasEngine
  /** Source node id. */
  sourceNodeId: string
  /** Source node's primary media type. */
  sourceType: MediaType
  /** Source node xywh in canvas coordinates, for positioning the portal. */
  xywh: [number, number, number, number]
  /** Whether the node is selected / its AI panel is open. */
  active: boolean
}

export function CrossModalChipBar({
  hostRef,
  engine,
  sourceNodeId,
  sourceType,
  xywh,
  active,
}: CrossModalChipBarProps) {
  const { i18n } = useTranslation()
  const lang = (i18n.language.startsWith('zh') ? 'zh' : 'en') as 'zh' | 'en'
  const targets = useCrossModalTargets({ sourceType, lang })
  const panelOverlay = usePanelOverlay()

  const [visible, setVisible] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Wire hover listeners on the host element (the node DOM). The chip bar
  // lives in a separate portal layer but shares the hover state so moving
  // the pointer from node → chip doesn't immediately dismiss.
  useEffect(() => {
    if (active) {
      setVisible(false)
      return
    }
    const host = hostRef.current
    if (!host) return

    const clearTimers = () => {
      if (enterTimerRef.current) {
        clearTimeout(enterTimerRef.current)
        enterTimerRef.current = null
      }
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
    }

    const handleEnter = () => {
      clearTimers()
      enterTimerRef.current = setTimeout(() => setVisible(true), ENTER_DELAY_MS)
    }
    const handleLeave = (event: PointerEvent) => {
      const related = event.relatedTarget as Node | null
      if (related && barRef.current?.contains(related)) return
      clearTimers()
      leaveTimerRef.current = setTimeout(() => setVisible(false), LEAVE_DELAY_MS)
    }

    host.addEventListener('pointerenter', handleEnter)
    host.addEventListener('pointerleave', handleLeave as EventListener)

    return () => {
      host.removeEventListener('pointerenter', handleEnter)
      host.removeEventListener('pointerleave', handleLeave as EventListener)
      clearTimers()
    }
  }, [hostRef, active])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [])

  const handleBarEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }

  const handleBarLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null
    if (related && hostRef.current?.contains(related)) return
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = setTimeout(() => setVisible(false), LEAVE_DELAY_MS)
  }

  const handleChipClick = (target: CrossModalTarget) => {
    setVisible(false)
    deriveNode({
      engine,
      sourceNodeId,
      targetType: target.targetType,
      initialAiConfig: { feature: target.feature.id, variant: target.variant.id },
    })
  }

  const shouldRender = useMemo(
    () => visible && !active && targets.length > 0 && Boolean(panelOverlay),
    [visible, active, targets.length, panelOverlay],
  )

  // 订阅视口变化，通过直接 DOM 操作同步 chip bar 的 scale/top，
  // 让它在画布缩放时保持恒定屏幕尺寸（对应 useInlinePanelSync 的做法）。
  const xywhRef = useRef(xywh)
  xywhRef.current = xywh
  useEffect(() => {
    if (!shouldRender) return
    const sync = () => {
      const el = barRef.current
      if (!el) return
      const zoom = engine.viewport.getState().zoom
      const [x, y, w, h] = xywhRef.current
      el.style.left = `${x + w / 2}px`
      el.style.top = `${y + h + CHIP_GAP_PX / zoom}px`
      el.style.transform = `translateX(-50%) scale(${1 / zoom})`
    }
    sync()
    const unsub = engine.subscribeView(sync)
    return unsub
  }, [engine, shouldRender])

  if (!shouldRender || !panelOverlay) return null

  // 初值由 useEffect 同步后覆盖。这里给出首次渲染的近似值避免闪烁。
  const initialZoom = engine.viewport.getState().zoom

  return createPortal(
    <div
      ref={barRef}
      className={cn(
        'pointer-events-auto absolute flex h-8 items-stretch whitespace-nowrap rounded-full',
        'ol-glass-toolbar text-foreground',
        'animate-in fade-in zoom-in-95 duration-150',
      )}
      data-board-editor
      style={{
        left: xywh[0] + xywh[2] / 2,
        top: xywh[1] + xywh[3] + CHIP_GAP_PX / initialZoom,
        transform: `translateX(-50%) scale(${1 / initialZoom})`,
        transformOrigin: 'top center',
      }}
      onPointerEnter={handleBarEnter}
      onPointerLeave={handleBarLeave}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {targets.map((target, idx) => (
        <div key={`${target.targetCategory}:${target.feature.id}`} className="flex items-stretch">
          {idx > 0 ? (
            <span
              aria-hidden
              className="my-1.5 w-px self-stretch bg-ol-divider/60"
            />
          ) : null}
          <button
            type="button"
            title={target.label}
            onClick={(e) => {
              e.stopPropagation()
              handleChipClick(target)
            }}
            className={cn(
              'group/chip flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3',
              'text-[11px] font-medium leading-none tracking-wide text-ol-text-secondary',
              'transition-colors duration-150',
              'hover:text-foreground',
              // 第一个/最后一个按钮吃满圆角。
              idx === 0 ? 'rounded-l-full' : '',
              idx === targets.length - 1 ? 'rounded-r-full' : '',
              'hover:bg-foreground/5 dark:hover:bg-foreground/8',
            )}
          >
            <span className="opacity-70 transition-opacity group-hover/chip:opacity-100">
              {renderIcon(target.targetType)}
            </span>
            <span>{target.label}</span>
          </button>
        </div>
      ))}
    </div>,
    panelOverlay,
  )
}
