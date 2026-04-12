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

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  XCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

type BgTaskStatus = 'completed' | 'failed' | 'killed' | 'running' | string

type ParsedNotification = {
  taskId: string
  taskType: string
  status: BgTaskStatus
  description: string
  exitCode: number | null
  durationMs: number | null
  outputPreview: string
}

type MessageLike = {
  id?: string
  parts?: Array<{ type?: string; text?: string } | unknown>
  metadata?: unknown
}

// ─── Helpers ──────────────────────────────────────────────────────────

function extractTextFromParts(parts: MessageLike['parts']): string {
  if (!Array.isArray(parts)) return ''
  const buf: string[] = []
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue
    const part = p as { type?: string; text?: string }
    if (part.type === 'text' && typeof part.text === 'string') {
      buf.push(part.text)
    }
  }
  return buf.join('\n')
}

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function pickField(block: string, field: string): string {
  const re = new RegExp(`<${field}>([\\s\\S]*?)</${field}>`, 'i')
  const match = block.match(re)
  return match ? unescapeXml(match[1].trim()) : ''
}

function parseIntOrNull(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  return Number.isFinite(n) ? n : null
}

function parseBgNotifications(content: string): ParsedNotification[] {
  if (!content) return []
  const blocks = content.match(/<bg-task-notification>[\s\S]*?<\/bg-task-notification>/g) ?? []
  const parsed: ParsedNotification[] = []
  for (const block of blocks) {
    parsed.push({
      taskId: pickField(block, 'task-id'),
      taskType: pickField(block, 'task-type') || 'bash',
      status: pickField(block, 'status') || 'running',
      description: pickField(block, 'description'),
      exitCode: parseIntOrNull(pickField(block, 'exit-code')),
      durationMs: parseIntOrNull(pickField(block, 'duration-ms')),
      outputPreview: pickField(block, 'output-preview'),
    })
  }
  return parsed
}

function readSyntheticKind(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const openloaf = (metadata as Record<string, unknown>).openloaf
  if (!openloaf || typeof openloaf !== 'object') return null
  const kind = (openloaf as Record<string, unknown>).syntheticKind
  return typeof kind === 'string' ? kind : null
}

function formatDuration(ms: number | null): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${mins}m${rest}s` : `${mins}m`
}

// ─── Component ───────────────────────────────────────────────────────

export default function BgNotification({ message }: { message: MessageLike }) {
  const kind = readSyntheticKind(message.metadata)
  const text = useMemo(() => extractTextFromParts(message.parts), [message.parts])
  const notifications = useMemo(() => parseBgNotifications(text), [text])

  if (kind === 'bg-budget-exceeded') {
    return (
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-600 dark:text-amber-400">
          <XCircle className="h-3 w-3" />
          后台任务通知超限
        </span>
      </div>
    )
  }

  if (notifications.length === 0) return null

  return (
    <div className="flex justify-end">
      <div className="inline-flex flex-col gap-1">
        {notifications.map((n) => (
          <BgNotificationPill key={n.taskId || Math.random().toString(36)} notification={n} />
        ))}
      </div>
    </div>
  )
}

function BgNotificationPill({ notification }: { notification: ParsedNotification }) {
  const [expanded, setExpanded] = useState(false)
  const isSuccess = notification.status === 'completed'
  const isFailed = notification.status === 'failed' || notification.status === 'killed'
  const duration = formatDuration(notification.durationMs)
  const hasPreview = notification.outputPreview.trim().length > 0

  const StatusIcon = isSuccess ? CheckCircle2 : isFailed ? XCircle : CheckCircle2

  return (
    <div className="max-w-sm">
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs transition-colors',
          isSuccess && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
          isFailed && 'bg-destructive/10 text-destructive',
          !isSuccess && !isFailed && 'bg-muted text-muted-foreground',
        )}
      >
        <StatusIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium">{notification.description || 'Task'}</span>
        {duration && (
          <span className="shrink-0 opacity-60">{duration}</span>
        )}
        {hasPreview && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
      </div>
      {expanded && hasPreview && (
        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
          {notification.outputPreview}
        </pre>
      )}
    </div>
  )
}

export { readSyntheticKind }
