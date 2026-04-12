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
import { Badge } from '@openloaf/ui/badge'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Terminal,
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

/**
 * Extract the concatenated text content from a user message's parts. We only
 * need the text payload to parse the embedded XML.
 */
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

/** Unescape the XML entities we emit server-side in escapeXml(). */
function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/**
 * Pick one inline field out of a single <bg-task-notification> block using a
 * lightweight regex. We do not pull in a full XML parser — the server emits a
 * known, well-formed shape and escapes interior payloads before serialization.
 */
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

const STATUS_META: Record<
  string,
  {
    icon: typeof CheckCircle2
    badgeClass: string
    iconClass: string
    label: string
  }
> = {
  completed: {
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border-transparent dark:text-emerald-400',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    label: 'completed',
  },
  failed: {
    icon: XCircle,
    badgeClass: 'bg-destructive/10 text-destructive border-transparent',
    iconClass: 'text-destructive',
    label: 'failed',
  },
  killed: {
    icon: XCircle,
    badgeClass: 'bg-muted text-muted-foreground border-transparent',
    iconClass: 'text-muted-foreground',
    label: 'killed',
  },
  running: {
    icon: Terminal,
    badgeClass: 'bg-secondary text-foreground border-transparent',
    iconClass: 'text-muted-foreground',
    label: 'running',
  },
}

function pickStatusMeta(status: BgTaskStatus) {
  return STATUS_META[status] ?? STATUS_META.running
}

// ─── Component ───────────────────────────────────────────────────────

export default function BgNotification({ message }: { message: MessageLike }) {
  const kind = readSyntheticKind(message.metadata)
  const text = useMemo(() => extractTextFromParts(message.parts), [message.parts])

  const notifications = useMemo(() => parseBgNotifications(text), [text])
  const isBudgetExceeded = kind === 'bg-budget-exceeded'

  if (isBudgetExceeded) {
    return <BgBudgetExceededCard content={text} />
  }

  if (notifications.length === 0) {
    // Metadata says bg-notification but we couldn't parse any — fall back to a
    // single muted hint so we still render something recognizable.
    return <BgNotificationEmptyCard />
  }

  return (
    <div className="w-full min-w-0">
      <div className="max-w-xl space-y-2 rounded-3xl border bg-card p-3 shadow-none">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Background {notifications.length === 1 ? 'task' : 'tasks'} completed
            {notifications.length > 1 ? ` (${notifications.length})` : ''}
          </span>
        </div>
        <div className="space-y-2">
          {notifications.map((n) => (
            <BgNotificationRow key={n.taskId || Math.random().toString(36)} notification={n} />
          ))}
        </div>
      </div>
    </div>
  )
}

function BgNotificationRow({ notification }: { notification: ParsedNotification }) {
  const [expanded, setExpanded] = useState(false)
  const meta = pickStatusMeta(notification.status)
  const StatusIcon = meta.icon
  const duration = formatDuration(notification.durationMs)
  const hasPreview = notification.outputPreview.trim().length > 0

  return (
    <div className="rounded-2xl border bg-background/60 p-2">
      <div className="flex items-start gap-2">
        <StatusIcon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.iconClass)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p
              className="text-xs font-medium leading-tight break-words line-clamp-2"
              title={notification.description}
            >
              {notification.description || '(no description)'}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={cn('text-[10px]', meta.badgeClass)}>
              {meta.label}
            </Badge>
            {notification.exitCode != null && (
              <Badge variant="outline" className="bg-muted text-[10px] text-muted-foreground border-transparent">
                exit {notification.exitCode}
              </Badge>
            )}
            {duration && (
              <Badge variant="outline" className="bg-muted text-[10px] text-muted-foreground border-transparent">
                {duration}
              </Badge>
            )}
            {hasPreview && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/50"
              >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                output
              </button>
            )}
          </div>
          {expanded && hasPreview && (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-muted/50 p-2 text-[10px] text-muted-foreground">
              {notification.outputPreview}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

function BgBudgetExceededCard({ content: _content }: { content: string }) {
  return (
    <div className="w-full min-w-0">
      <div className="max-w-xl space-y-1.5 rounded-3xl border bg-amber-500/5 p-3 shadow-none">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Background task absorb budget exceeded
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Remaining background tasks are still running. Ask the assistant to check them with
          Jobs or wait for your next message to resume absorbing completions.
        </p>
      </div>
    </div>
  )
}

function BgNotificationEmptyCard() {
  return (
    <div className="w-full min-w-0">
      <div className="max-w-xl rounded-3xl border bg-card p-3 shadow-none">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Background task notification</span>
        </div>
      </div>
    </div>
  )
}

export { readSyntheticKind }
