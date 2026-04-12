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

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BellRingIcon,
  CheckCircle2Icon,
  MoonIcon,
  XCircleIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  asPlainObject,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
} from './shared/tool-utils'

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveSleepInput(part: AnyToolPart) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const seconds = typeof inputObj?.seconds === 'number' ? inputObj.seconds : null
  const reason = typeof inputObj?.reason === 'string' ? inputObj.reason.trim() : ''
  return { seconds, reason }
}

function resolveSleepOutput(part: AnyToolPart): { wokenBy?: string; sleptMs?: number } {
  const raw = part.output
  if (raw == null) return {}
  const obj = asPlainObject(raw)
  if (!obj) return {}
  return {
    wokenBy: typeof obj.wokenBy === 'string' ? obj.wokenBy : undefined,
    sleptMs: typeof obj.slept_ms === 'number' ? obj.slept_ms : undefined,
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 100) / 10
  return `${s}s`
}

// ─── Countdown hook ─────────────────────────────────────────────────

function useCountdown(totalSeconds: number | null, active: boolean) {
  const startRef = useRef<number | null>(null)
  const [remaining, setRemaining] = useState(totalSeconds ?? 0)

  useEffect(() => {
    if (!active || totalSeconds == null) return

    if (startRef.current == null) startRef.current = Date.now()
    const start = startRef.current

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000
      const left = Math.max(0, totalSeconds - elapsed)
      setRemaining(left)
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [active, totalSeconds])

  // Reset when no longer active
  useEffect(() => {
    if (!active) startRef.current = null
  }, [active])

  return remaining
}

function formatCountdown(s: number): string {
  const mins = Math.floor(s / 60)
  const secs = Math.floor(s % 60)
  if (mins > 0) return `${mins}:${secs.toString().padStart(2, '0')}`
  return `${secs}s`
}

// ─── Component ──────────────────────────────────────────────────────

export default function SleepTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const { seconds, reason } = resolveSleepInput(part)
  const { wokenBy, sleptMs } = resolveSleepOutput(part)
  const hasOutput = part.output != null
  const remaining = useCountdown(seconds, streaming)

  // Progress ratio for the bar (0→1)
  const progress = seconds != null && seconds > 0 ? Math.max(0, 1 - remaining / seconds) : 0

  // ── Streaming: countdown row ──
  if (streaming) {
    return (
      <div className={cn('relative min-w-0 overflow-hidden rounded-full text-xs', className)}>
        {/* progress bar background */}
        <div
          className="absolute inset-0 rounded-full bg-blue-500/8 dark:bg-blue-400/10 transition-[width] duration-200 ease-linear"
          style={{ width: `${Math.min(progress * 100, 100)}%` }}
        />
        <div className="relative flex w-full items-center gap-1.5 px-2.5 py-1">
          <MoonIcon className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400 animate-pulse" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('bgTool.sleep')}
          </span>
          {reason ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground/50">
              {reason}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 tabular-nums font-mono text-xs text-blue-500 dark:text-blue-400">
            {formatCountdown(remaining)}
          </span>
        </div>
      </div>
    )
  }

  // ── Completed / error row ──
  const isWokenByTask = wokenBy === 'bg-task-notification'

  return (
    <div
      className={cn(
        'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        className,
      )}
    >
      {hasError ? (
        <>
          <MoonIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('bgTool.sleep')}
          </span>
          <XCircleIcon className="size-3 shrink-0 text-destructive" />
        </>
      ) : hasOutput ? (
        <>
          {isWokenByTask ? (
            <BellRingIcon className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
          ) : (
            <MoonIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('bgTool.sleep')}
          </span>
          {reason ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground/50">
              {reason}
            </span>
          ) : null}
          {isWokenByTask ? (
            <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
              {t('bgTool.wokenByTask')}
            </span>
          ) : sleptMs != null ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
              {formatMs(sleptMs)}
            </span>
          ) : null}
          <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground/50" />
        </>
      ) : (
        <>
          <MoonIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('bgTool.sleep')}
          </span>
          {seconds != null && (
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
              {seconds}s
            </span>
          )}
        </>
      )}
    </div>
  )
}
