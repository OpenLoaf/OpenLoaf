/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// VTT thumbnail filmstrip
// ---------------------------------------------------------------------------

type ThumbnailEntry = { url: string }

function parseVttThumbnails(vttText: string, baseUrl: string): ThumbnailEntry[] {
  const entries: ThumbnailEntry[] = []
  const lines = vttText.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!.trim()
    if (line.match(/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}$/)) {
      const urlLine = lines[i + 1]?.trim()
      if (urlLine && !urlLine.includes('-->')) {
        const url = urlLine.startsWith('http') || urlLine.startsWith('/')
          ? urlLine
          : new URL(urlLine, baseUrl).toString()
        entries.push({ url })
      }
      i += 2
    } else {
      i++
    }
  }
  return entries
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function useThumbnails(thumbnailsUrl: string | undefined) {
  const [images, setImages] = useState<string[]>([])
  useEffect(() => {
    if (!thumbnailsUrl) return
    let cancelled = false
    const controller = new AbortController()
    const run = async () => {
      try {
        const res = await fetch(thumbnailsUrl, { cache: 'no-store', signal: controller.signal })
        if (!res.ok || cancelled) return
        const text = await res.text()
        if (cancelled) return
        const parsed = parseVttThumbnails(text, thumbnailsUrl)
        const results: string[] = []
        await Promise.all(
          parsed.map(async (entry, idx) => {
            try {
              const r = await fetch(entry.url, { signal: controller.signal, cache: 'force-cache' })
              if (!r.ok) return
              results[idx] = await blobToDataUrl(await r.blob())
            } catch { /* skip */ }
          }),
        )
        if (!cancelled) setImages(results)
      } catch { /* skip */ }
    }
    run()
    return () => { cancelled = true; controller.abort() }
  }, [thumbnailsUrl])
  return images
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACK_H = 48
const HANDLE_W = 12
const SCALE = 10000

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type VideoTrimRangeSliderProps = {
  duration: number
  clipStart: number
  clipEnd: number
  currentTime?: number
  thumbnailsUrl?: string
  onChange: (start: number, end: number) => void
}

export function VideoTrimRangeSlider({
  duration,
  clipStart,
  clipEnd,
  currentTime,
  thumbnailsUrl,
  onChange,
}: VideoTrimRangeSliderProps) {
  const images = useThumbnails(thumbnailsUrl)
  const hasFilmstrip = images.length > 0

  const toSlider = useCallback(
    (v: number) => (duration > 0 ? Math.round((v / duration) * SCALE) : 0),
    [duration],
  )
  const fromSlider = useCallback(
    (v: number) => (duration > 0 ? (v / SCALE) * duration : 0),
    [duration],
  )

  // 逻辑：拖拽中标记，用于冻结播放头。
  const [dragging, setDragging] = useState(false)
  const frozenPlayheadRef = useRef<number | null>(null)

  const handleValueChange = useCallback(
    (values: number[]) => {
      let start = fromSlider(values[0]!)
      let end = fromSlider(values[1]!)
      // 逻辑：clamp 到 [0, duration]，防止溢出。
      start = Math.max(0, Math.min(start, duration))
      end = Math.max(start + 0.1, Math.min(end, duration))
      onChange(start, end)
    },
    [fromSlider, onChange, duration],
  )

  const handleValueCommit = useCallback(() => {
    setDragging(false)
    frozenPlayheadRef.current = null
  }, [])

  const handlePointerDown = useCallback(() => {
    setDragging(true)
    frozenPlayheadRef.current = currentTime ?? null
  }, [currentTime])

  const pct = (v: number) => (duration > 0 ? (v / duration) * 100 : 0)
  const startPct = pct(clipStart)
  const endPct = pct(clipEnd)
  // 逻辑：拖拽中冻结播放头位置，避免播放头随 currentTime 乱跳。
  const displayPlayhead = dragging ? frozenPlayheadRef.current : currentTime
  const playheadPct = displayPlayhead != null ? pct(displayPlayhead) : null

  return (
    <div className="flex flex-col gap-2 select-none">
      {/* Time labels */}
      <div className="flex items-center justify-between text-xs text-ol-text-auxiliary tabular-nums px-1">
        <span>{formatTime(clipStart)}</span>
        <span className="text-ol-text-secondary font-medium">
          {formatTime(clipEnd - clipStart)}
        </span>
        <span>{formatTime(clipEnd)}</span>
      </div>

      {/* Track area — overflow-hidden 防止柄溢出 */}
      <div className="relative overflow-hidden" style={{ height: TRACK_H }}>

        {/* === Visual layers (all pointer-events-none) === */}

        {/* Filmstrip background */}
        {hasFilmstrip ? (
          <div className="absolute inset-0 flex overflow-hidden pointer-events-none">
            {images.map((src, i) => (
              <div key={`f-${i}`} className="relative flex-1 overflow-hidden" style={{ minWidth: 0 }}>
                {src ? (
                  <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full bg-ol-surface-muted" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 bg-ol-surface-muted pointer-events-none" />
        )}

        {/* Dimmed left */}
        <div
          className="absolute top-0 left-0 bg-background/70 pointer-events-none"
          style={{ width: `${startPct}%`, height: TRACK_H }}
        />
        {/* Dimmed right */}
        <div
          className="absolute top-0 right-0 bg-background/70 pointer-events-none"
          style={{ width: `${100 - endPct}%`, height: TRACK_H }}
        />

        {/* Selection top/bottom border */}
        <div
          className="absolute top-0 border-y-2 border-ol-blue pointer-events-none"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%`, height: TRACK_H }}
        />

        {/* Visual handles — 由 clipStart/clipEnd 驱动定位 */}
        <div
          className="absolute top-0 pointer-events-none z-10"
          style={{ left: `${startPct}%`, height: TRACK_H }}
        >
          <div
            className="h-full bg-ol-blue rounded-l-sm"
            style={{ width: HANDLE_W, transform: `translateX(-100%)` }}
          />
        </div>
        <div
          className="absolute top-0 pointer-events-none z-10"
          style={{ left: `${endPct}%`, height: TRACK_H }}
        >
          <div
            className="h-full bg-ol-blue rounded-r-sm"
            style={{ width: HANDLE_W }}
          />
        </div>

        {/* Playhead */}
        {playheadPct != null && (
          <div
            className="absolute top-0 pointer-events-none z-20"
            style={{ left: `${playheadPct}%`, height: TRACK_H }}
          >
            <div className="h-full w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)]" />
          </div>
        )}

        {/* === Radix Slider — 透明交互层 === */}
        {/* 逻辑：Radix Slider 处理所有拖拽数学，thumb 透明但保留交互热区。 */}
        <SliderPrimitive.Root
          min={0}
          max={SCALE}
          step={1}
          minStepsBetweenThumbs={1}
          value={[toSlider(clipStart), toSlider(clipEnd)]}
          onValueChange={handleValueChange}
          onValueCommit={handleValueCommit}
          onPointerDown={handlePointerDown}
          className="absolute inset-0 flex touch-none items-center"
          style={{ height: TRACK_H }}
        >
          <SliderPrimitive.Track className="relative h-full w-full">
            <SliderPrimitive.Range className="absolute h-full" />
          </SliderPrimitive.Track>
          {/* 逻辑：Thumb 视觉透明，但有 24px 宽的交互热区。 */}
          <SliderPrimitive.Thumb
            className="block outline-none cursor-grab active:cursor-grabbing"
            style={{ width: 24, height: TRACK_H, opacity: 0 }}
          />
          <SliderPrimitive.Thumb
            className="block outline-none cursor-grab active:cursor-grabbing"
            style={{ width: 24, height: TRACK_H, opacity: 0 }}
          />
        </SliderPrimitive.Root>
      </div>
    </div>
  )
}
