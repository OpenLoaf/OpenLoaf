/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneratingOverlayProps = {
  /** Timestamp (ms) when generation started. Falls back to mount time if omitted. */
  startedAt?: number
  /** Estimated total duration in seconds. */
  estimatedSeconds: number
  /** Server-reported progress 0–100 (takes precedence over time-based estimate). */
  serverProgress?: number
  /** Semantic accent color. */
  color?: 'blue' | 'purple' | 'green'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOR_MAP = {
  blue: { ring: 'stroke-ol-blue', text: 'text-ol-blue', bg: 'bg-ol-blue/8' },
  purple: { ring: 'stroke-ol-purple', text: 'text-ol-purple', bg: 'bg-ol-purple/8' },
  green: { ring: 'stroke-ol-green', text: 'text-ol-green', bg: 'bg-ol-green/8' },
} as const

const RING_RADIUS = 28
const RING_STROKE = 3
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const SVG_SIZE = (RING_RADIUS + RING_STROKE) * 2

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m > 0) return `${m}:${sec.toString().padStart(2, '0')}`
  return `${s}s`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Shared generating overlay with circular countdown ring. */
export function GeneratingOverlay({
  startedAt,
  estimatedSeconds,
  serverProgress,
  color = 'blue',
}: GeneratingOverlayProps) {
  const { t } = useTranslation('board')
  const [now, setNow] = useState(Date.now)
  const mountTime = useState(() => Date.now())[0]
  const effectiveStart = startedAt ?? mountTime

  // Tick every second to update countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedMs = now - effectiveStart
  const elapsedSec = elapsedMs / 1000
  const estimatedMs = estimatedSeconds * 1000

  // Progress: prefer server-reported, otherwise time-based (cap at 99%).
  const timeProgress = Math.min(elapsedMs / estimatedMs, 0.99)
  const progress =
    serverProgress != null ? Math.min(serverProgress / 100, 0.99) : timeProgress

  const colors = COLOR_MAP[color]
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress)

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-background/80 backdrop-blur-sm">
      {/* Circular ring */}
      <div className="relative">
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          className="-rotate-90"
        >
          {/* Background track */}
          <circle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE}
            className="text-foreground/8"
          />
          {/* Progress arc */}
          <circle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className={`${colors.ring} transition-[stroke-dashoffset] duration-1000 ease-linear`}
          />
        </svg>
        {/* Center text — always percentage */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-medium tabular-nums ${colors.text}`}>
            {Math.round(progress * 100)}%
          </span>
        </div>
      </div>
      {/* Status line */}
      <span className="text-[11px] tabular-nums text-ol-text-secondary">
        {t('generatingOverlay.status', { duration: formatDuration(estimatedSeconds) })}
      </span>
    </div>
  )
}
