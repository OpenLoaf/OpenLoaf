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
import { useWavesurfer } from '@wavesurfer/react'
import { Pause, Play } from 'lucide-react'

/** Format seconds to mm:ss. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export type AudioWavePlayerProps = {
  /** Audio source URL. */
  src: string
}

/**
 * Full-size audio waveform player.
 * Waveform fills the container, bottom bar shows time + play button.
 */
export function AudioWavePlayer({ src }: AudioWavePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState(0)

  const { wavesurfer, isReady, isPlaying, currentTime } = useWavesurfer({
    container: containerRef,
    url: src,
    height: 'auto' as unknown as number,
    waveColor: 'rgba(148,163,184,0.5)',
    progressColor: 'rgba(148,163,184,0.8)',
    cursorColor: '#ef4444',
    cursorWidth: 2,
    barWidth: 3,
    barGap: 2,
    barRadius: 2,
    normalize: true,
    hideScrollbar: true,
    interact: true,
  })

  useEffect(() => {
    if (!wavesurfer) return
    const onReady = () => setDuration(wavesurfer.getDuration())
    wavesurfer.on('ready', onReady)
    return () => { wavesurfer.un('ready', onReady) }
  }, [wavesurfer])

  const handlePlayPause = useCallback(() => {
    wavesurfer?.playPause()
  }, [wavesurfer])

  return (
    <div className="flex h-full w-full flex-col">
      {/* Waveform area — fills available space */}
      <div ref={containerRef} className="flex-1 min-h-0 px-2 pt-2" />

      {/* Bottom bar: time + play button */}
      <div className="flex items-center px-3 pb-2 pt-1.5">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={!isReady}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-foreground transition-colors hover:bg-foreground/10 disabled:opacity-40"
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
        </button>
      </div>
    </div>
  )
}
