/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { cn } from '@udecode/cn'
import { Clock, Sparkles, X, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface QueueStatusBarProps {
  ticketId: string | null
  position: number
  estimatedWait: number // seconds
  status: 'queued' | 'ready' | 'expired' | 'idle'
  onCancel?: () => void
}

function formatWaitTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.ceil(seconds / 60)
  return `${mins}min`
}

export function QueueStatusBar({
  ticketId: _ticketId,
  position,
  estimatedWait,
  status,
  onCancel,
}: QueueStatusBarProps) {
  const { t } = useTranslation('common')

  if (status === 'idle') return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-3xl px-4 py-2 text-sm shadow-none transition-colors duration-150',
        status === 'queued' && 'bg-muted text-muted-foreground',
        status === 'ready' && 'bg-foreground/10 text-foreground animate-pulse',
        status === 'expired' && 'bg-destructive/10 text-destructive',
      )}
    >
      {status === 'queued' && (
        <>
          <Clock className="size-4 shrink-0" />
          <span>
            {t('queue.queued', {
              defaultValue: '排队中 · 第 {{position}} 位 · 预计 {{time}}',
              position,
              time: formatWaitTime(estimatedWait),
            })}
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="ml-auto rounded-full p-0.5 transition-colors duration-150 hover:bg-muted-foreground/20"
            >
              <X className="size-3.5" />
            </button>
          )}
        </>
      )}

      {status === 'ready' && (
        <>
          <Sparkles className="size-4 shrink-0" />
          <span>{t('queue.ready', { defaultValue: '轮到你了！' })}</span>
        </>
      )}

      {status === 'expired' && (
        <>
          <XCircle className="size-4 shrink-0" />
          <span>
            {t('queue.expired', { defaultValue: '已过期，请重新排队' })}
          </span>
        </>
      )}
    </div>
  )
}
