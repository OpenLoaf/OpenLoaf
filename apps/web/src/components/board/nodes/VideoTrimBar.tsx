/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useRef, useState } from "react"

/** Format seconds into mm:ss. */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export type VideoTrimBarProps = {
  duration: number
  clipStart: number
  clipEnd: number
  onChange: (start: number, end: number) => void
}

/**
 * Dual-handle range slider for setting clip start/end times.
 * Uses document-level pointer events for reliable drag tracking.
 */
export function VideoTrimBar({
  duration,
  clipStart,
  clipEnd,
  onChange,
}: VideoTrimBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)
  const [, setDragTick] = useState(0)

  // Use refs for latest values so document listeners always see current state
  const clipStartRef = useRef(clipStart)
  clipStartRef.current = clipStart
  const clipEndRef = useRef(clipEnd)
  clipEndRef.current = clipEnd
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const pctOf = (v: number) => (duration > 0 ? (v / duration) * 100 : 0)

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || duration <= 0) return 0
      const rect = track.getBoundingClientRect()
      const pct = (clientX - rect.left) / rect.width
      return clamp(Math.round(pct * duration * 10) / 10, 0, duration)
    },
    [duration],
  )

  // Document-level move/up handlers for reliable drag
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const handle = draggingRef.current
      if (!handle) return
      e.preventDefault()
      const v = valueFromClientX(e.clientX)
      if (handle === 'start') {
        onChangeRef.current(Math.min(v, clipEndRef.current - 0.1), clipEndRef.current)
      } else {
        onChangeRef.current(clipStartRef.current, Math.max(v, clipStartRef.current + 0.1))
      }
    }
    const handleUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null
        setDragTick((c) => c + 1)
      }
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
  }, [valueFromClientX])

  const onHandleDown = useCallback(
    (handle: 'start' | 'end') => (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = handle
      setDragTick((c) => c + 1)
    },
    [],
  )

  const startPct = pctOf(clipStart)
  const endPct = pctOf(clipEnd)

  return (
    <div className="flex flex-col gap-1.5 select-none">
      <div className="flex items-center justify-between text-[10px] text-ol-text-auxiliary tabular-nums">
        <span>{formatTime(clipStart)}</span>
        <span>{formatTime(clipEnd)}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Track background */}
        <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-ol-surface-muted" />
        {/* Active range */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ol-blue"
          style={{
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
          }}
        />
        {/* Start handle */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-ol-blue bg-background shadow-sm active:cursor-grabbing"
          style={{ left: `${startPct}%` }}
          onPointerDown={onHandleDown('start')}
        />
        {/* End handle */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-ol-blue bg-background shadow-sm active:cursor-grabbing"
          style={{ left: `${endPct}%` }}
          onPointerDown={onHandleDown('end')}
        />
      </div>
      <div className="text-center text-[10px] text-ol-text-auxiliary">
        {formatTime(clipEnd - clipStart)} / {formatTime(duration)}
      </div>
    </div>
  )
}
