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
  /** Called when the user clicks the cancel button. When provided, a cancel button is shown. */
  onCancel?: () => void
  /** Whether a cancel request is in flight. */
  cancelling?: boolean
  /** Compact layout for small nodes (e.g. audio). Reduces ring size and uses inline layout. */
  compact?: boolean
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

const COMPACT_RING_RADIUS = 14
const COMPACT_RING_STROKE = 2
const COMPACT_RING_CIRCUMFERENCE = 2 * Math.PI * COMPACT_RING_RADIUS
const COMPACT_SVG_SIZE = (COMPACT_RING_RADIUS + COMPACT_RING_STROKE) * 2

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
  onCancel,
  cancelling,
  compact,
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

  const elapsedMs = Math.max(0, now - effectiveStart)
  const estimatedMs = estimatedSeconds * 1000

  // Progress: prefer server-reported, otherwise time-based (cap at 99%).
  const timeProgress = Math.min(elapsedMs / estimatedMs, 0.99)
  const progress =
    serverProgress != null ? Math.min(serverProgress / 100, 0.99) : timeProgress

  const colors = COLOR_MAP[color]

  if (compact) {
    const cDashOffset = COMPACT_RING_CIRCUMFERENCE * (1 - progress)
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-3xl bg-background/80 backdrop-blur-sm">
        {/* Compact circular ring */}
        <div className="relative shrink-0">
          <svg
            width={COMPACT_SVG_SIZE}
            height={COMPACT_SVG_SIZE}
            className="-rotate-90"
          >
            <circle
              cx={COMPACT_SVG_SIZE / 2}
              cy={COMPACT_SVG_SIZE / 2}
              r={COMPACT_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={COMPACT_RING_STROKE}
              className="text-foreground/8"
            />
            <circle
              cx={COMPACT_SVG_SIZE / 2}
              cy={COMPACT_SVG_SIZE / 2}
              r={COMPACT_RING_RADIUS}
              fill="none"
              strokeWidth={COMPACT_RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={COMPACT_RING_CIRCUMFERENCE}
              strokeDashoffset={cDashOffset}
              className={`${colors.ring} transition-[stroke-dashoffset] duration-1000 ease-linear`}
            />
          </svg>
        </div>
        {/* Inline text + cancel */}
        <div className="flex flex-col gap-0.5">
          <span className={`text-xs font-medium tabular-nums ${colors.text}`}>
            {Math.round(progress * 100)}%
            <span className="ml-1.5 text-[11px] font-normal text-ol-text-secondary">
              {t('generatingOverlay.status', { duration: formatDuration(estimatedSeconds) })}
            </span>
          </span>
          {onCancel ? (
            <button
              type="button"
              disabled={cancelling}
              className="inline-flex items-center text-[11px] font-medium text-ol-text-secondary hover:text-foreground transition-colors duration-150 disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
            >
              {cancelling
                ? t('generatingOverlay.cancelling', { defaultValue: '取消中...' })
                : t('generatingOverlay.cancel', { defaultValue: '取消' })}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

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
      {/* Cancel button */}
      {onCancel ? (
        <button
          type="button"
          disabled={cancelling}
          className="mt-1 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium text-ol-text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors duration-150 disabled:opacity-50"
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
        >
          {cancelling
            ? t('generatingOverlay.cancelling', { defaultValue: '取消中...' })
            : t('generatingOverlay.cancel', { defaultValue: '取消' })}
        </button>
      ) : null}
    </div>
  )
}
