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

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/** Format seconds into mm:ss.s (single decimal). */
function formatTimePrecise(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// VTT thumbnail parsing & filmstrip
// ---------------------------------------------------------------------------

type ThumbnailEntry = { startTime: number; endTime: number; url: string }

/** Parse HLS VTT thumbnail manifest into entries. */
function parseVttThumbnails(vttText: string, baseUrl: string): ThumbnailEntry[] {
  const entries: ThumbnailEntry[] = []
  const lines = vttText.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!.trim()
    // 逻辑：匹配 "00:00:00.000 --> 00:00:04.000" 时间行。
    const timeMatch = line.match(
      /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})$/,
    )
    if (timeMatch) {
      const startTime = parseVttTime(timeMatch[1]!)
      const endTime = parseVttTime(timeMatch[2]!)
      // 逻辑：下一行是缩略图 URL。
      const urlLine = lines[i + 1]?.trim()
      if (urlLine && !urlLine.includes('-->')) {
        const url = urlLine.startsWith('http') || urlLine.startsWith('/')
          ? urlLine
          : new URL(urlLine, baseUrl).toString()
        entries.push({ startTime, endTime, url })
      }
      i += 2
    } else {
      i++
    }
  }
  return entries
}

function parseVttTime(str: string): number {
  const parts = str.split(':')
  const h = Number(parts[0])
  const m = Number(parts[1])
  const s = Number(parts[2])
  return h * 3600 + m * 60 + s
}

/** Load thumbnail images and return data URLs. */
async function loadThumbnailImages(
  entries: ThumbnailEntry[],
  signal?: AbortSignal,
): Promise<string[]> {
  const results: string[] = []
  // 逻辑：并行加载所有缩略图，失败的用空字符串占位。
  const promises = entries.map(async (entry, idx) => {
    try {
      const res = await fetch(entry.url, { signal, cache: 'force-cache' })
      if (!res.ok) return
      const blob = await res.blob()
      const dataUrl = await blobToDataUrl(blob)
      results[idx] = dataUrl
    } catch {
      // 逻辑：忽略单帧加载失败。
    }
  })
  await Promise.all(promises)
  return results
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/** Hook to fetch and parse VTT thumbnails. */
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
        const imgs = await loadThumbnailImages(parsed, controller.signal)
        if (!cancelled) setImages(imgs)
      } catch {
        // 逻辑：VTT 加载失败时不阻塞 UI。
      }
    }
    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [thumbnailsUrl])

  return images
}

// ---------------------------------------------------------------------------
// Filmstrip component
// ---------------------------------------------------------------------------

function Filmstrip({
  images,
  trackHeight,
}: {
  images: string[]
  trackHeight: number
}) {
  if (images.length === 0) return null
  return (
    <div
      className="absolute inset-0 flex overflow-hidden"
      style={{ height: trackHeight }}
    >
      {images.map((src, i) => (
        <div
          key={`frame-${i}`}
          className="relative flex-1 overflow-hidden"
          style={{ minWidth: 0 }}
        >
          {src ? (
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="h-full w-full bg-ol-surface-muted" />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drag type: 'start' handle, 'end' handle, or 'seek' (playhead scrub)
// ---------------------------------------------------------------------------

type DragTarget = 'start' | 'end' | 'seek' | null

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TRACK_HEIGHT = 48

export type VideoTrimRangeSliderProps = {
  duration: number
  clipStart: number
  clipEnd: number
  /** Current playback position for the playhead indicator. */
  currentTime?: number
  /** VTT thumbnails URL for filmstrip background. */
  thumbnailsUrl?: string
  onChange: (start: number, end: number) => void
  /** Seek when clicking on the track. */
  onSeek?: (time: number) => void
}

/**
 * Enhanced dual-handle range slider for video trim with filmstrip thumbnails.
 * Shows video frame thumbnails as background, dimmed regions outside selection,
 * dual drag handles, and a draggable playhead indicator.
 */
export function VideoTrimRangeSlider({
  duration,
  clipStart,
  clipEnd,
  currentTime,
  thumbnailsUrl,
  onChange,
  onSeek,
}: VideoTrimRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<DragTarget>(null)
  const [, setDragTick] = useState(0)

  const clipStartRef = useRef(clipStart)
  clipStartRef.current = clipStart
  const clipEndRef = useRef(clipEnd)
  clipEndRef.current = clipEnd
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSeekRef = useRef(onSeek)
  onSeekRef.current = onSeek

  const images = useThumbnails(thumbnailsUrl)
  const hasFilmstrip = images.length > 0

  const pctOf = useCallback(
    (v: number) => (duration > 0 ? (v / duration) * 100 : 0),
    [duration],
  )

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

  // 逻辑：document-level pointer events 统一处理 handle 拖拽和 playhead scrub。
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const target = draggingRef.current
      if (!target) return
      e.preventDefault()
      const v = valueFromClientX(e.clientX)
      if (target === 'start') {
        onChangeRef.current(Math.min(v, clipEndRef.current - 0.1), clipEndRef.current)
      } else if (target === 'end') {
        onChangeRef.current(clipStartRef.current, Math.max(v, clipStartRef.current + 0.1))
      } else if (target === 'seek') {
        onSeekRef.current?.(v)
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

  // 逻辑：点击/按住轨道空白区域启动 seek 拖拽，按住后可持续拖动播放头。
  const handleTrackPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const v = valueFromClientX(e.clientX)
      onSeek?.(v)
      draggingRef.current = 'seek'
      setDragTick((c) => c + 1)
    },
    [valueFromClientX, onSeek],
  )

  const startPct = pctOf(clipStart)
  const endPct = pctOf(clipEnd)
  const playheadPct = currentTime != null ? pctOf(currentTime) : null

  return (
    <div className="flex flex-col gap-2 select-none">
      {/* Time labels */}
      <div className="flex items-center justify-between text-xs text-ol-text-auxiliary tabular-nums">
        <span>{formatTimePrecise(clipStart)}</span>
        <span className="text-ol-text-secondary font-medium">
          {formatTimePrecise(clipEnd - clipStart)}
        </span>
        <span>{formatTimePrecise(clipEnd)}</span>
      </div>
      {/* Track with filmstrip */}
      <div
        ref={trackRef}
        className="relative cursor-pointer"
        style={{ height: TRACK_HEIGHT }}
        onPointerDown={handleTrackPointerDown}
      >
        {/* Filmstrip thumbnails or plain background */}
        {hasFilmstrip ? (
          <Filmstrip images={images} trackHeight={TRACK_HEIGHT} />
        ) : (
          <div
            className="absolute inset-0 bg-ol-surface-muted"
            style={{ height: TRACK_HEIGHT }}
          />
        )}

        {/* Dimmed left region (outside selection) */}
        <div
          className="absolute top-0 left-0 bg-background/70"
          style={{ width: `${startPct}%`, height: TRACK_HEIGHT }}
        />
        {/* Dimmed right region (outside selection) */}
        <div
          className="absolute top-0 right-0 bg-background/70"
          style={{ width: `${100 - endPct}%`, height: TRACK_HEIGHT }}
        />

        {/* Selection border highlight */}
        <div
          className="absolute top-0 border-y-2 border-ol-blue/80 pointer-events-none"
          style={{
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            height: TRACK_HEIGHT,
          }}
        />

        {/* Start handle */}
        <div
          className="absolute top-0 flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
          style={{ left: `${startPct}%`, height: TRACK_HEIGHT }}
          onPointerDown={onHandleDown('start')}
        >
          <div className="relative -translate-x-1/2 h-full w-4 flex items-center justify-center">
            <div className="h-full w-1.5 rounded-l-sm bg-ol-blue shadow-md" />
            {/* Grip lines */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col gap-0.5">
                <div className="h-px w-1 rounded-full bg-white/80" />
                <div className="h-px w-1 rounded-full bg-white/80" />
                <div className="h-px w-1 rounded-full bg-white/80" />
              </div>
            </div>
          </div>
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
          style={{ left: `${endPct}%`, height: TRACK_HEIGHT }}
          onPointerDown={onHandleDown('end')}
        >
          <div className="relative -translate-x-1/2 h-full w-4 flex items-center justify-center">
            <div className="h-full w-1.5 rounded-r-sm bg-ol-blue shadow-md" />
            {/* Grip lines */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col gap-0.5">
                <div className="h-px w-1 rounded-full bg-white/80" />
                <div className="h-px w-1 rounded-full bg-white/80" />
                <div className="h-px w-1 rounded-full bg-white/80" />
              </div>
            </div>
          </div>
        </div>

        {/* Playhead — white line with shadow, draggable */}
        {playheadPct != null && (
          <div
            className="absolute top-0 pointer-events-none z-20"
            style={{ left: `${playheadPct}%`, height: TRACK_HEIGHT }}
          >
            <div className="h-full w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)]" />
          </div>
        )}
      </div>
    </div>
  )
}
