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
import { create } from 'zustand'
import { XIcon, RotateCcw, Check, Loader2, Play, Pause } from 'lucide-react'
import { MediaPlayer, MediaProvider, useMediaState, useMediaRemote } from '@vidstack/react'
import type { PlayerSrc } from '@vidstack/react'
import i18next from 'i18next'
import { resolveServerUrl } from '@/utils/server-url'
import { VideoTrimRangeSlider } from './VideoTrimRangeSlider'

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type VideoTrimPayload = {
  hlsPath: string
  ids: { projectId?: string; boardId?: string }
  duration: number
  clipStart: number
  clipEnd: number
  posterSrc?: string
  thumbnailsUrl?: string
  onConfirm: (clipStart: number, clipEnd: number) => void
}

type VideoTrimDialogStore = {
  payload: VideoTrimPayload | null
  open: (payload: VideoTrimPayload) => void
  close: () => void
}

export const useVideoTrimDialogStore = create<VideoTrimDialogStore>((set) => ({
  payload: null,
  open: (payload) => set({ payload }),
  close: () => set({ payload: null }),
}))

/** Open the video trim dialog from anywhere. */
export function openVideoTrimDialog(payload: VideoTrimPayload) {
  useVideoTrimDialogStore.getState().open(payload)
}

// ---------------------------------------------------------------------------
// HLS URL builders
// ---------------------------------------------------------------------------

function buildManifestUrl(
  path: string,
  ids: { projectId?: string; boardId?: string },
) {
  const baseUrl = resolveServerUrl()
  const query = new URLSearchParams({ path })
  if (ids.projectId) query.set('projectId', ids.projectId)
  if (ids.boardId) query.set('boardId', ids.boardId)
  const prefix = baseUrl ? `${baseUrl}/media/hls/manifest` : '/media/hls/manifest'
  return `${prefix}?${query.toString()}`
}

function buildQualityUrl(
  path: string,
  quality: string,
  ids: { projectId?: string; boardId?: string },
) {
  const baseUrl = resolveServerUrl()
  const query = new URLSearchParams({ path, quality })
  if (ids.projectId) query.set('projectId', ids.projectId)
  if (ids.boardId) query.set('boardId', ids.boardId)
  const prefix = baseUrl ? `${baseUrl}/media/hls/manifest` : '/media/hls/manifest'
  return `${prefix}?${query.toString()}`
}

function buildThumbnailsUrl(
  path: string,
  ids: { projectId?: string; boardId?: string },
) {
  const baseUrl = resolveServerUrl()
  const query = new URLSearchParams({ path })
  if (ids.projectId) query.set('projectId', ids.projectId)
  if (ids.boardId) query.set('boardId', ids.boardId)
  const prefix = baseUrl ? `${baseUrl}/media/hls/thumbnails` : '/media/hls/thumbnails'
  return `${prefix}?${query.toString()}`
}

// ---------------------------------------------------------------------------
// Inner controls (rendered inside <MediaPlayer> for hook access)
// ---------------------------------------------------------------------------

function TrimControlsInner({
  duration,
  clipStart,
  clipEnd,
  thumbnailsUrl,
  onClipChange,
  onReset,
  onConfirm,
}: {
  duration: number
  clipStart: number
  clipEnd: number
  thumbnailsUrl?: string
  onClipChange: (start: number, end: number) => void
  onReset: () => void
  onConfirm: () => void
}) {
  const currentTime = useMediaState('currentTime')
  const paused = useMediaState('paused')
  const remote = useMediaRemote()

  const handleSeek = useCallback(
    (time: number) => {
      remote.seek(time)
    },
    [remote],
  )

  const handlePlayPause = useCallback(() => {
    if (paused) {
      remote.play()
    } else {
      remote.pause()
    }
  }, [paused, remote])

  return (
    <div className="flex flex-col gap-3 pb-4 pt-2">
      <VideoTrimRangeSlider
        duration={duration}
        clipStart={clipStart}
        clipEnd={clipEnd}
        currentTime={currentTime}
        thumbnailsUrl={thumbnailsUrl}
        onChange={onClipChange}
        onSeek={handleSeek}
      />
      {/* Action buttons */}
      <div className="flex items-center justify-between px-5 pt-1">
        <button
          type="button"
          className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-surface-muted/80 transition-colors duration-150"
          onClick={handlePlayPause}
        >
          {paused ? <Play className="h-3.5 w-3.5 translate-x-[1px]" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-surface-muted/80 transition-colors duration-150"
            onClick={onReset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {i18next.t('board:videoNode.trim.reset', { defaultValue: 'Reset' })}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs bg-ol-blue text-white hover:bg-ol-blue/90 transition-colors duration-150"
            onClick={onConfirm}
          >
            <Check className="h-3.5 w-3.5" />
            {i18next.t('board:videoNode.trim.confirm', { defaultValue: 'Confirm' })}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog shell with HLS loading — clip state lives here so MediaPlayer
// receives reactive clipStartTime / clipEndTime props.
// ---------------------------------------------------------------------------

function VideoTrimDialogContent({ payload }: { payload: VideoTrimPayload }) {
  const close = useVideoTrimDialogStore((s) => s.close)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [isBuilding, setIsBuilding] = useState(false)

  // 逻辑：clip state 提升到此层级，使 MediaPlayer 的 clipStartTime/clipEndTime 实时响应拖拽。
  const [clipStart, setClipStart] = useState(payload.clipStart)
  const [clipEnd, setClipEnd] = useState(payload.clipEnd)

  const { hlsPath, ids, posterSrc } = payload

  const masterUrl = useMemo(() => buildManifestUrl(hlsPath, ids), [hlsPath, ids])
  const qualityUrl = useMemo(() => buildQualityUrl(hlsPath, '720p', ids), [hlsPath, ids])
  const thumbnailsUrl = useMemo(
    () => payload.thumbnailsUrl || buildThumbnailsUrl(hlsPath, ids),
    [hlsPath, ids, payload.thumbnailsUrl],
  )

  const mediaSrc = useMemo(
    () =>
      playbackUrl
        ? ({ src: playbackUrl, type: 'application/vnd.apple.mpegurl' } as PlayerSrc)
        : null,
    [playbackUrl],
  )

  // 逻辑：轮询 HLS 转码状态，就绪后开始播放。
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      try {
        const res = await fetch(qualityUrl, { cache: 'no-store' })
        if (cancelled) return
        if (res.status === 200) {
          setPlaybackUrl(masterUrl)
          setIsBuilding(false)
          return
        }
        if (res.status === 202) {
          setIsBuilding(true)
          timer = setTimeout(poll, 1500)
          return
        }
        setIsBuilding(false)
      } catch {
        if (!cancelled) setIsBuilding(false)
      }
    }
    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [qualityUrl, masterUrl])

  // 逻辑：Escape 键关闭。
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [close])

  // 逻辑：视频实际时长可能在 HLS 加载后才知道，通过 MediaPlayer 的 onDurationChange 更新 clipEnd。
  const durationRef = useRef(payload.duration)

  const handleClipChange = useCallback((start: number, end: number) => {
    setClipStart(start)
    setClipEnd(end)
  }, [])

  const handleReset = useCallback(() => {
    setClipStart(0)
    setClipEnd(durationRef.current > 0 ? durationRef.current : payload.duration)
  }, [payload.duration])

  const handleConfirm = useCallback(() => {
    payload.onConfirm(clipStart, clipEnd)
    close()
  }, [clipStart, clipEnd, payload, close])

  // 逻辑：effectiveDuration 在 MediaPlayer 内部通过 DurationSync 更新。
  const effectiveClipEnd = clipEnd > 0 ? clipEnd : undefined

  return (
    // 逻辑：不使用 Radix Dialog Portal，直接渲染固定定位覆盖层，
    // 确保 React 19 环境下 effects 正常 flush。
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/20 animate-in fade-in-0 duration-200"
        onClick={close}
      />
      {/* Content */}
      <div className="bg-card absolute top-[50%] left-[50%] z-50 flex max-h-[85vh] w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] flex-col rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-ol-divider px-5 py-3">
          <h2 className="text-sm font-semibold leading-none">
            {i18next.t('board:videoNode.trim.dialogTitle', { defaultValue: 'Trim Video' })}
          </h2>
          <button
            type="button"
            className="rounded-md opacity-70 transition-opacity hover:opacity-100"
            onClick={close}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {/* Player + Trim controls */}
        {mediaSrc ? (
          <MediaPlayer
            src={mediaSrc}
            poster={posterSrc}
            clipStartTime={clipStart}
            clipEndTime={effectiveClipEnd}
            className="flex flex-col"
            controls={false}
          >
            {/* Video area — no default controls */}
            <div className="relative aspect-video w-full overflow-hidden bg-black">
              <MediaProvider />
            </div>
            {/* Trim controls — inside MediaPlayer for hook access */}
            <DurationSync durationRef={durationRef} onClipEndInit={setClipEnd} initialClipEnd={payload.clipEnd} />
            <TrimControlsInner
              duration={durationRef.current > 0 ? durationRef.current : payload.duration}
              clipStart={clipStart}
              clipEnd={clipEnd}
              thumbnailsUrl={thumbnailsUrl}
              onClipChange={handleClipChange}
              onReset={handleReset}
              onConfirm={handleConfirm}
            />
          </MediaPlayer>
        ) : (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>{isBuilding ? '视频转码中...' : '正在准备视频...'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Sync media duration to parent ref and initialize clipEnd when duration becomes available. */
function DurationSync({
  durationRef,
  onClipEndInit,
  initialClipEnd,
}: {
  durationRef: React.MutableRefObject<number>
  onClipEndInit: (v: number) => void
  initialClipEnd: number
}) {
  const mediaDuration = useMediaState('duration')
  const initializedRef = useRef(false)

  useEffect(() => {
    if (mediaDuration > 0) {
      durationRef.current = mediaDuration
      // 逻辑：首次获取到时长时，若 clipEnd 未设置或超出范围则初始化。
      if (!initializedRef.current) {
        initializedRef.current = true
        if (initialClipEnd <= 0 || initialClipEnd > mediaDuration) {
          onClipEndInit(mediaDuration)
        }
      }
    }
  }, [mediaDuration, durationRef, onClipEndInit, initialClipEnd])

  return null
}

// ---------------------------------------------------------------------------
// Export: always-mounted shell driven by Zustand
// ---------------------------------------------------------------------------

export function VideoTrimDialog() {
  const payload = useVideoTrimDialogStore((s) => s.payload)
  if (!payload) return null
  return <VideoTrimDialogContent payload={payload} />
}
