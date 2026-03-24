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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Pause, Play, RotateCcw } from 'lucide-react'
import i18next from 'i18next'
import type { DragTarget, VideoTrimPayload } from './video-trim-types'
import {
  buildStreamUrl,
  clamp,
  formatTime,
  formatTimePrecise,
} from './video-trim-utils'
import { useFilmstripFrames } from './use-filmstrip-frames'

const TRACK_HEIGHT = 48

// ---------------------------------------------------------------------------
// Filmstrip
// ---------------------------------------------------------------------------

function Filmstrip({ images }: { images: string[] }) {
  if (images.length === 0) return null
  return (
    <div className="absolute inset-0 flex overflow-hidden" style={{ height: TRACK_HEIGHT }}>
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
// CropMarker handle
// ---------------------------------------------------------------------------

function CropMarker({
  side,
  onPointerDown,
}: {
  side: 'start' | 'end'
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const isStart = side === 'start'
  return (
    <div
      className="absolute top-0 flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
      style={{ height: TRACK_HEIGHT }}
      onPointerDown={onPointerDown}
    >
      <div className="relative -translate-x-1/2 h-full w-4 flex items-center justify-center">
        <div
          className={`h-full w-1.5 bg-ol-blue shadow-md ${isStart ? 'rounded-l-sm' : 'rounded-r-sm'}`}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col gap-0.5">
            <div className="h-px w-1 rounded-full bg-white/80" />
            <div className="h-px w-1 rounded-full bg-white/80" />
            <div className="h-px w-1 rounded-full bg-white/80" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VideoTrimPlayer — unified player + timeline + controls
// ---------------------------------------------------------------------------

export type VideoTrimPlayerProps = {
  payload: VideoTrimPayload
  onConfirm: (clipStart: number, clipEnd: number, posterDataUrl?: string) => void
  onClose: () => void
}

export function VideoTrimPlayer({ payload, onConfirm, onClose }: VideoTrimPlayerProps) {
  const { videoPath, ids, posterSrc } = payload

  // ---- refs ----
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<DragTarget>(null)

  // ---- media state ----
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(payload.duration)
  const [ready, setReady] = useState(false)

  // ---- clip state ----
  const [clipStart, setClipStart] = useState(payload.clipStart)
  const [clipEnd, setClipEnd] = useState(
    payload.clipEnd > 0 ? payload.clipEnd : payload.duration,
  )

  // Keep refs in sync for event handlers
  const clipStartRef = useRef(clipStart)
  clipStartRef.current = clipStart
  const clipEndRef = useRef(clipEnd)
  clipEndRef.current = clipEnd

  // ---- Stream URL ----
  const streamUrl = useMemo(() => buildStreamUrl(videoPath, ids), [videoPath, ids])
  const effectiveDuration = duration > 0 ? duration : payload.duration
  const images = useFilmstripFrames(videoPath, ids, effectiveDuration)

  // ---- Update clipEnd when duration first becomes known ----
  const prevDurationRef = useRef(0)
  useEffect(() => {
    if (effectiveDuration > 0 && prevDurationRef.current === 0) {
      if (clipEnd <= 0 || clipEnd > effectiveDuration) {
        setClipEnd(effectiveDuration)
      }
    }
    prevDurationRef.current = effectiveDuration
  }, [effectiveDuration, clipEnd])

  // ---- Direct video attach ----
  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return

    video.src = streamUrl
    const onCanPlay = () => setReady(true)
    video.addEventListener('canplay', onCanPlay)

    return () => {
      video.removeEventListener('canplay', onCanPlay)
    }
  }, [streamUrl])

  // ---- video event handlers ----
  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const d = video.duration
    if (Number.isFinite(d) && d > 0) {
      setDuration(d)
    }
  }, [])

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setCurrentTime(video.currentTime)
    // Auto-pause at clipEnd
    if (clipEndRef.current > 0 && video.currentTime >= clipEndRef.current) {
      video.pause()
      setPlaying(false)
    }
  }, [])

  const onVideoPlay = useCallback(() => setPlaying(true), [])
  const onVideoPause = useCallback(() => setPlaying(false), [])

  // ---- Play/Pause toggle ----
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video || !ready) return
    if (playing) {
      video.pause()
    } else {
      // Start from clipStart if at end or before clip
      if (video.currentTime < clipStartRef.current || video.currentTime >= clipEndRef.current) {
        video.currentTime = clipStartRef.current
      }
      video.play()
    }
  }, [playing, ready])

  // ---- Timeline drag ----
  const pctOf = useCallback(
    (v: number) => (effectiveDuration > 0 ? (v / effectiveDuration) * 100 : 0),
    [effectiveDuration],
  )

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || effectiveDuration <= 0) return 0
      const rect = track.getBoundingClientRect()
      const pct = (clientX - rect.left) / rect.width
      return clamp(Math.round(pct * effectiveDuration * 10) / 10, 0, effectiveDuration)
    },
    [effectiveDuration],
  )

  // Document-level pointer events for drag
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const target = draggingRef.current
      if (!target) return
      e.preventDefault()
      const v = valueFromClientX(e.clientX)
      if (target === 'start') {
        const oldStart = clipStartRef.current
        const newStart = Math.min(v, clipEndRef.current - 0.1)
        setClipStart(newStart)
        const video = videoRef.current
        // 逻辑：播放头在起点附近时跟随 start 手柄移动，否则只约束不越界。
        if (video) {
          if (Math.abs(video.currentTime - oldStart) < 0.15 || video.currentTime < newStart) {
            video.currentTime = newStart
            setCurrentTime(newStart)
          }
        }
      } else if (target === 'end') {
        const oldEnd = clipEndRef.current
        const newEnd = Math.max(v, clipStartRef.current + 0.1)
        setClipEnd(newEnd)
        const video = videoRef.current
        // 逻辑：播放头在终点附近时跟随 end 手柄移动，否则只约束不越界。
        if (video) {
          if (Math.abs(video.currentTime - oldEnd) < 0.15 || video.currentTime > newEnd) {
            video.currentTime = newEnd
            setCurrentTime(newEnd)
          }
        }
      } else if (target === 'playhead') {
        // 逻辑：拖动播放头时也约束在裁剪范围内。
        const clamped = clamp(v, clipStartRef.current, clipEndRef.current)
        const video = videoRef.current
        if (video) video.currentTime = clamped
        setCurrentTime(clamped)
      }
    }
    const handleUp = () => {
      draggingRef.current = null
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
  }, [valueFromClientX])

  const onStartHandleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = 'start'
  }, [])

  const onEndHandleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = 'end'
  }, [])

  const handleTrackPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const v = clamp(valueFromClientX(e.clientX), clipStartRef.current, clipEndRef.current)
      const video = videoRef.current
      if (video) video.currentTime = v
      setCurrentTime(v)
      draggingRef.current = 'playhead'
    },
    [valueFromClientX],
  )

  // ---- Actions ----
  const handleReset = useCallback(() => {
    setClipStart(0)
    setClipEnd(effectiveDuration)
  }, [effectiveDuration])

  const captureFrame = useCallback((): string | undefined => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return undefined
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return undefined
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.8)
    } catch {
      return undefined
    }
  }, [])

  const handleConfirm = useCallback(() => {
    const video = videoRef.current
    if (video && ready) {
      // Seek to clipStart, capture frame, then confirm
      video.currentTime = clipStart
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        const poster = captureFrame()
        onConfirm(clipStart, clipEnd, poster)
        onClose()
      }
      video.addEventListener('seeked', onSeeked)
    } else {
      onConfirm(clipStart, clipEnd)
      onClose()
    }
  }, [clipStart, clipEnd, onConfirm, onClose, ready, captureFrame])

  // ---- Computed percentages ----
  const startPct = pctOf(clipStart)
  const endPct = pctOf(clipEnd)
  const playheadPct = pctOf(currentTime)

  return (
    <div className="flex flex-col">
      {/* ---- Video area ---- */}
      <div
        className="relative aspect-video w-full overflow-hidden bg-black cursor-pointer"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          muted
          poster={posterSrc}
          className="absolute inset-0 h-full w-full object-contain"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onPlay={onVideoPlay}
          onPause={onVideoPause}
        />
        {/* Loading overlay */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-2 text-sm text-white/70">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>
                {i18next.t('board:videoNode.trim.loading', { defaultValue: 'Loading video...' })}
              </span>
            </div>
          </div>
        )}
        {/* Play/Pause overlay */}
        {ready && !playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50">
              <Play className="h-6 w-6 text-white translate-x-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* ---- Timeline ---- */}
      <div className="flex flex-col gap-2 px-5 pt-3 pb-1 select-none">
        {/* Time labels */}
        <div className="flex items-center justify-between text-xs text-ol-text-auxiliary tabular-nums">
          <span>{formatTimePrecise(clipStart)}</span>
          <span className="text-ol-text-secondary font-medium">
            {formatTimePrecise(clipEnd - clipStart)}
          </span>
          <span>{formatTimePrecise(clipEnd)}</span>
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          className="relative cursor-pointer"
          style={{ height: TRACK_HEIGHT }}
          onPointerDown={handleTrackPointerDown}
        >
          {/* Filmstrip or plain bg */}
          {images.length > 0 ? (
            <Filmstrip images={images} />
          ) : (
            <div
              className="absolute inset-0 bg-ol-surface-muted"
              style={{ height: TRACK_HEIGHT }}
            />
          )}

          {/* Dimmed left */}
          <div
            className="absolute top-0 left-0 bg-background/70"
            style={{ width: `${startPct}%`, height: TRACK_HEIGHT }}
          />
          {/* Dimmed right */}
          <div
            className="absolute top-0 right-0 bg-background/70"
            style={{ width: `${100 - endPct}%`, height: TRACK_HEIGHT }}
          />

          {/* Selection border */}
          <div
            className="absolute top-0 border-y-2 border-ol-blue/80 pointer-events-none"
            style={{
              left: `${startPct}%`,
              width: `${endPct - startPct}%`,
              height: TRACK_HEIGHT,
            }}
          />

          {/* Start handle */}
          <div style={{ left: `${startPct}%`, position: 'absolute', top: 0 }}>
            <CropMarker side="start" onPointerDown={onStartHandleDown} />
          </div>

          {/* End handle */}
          <div style={{ left: `${endPct}%`, position: 'absolute', top: 0 }}>
            <CropMarker side="end" onPointerDown={onEndHandleDown} />
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 pointer-events-none z-20"
            style={{ left: `${playheadPct}%`, height: TRACK_HEIGHT }}
          >
            {/* Triangle indicator */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-white" />
            <div className="h-full w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)]" />
          </div>
        </div>
      </div>

      {/* ---- Control bar ---- */}
      <div className="flex items-center justify-between gap-2 px-5 pt-1 pb-4">
        {/* Left: play + time */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-surface-muted/80 transition-colors duration-150"
            onClick={togglePlay}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
          </button>
          <span className="text-xs text-ol-text-auxiliary tabular-nums">
            {formatTime(currentTime)} / {formatTime(effectiveDuration)}
          </span>
          <span className="text-xs text-ol-text-secondary tabular-nums">
            {i18next.t('board:videoNode.trim.clipDuration', {
              defaultValue: 'Clip: {{time}}',
              time: formatTime(clipEnd - clipStart),
            })}
          </span>
        </div>

        {/* Right: reset + confirm */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-surface-muted/80 transition-colors duration-150"
            onClick={handleReset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {i18next.t('board:videoNode.trim.reset', { defaultValue: 'Reset' })}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs bg-foreground text-background hover:bg-foreground/90 transition-colors duration-150"
            onClick={handleConfirm}
          >
            <Check className="h-3.5 w-3.5" />
            {i18next.t('board:videoNode.trim.confirm', { defaultValue: 'Confirm' })}
          </button>
        </div>
      </div>
    </div>
  )
}
