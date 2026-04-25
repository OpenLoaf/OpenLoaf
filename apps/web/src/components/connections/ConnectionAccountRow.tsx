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

import type { ReactNode } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@openloaf/ui/button'
import { cn } from '@/lib/utils'

export type ConnectionAccountStatus =
  | 'connected'
  | 'connecting'
  | 'expired'
  | 'disconnected'
  | 'error'

type Props = {
  status: ConnectionAccountStatus
  title: ReactNode
  subtitle?: ReactNode
  onRemove?: () => void
  removing?: boolean
  ariaLabelRemove?: string
}

const STATUS_DOT_CLASS: Record<ConnectionAccountStatus, string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-sky-500',
  expired: 'bg-amber-500',
  disconnected: 'bg-muted-foreground/40',
  error: 'bg-destructive',
}

/**
 * Shared account / connection row. Left-aligned status dot, two lines of
 * text, optional remove button on the right. Used by WeChat account list and
 * the Notion-style integration dialog so they render identically.
 */
export function ConnectionAccountRow({
  status,
  title,
  subtitle,
  onRemove,
  removing,
  ariaLabelRemove,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_CLASS[status])}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          {subtitle && (
            <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 rounded-full px-2 text-xs text-muted-foreground hover:text-destructive"
          disabled={removing}
          onClick={onRemove}
          aria-label={ariaLabelRemove}
        >
          {removing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  )
}
