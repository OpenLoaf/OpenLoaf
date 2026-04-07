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

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StackHeader } from '@/components/layout/StackHeader'
import { useLayoutState } from '@/hooks/use-layout-state'
import { trpcClient } from '@/utils/trpc'
import { MessageStreamMarkdown, MESSAGE_STREAM_MARKDOWN_CLASSNAME } from '@/components/ai/message/markdown/MessageStreamMarkdown'

/** Returns true when the user has an active text selection (i.e. drag-select). */
function hasTextSelection(): boolean {
  const sel = window.getSelection()
  return sel != null && sel.toString().length > 0
}


import { Copy, FolderOpen, RefreshCw, ChevronsDownUp, ChevronsUpDown, Bug } from 'lucide-react'
import { Button } from '@openloaf/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@openloaf/ui/dialog'
import { toast } from 'sonner'

interface AiDebugViewerProps {
  tabId?: string
  panelKey?: string
  /** Chat preface markdown content. */
  prefaceContent?: string
  /** Full prompt content (PROMPT.md). */
  promptContent?: string
  /** Session id for chat history folder. */
  sessionId?: string
  /** Absolute jsonl path. */
  jsonlPath?: string
}

/** Normalize local path separators for cross-platform folder parsing. */
function normalizeLocalPath(value: string): string {
  return value.replace(/\\/g, '/')
}

/** Convert a local filesystem path into a file:// URI. */
function toFileUri(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('file://')) return trimmed
  const normalized = normalizeLocalPath(trimmed)
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`
  }
  return `file:///${encodeURI(normalized)}`
}

/** Resolve the chat log folder path from a messages.jsonl path. */
function resolveLogFolderPath(jsonlPath?: string): string {
  const trimmedJsonlPath = jsonlPath?.trim() ?? ''
  if (!trimmedJsonlPath) return ''

  if (trimmedJsonlPath.startsWith('file://')) {
    try {
      const url = new URL(trimmedJsonlPath)
      const filePath = normalizeLocalPath(decodeURIComponent(url.pathname)).replace(
        /^\/([A-Za-z]:)/,
        '$1',
      )
      return filePath.replace(/\/[^/]*$/, '')
    } catch {
      return ''
    }
  }

  const normalizedPath = normalizeLocalPath(trimmedJsonlPath)
  return normalizedPath.replace(/\/[^/]*$/, '')
}

type StoredMessageView = {
  id: string
  parentMessageId: string | null
  role: string
  messageKind: string
  parts: unknown[]
  metadata?: Record<string, unknown>
  createdAt: string
}

const ROLE_COLORS: Record<string, { badge: string; border: string }> = {
  user: { badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300', border: 'border-l-blue-400' },
  assistant: { badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', border: 'border-l-emerald-400' },
  system: { badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', border: 'border-l-amber-400' },
  subagent: { badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300', border: 'border-l-purple-400' },
  'task-report': { badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', border: 'border-l-orange-400' },
}
const DEFAULT_ROLE_COLOR = { badge: 'bg-muted text-muted-foreground', border: 'border-l-muted-foreground' }

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Extract a short preview string from the first text-bearing part. */
function extractPreview(parts: unknown[]): string {
  for (const part of parts) {
    if (typeof part === 'string') return part
    if (part && typeof part === 'object') {
      const p = part as Record<string, unknown>
      if (p.type === 'text' && typeof p.text === 'string') return p.text
      if ((p.type === 'tool-invocation' || p.type === 'tool-call')) {
        const name = String((p as any).toolName ?? (p as any).name ?? '')
        return `Tool: ${name}`
      }
      if (p.type === 'reasoning' || p.type === 'thinking') {
        if (typeof p.text === 'string') return p.text
      }
    }
  }
  return ''
}

/** Get a compact label for a part's type. */
function getPartTypeLabel(part: unknown): string {
  if (typeof part === 'string') return 'text'
  if (part && typeof part === 'object') {
    const p = part as Record<string, unknown>
    if (typeof p.type === 'string') return p.type
  }
  return 'unknown'
}

const PART_TYPE_STYLES: Record<string, string> = {
  text: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'data-skill': 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  'data-msg-context': 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'tool-invocation': 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'tool-call': 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'tool-result': 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  reasoning: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
  thinking: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
}

/** Extract a compact 1-line summary for a part (used in left panel list). */
function getPartSummary(part: unknown): string {
  if (typeof part === 'string') return part.slice(0, 80).replace(/\n/g, ' ')
  if (part && typeof part === 'object') {
    const p = part as Record<string, unknown>
    const type = typeof p.type === 'string' ? p.type : ''
    if (type === 'text' && typeof p.text === 'string') return p.text.slice(0, 80).replace(/\n/g, ' ')
    if (type === 'tool-invocation' || type === 'tool-call') {
      const name = String((p as any).toolName ?? (p as any).name ?? '?')
      const state = p.state ? ` [${p.state}]` : ''
      // For tool-search, show the searched names
      if (/tool[-_]?search/i.test(name) && p.args && typeof p.args === 'object') {
        const names = (p.args as Record<string, unknown>).names
        if (typeof names === 'string') return `${name}${state} → ${names}`
      }
      return `${name}${state}`
    }
    if (type === 'tool-result') {
      const name = p.toolName ? String(p.toolName) : '?'
      return name
    }
    if (type === 'data-skill') {
      const data = p.data as Record<string, unknown> | undefined
      return data?.name ? String(data.name) : 'skill'
    }
    if (type === 'data-msg-context') {
      const data = p.data as Record<string, unknown> | undefined
      return data?.datetime ? String(data.datetime) : ''
    }
    if (type === 'reasoning' || type === 'thinking') {
      if (typeof p.text === 'string') return p.text.slice(0, 80).replace(/\n/g, ' ')
    }
    // Generic tool-* type: "tool-ToolSearch", "tool-WebFetch", etc.
    if (type.startsWith('tool-')) {
      const input = p.input as Record<string, unknown> | undefined
      if (input && typeof input === 'object') {
        // Pick the most meaningful input param to show
        const priorityKeys = ['url', 'query', 'names', 'path', 'command', 'selector', 'text', 'title', 'content', 'function']
        for (const pk of priorityKeys) {
          if (typeof input[pk] === 'string' && input[pk]) return String(input[pk]).slice(0, 80)
        }
        // Fallback: first string value
        for (const v of Object.values(input)) {
          if (typeof v === 'string' && v) return v.slice(0, 80)
        }
      }
      return ''
    }
  }
  return ''
}

/** Render AskUserQuestion / RequestUserInput tool with friendly UI. */
function AskUserQuestionDetail({ part }: { part: Record<string, unknown> }) {
  const input = part.input as Record<string, unknown> | undefined
  const output = part.output as Record<string, unknown> | undefined
  const approval = part.approval as Record<string, unknown> | undefined
  const isError = typeof part.state === 'string' && part.state.includes('error')

  const title = input?.title as string | undefined
  const description = input?.description as string | undefined
  const choices = input?.choices as Array<{ key: string; question: string; options: Array<{ label: string; description?: string }>; multiSelect?: boolean }> | undefined
  const questions = input?.questions as Array<{ key: string; label: string; type?: string; placeholder?: string; required?: boolean }> | undefined
  const answers = output?.answers as Record<string, unknown> | undefined

  return (
    <div className="px-3 py-2 space-y-3" style={{ userSelect: 'text', cursor: 'text' }}>
      {/* Title & description */}
      {title ? <div className="text-xs font-semibold text-foreground">{title}</div> : null}
      {description ? <div className="text-[11px] text-muted-foreground">{description}</div> : null}

      {/* Approval status */}
      {approval ? (
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-semibold ${approval.approved ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
            {approval.approved ? '✓ Approved' : '✗ Rejected'}
          </span>
        </div>
      ) : null}

      {/* Choices mode */}
      {choices?.map((choice) => {
        const answer = answers?.[choice.key]
        return (
          <div key={choice.key} className="space-y-1.5">
            <div className="text-[11px] font-medium text-foreground/80">
              {choice.question}
              {choice.multiSelect ? <span className="ml-1 text-[9px] text-muted-foreground">(多选)</span> : null}
            </div>
            <div className="flex flex-col gap-1">
              {choice.options.map((opt, oi) => {
                const isSelected = answer === opt.label || (Array.isArray(answer) && answer.includes(opt.label))
                return (
                  <div
                    key={oi}
                    className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${isSelected ? 'border-blue-500/50 bg-blue-500/10' : 'border-border/50 bg-muted/10'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {isSelected ? (
                        <span className="text-blue-600 dark:text-blue-400 text-[10px]">✓</span>
                      ) : (
                        <span className="text-muted-foreground/30 text-[10px]">○</span>
                      )}
                      <span className={`font-medium ${isSelected ? 'text-foreground' : 'text-foreground/60'}`}>{opt.label}</span>
                    </div>
                    {opt.description ? (
                      <div className="ml-5 text-[10px] text-muted-foreground">{opt.description}</div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Questions (form) mode */}
      {questions?.map((q) => {
        const answer = answers?.[q.key]
        return (
          <div key={q.key} className="space-y-1">
            <div className="text-[11px] font-medium text-foreground/80">
              {q.label}
              {q.required !== false ? <span className="text-red-500 ml-0.5">*</span> : null}
            </div>
            <div className="rounded border border-border/50 bg-muted/10 px-2.5 py-1.5 text-[11px] text-foreground/80 break-all">
              {answer != null ? String(answer) : <span className="text-muted-foreground italic">—</span>}
            </div>
          </div>
        )
      })}

      {/* Error */}
      {isError && typeof part.errorText === 'string' ? (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-2.5">
          <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-1">Error</div>
          <div className="text-[10px] text-red-700 dark:text-red-300 whitespace-pre-wrap font-mono">{part.errorText}</div>
        </div>
      ) : null}
    </div>
  )
}

/** Render the full structured detail of a selected part (right panel). */
function PartDetail({ part }: { part: unknown }) {
  const typeLabel = getPartTypeLabel(part)

  type FieldItem = { label: string; value: string; mono?: boolean } | { label: string; jsx: React.ReactNode }

  const fields: FieldItem[] = []
  let toolName = ''

  if (typeof part === 'string') {
    const safeStr = escapeAngleBrackets(part)
    return (
      <div className="px-3 py-2 overflow-y-auto ![scrollbar-width:thin] select-text" style={{ userSelect: 'text', cursor: 'text' }}>
        <MessageStreamMarkdown markdown={safeStr} className={MESSAGE_STREAM_MARKDOWN_CLASSNAME} />
      </div>
    )
  } else if (part && typeof part === 'object') {
    const p = part as Record<string, unknown>

    if (typeLabel === 'text' && typeof p.text === 'string') {
      const safeText = escapeAngleBrackets(p.text)
      return (
        <div className="px-3 py-2 overflow-y-auto ![scrollbar-width:thin] select-text" style={{ userSelect: 'text', cursor: 'text' }}>
          <MessageStreamMarkdown markdown={safeText} className={MESSAGE_STREAM_MARKDOWN_CLASSNAME} />
        </div>
      )
    } else if (typeLabel === 'data-msg-context') {
      const data = p.data as Record<string, unknown> | undefined
      const dt = data?.datetime ? String(data.datetime) : ''
      return (
        <div className="px-3 py-3 flex items-center gap-2" style={{ userSelect: 'text' }}>
          <span className="text-[11px] text-muted-foreground font-medium">datetime</span>
          <span className="text-xs text-foreground/80 tabular-nums">{dt || '—'}</span>
        </div>
      )
    } else if (typeLabel === 'data-skill') {
      const data = p.data as Record<string, unknown> | undefined
      if (data && typeof data.content === 'string') {
        const safeContent = escapeAngleBrackets(data.content)
        return (
          <div className="px-3 py-2 overflow-y-auto ![scrollbar-width:thin] select-text" style={{ userSelect: 'text', cursor: 'text' }}>
            <MessageStreamMarkdown
              markdown={safeContent}
              className={MESSAGE_STREAM_MARKDOWN_CLASSNAME}
            />
          </div>
        )
      }
    } else if (typeLabel === 'tool-invocation' || typeLabel === 'tool-call') {
      toolName = String((p as any).toolName ?? (p as any).name ?? 'unknown')
      // For tool-search, render a dedicated full-width view
      if (/tool[-_]?search/i.test(toolName) && p.result && typeof p.result === 'object') {
        return (
          <div className="px-3 py-2" style={{ userSelect: 'text' }}>
            <ToolResultView toolName={toolName} output={p.result} />
          </div>
        )
      }
      fields.push({ label: 'name', value: toolName })
      if (p.toolCallId) fields.push({ label: 'toolCallId', value: String(p.toolCallId) })
      if (p.state) fields.push({ label: 'state', value: String(p.state) })
      if (p.args) {
        const s = typeof p.args === 'string' ? p.args : JSON.stringify(p.args, null, 2)
        fields.push({ label: 'args', value: s, mono: true })
      }
      if (p.result) {
        const s = typeof p.result === 'string' ? p.result : JSON.stringify(p.result, null, 2)
        fields.push({ label: 'result', value: s, mono: true })
      }
    } else if (typeLabel === 'tool-result') {
      const tn = String(p.toolName ?? '')
      if (/tool[-_]?search/i.test(tn) && p.result && typeof p.result === 'object') {
        return (
          <div className="px-3 py-2" style={{ userSelect: 'text' }}>
            <ToolResultView toolName={tn} output={p.result} />
          </div>
        )
      }
      if (p.toolName) fields.push({ label: 'name', value: tn })
      if (p.result) {
        const s = typeof p.result === 'string' ? p.result : JSON.stringify(p.result, null, 2)
        fields.push({ label: 'result', value: s, mono: true })
      }
    } else if (typeLabel === 'reasoning' || typeLabel === 'thinking') {
      if (typeof p.text === 'string') fields.push({ label: 'content', value: p.text, mono: true })
    } else if (typeLabel === 'tool-AskUserQuestion' || typeLabel === 'tool-RequestUserInput') {
      return <AskUserQuestionDetail part={p} />
    } else if (typeLabel.startsWith('tool-')) {
      // Generic tool part: type is "tool-<ToolName>", fields are input/output/state/toolCallId
      const tn = typeLabel.slice(5) // strip "tool-" prefix
      // For tool-search, render dedicated view
      if (/tool[-_]?search/i.test(tn) && p.output && typeof p.output === 'object') {
        return (
          <div className="px-3 py-2" style={{ userSelect: 'text' }}>
            <ToolResultView toolName={tn} output={p.output} />
          </div>
        )
      }
      const isError = typeof p.state === 'string' && p.state.includes('error')
      const errorText = typeof p.errorText === 'string' ? p.errorText : ''
      // Generic tool-* parsed view: input params + error/output
      return (
        <div className="px-3 py-2 space-y-2" style={{ userSelect: 'text', cursor: 'text' }}>
          {/* Input params */}
          {p.input && typeof p.input === 'object' && Object.keys(p.input as object).length > 0 ? (
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium text-[10px]">Input</span>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 items-baseline">
                {Object.entries(p.input as Record<string, unknown>).map(([k, v]) => (
                  <Fragment key={k}>
                    <span className="text-[10px] font-mono text-foreground/60 whitespace-nowrap">{k}</span>
                    <div className="text-[10px] text-foreground/80 break-all">
                      {typeof v === 'string' ? v : JSON.stringify(v)}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          ) : null}
          {/* Error */}
          {isError && errorText ? (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">Error</div>
              <div className="text-[11px] text-red-700 dark:text-red-300 whitespace-pre-wrap leading-relaxed font-mono">{errorText}</div>
            </div>
          ) : null}
          {/* Output */}
          {p.output != null ? (
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium text-[10px]">Output</span>
              {typeof p.output === 'string' ? (
                <div className="overflow-y-auto ![scrollbar-width:thin] select-text" style={{ userSelect: 'text' }}>
                  <MessageStreamMarkdown
                    markdown={escapeAngleBrackets(p.output as string)}
                    className={MESSAGE_STREAM_MARKDOWN_CLASSNAME}
                  />
                </div>
              ) : (
                <pre className="text-[10px] font-mono text-foreground/60 whitespace-pre-wrap break-all" style={{ userSelect: 'text' }}>
                  {highlightJson(JSON.stringify(p.output, null, 2))}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      )
    } else {
      for (const [k, v] of Object.entries(p)) {
        if (k === 'type') continue
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          fields.push({ label: k, value: String(v) })
        } else if (v !== null && v !== undefined) {
          fields.push({ label: k, value: JSON.stringify(v, null, 2), mono: true })
        }
      }
    }
  }

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-baseline px-3 py-2" style={{ userSelect: 'text', cursor: 'text' }}>
      {fields.map((f, i) => (
        <Fragment key={i}>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap font-medium">{f.label}</span>
          {'jsx' in f ? (
            <div>{f.jsx}</div>
          ) : (
            <div className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${f.mono ? 'font-mono' : ''} text-foreground/80`} style={{ userSelect: 'text' }}>
              {f.value}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

/** Lightweight JSON syntax highlighter — returns JSX spans with color classes. */
function highlightJson(json: string): React.ReactNode[] {
  // Regex tokenizer for JSON values
  const tokenRe =
    /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(true|false)|(null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const sel = { userSelect: 'text' as const }

  while ((match = tokenRe.exec(json)) !== null) {
    // Text before this match (punctuation, whitespace)
    if (match.index > lastIndex) {
      nodes.push(json.slice(lastIndex, match.index))
    }
    if (match[1] !== undefined) {
      // Key
      nodes.push(
        <span key={match.index} className="text-[#0451a5] dark:text-[#9cdcfe]" style={sel}>
          {match[1]}
        </span>,
      )
      // The colon after the key
      nodes.push(':')
    } else if (match[2] !== undefined) {
      // String value
      nodes.push(
        <span key={match.index} className="text-[#a31515] dark:text-[#ce9178]" style={sel}>
          {match[2]}
        </span>,
      )
    } else if (match[3] !== undefined) {
      // Boolean
      nodes.push(
        <span key={match.index} className="text-[#0000ff] dark:text-[#569cd6]" style={sel}>
          {match[3]}
        </span>,
      )
    } else if (match[4] !== undefined) {
      // null
      nodes.push(
        <span key={match.index} className="text-[#0000ff] dark:text-[#569cd6]" style={sel}>
          {match[4]}
        </span>,
      )
    } else if (match[5] !== undefined) {
      // Number
      nodes.push(
        <span key={match.index} className="text-[#098658] dark:text-[#b5cea8]" style={sel}>
          {match[5]}
        </span>,
      )
    }
    lastIndex = match.index + match[0].length
  }
  // Trailing text
  if (lastIndex < json.length) {
    nodes.push(json.slice(lastIndex))
  }
  return nodes
}

function CopyButton({ text, className: cls }: { text: string; className?: string }) {
  const { t } = useTranslation('ai')
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard.writeText(text).then(() => {
        toast.success(t('debug.copiedJson'))
      })
    },
    [text, t],
  )
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-6 w-6 shrink-0 ${cls ?? ''}`}
      onClick={handleCopy}
      aria-label="Copy JSON"
    >
      <Copy className="h-3 w-3" />
    </Button>
  )
}

/** Format ms duration to human readable. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

/** Render known metadata fields with semantic display. */
function MetadataSection({ metadata }: { metadata: Record<string, unknown> }) {
  const { t } = useTranslation('ai')
  const totalUsage = metadata.totalUsage as Record<string, number> | undefined
  const openloaf = metadata.openloaf as Record<string, unknown> | undefined
  const agent = metadata.agent as Record<string, unknown> | undefined
  const webSearch = metadata.webSearch as Record<string, unknown> | undefined
  const reasoning = metadata.reasoning as Record<string, unknown> | undefined

  // Collect keys handled by structured rendering
  const handledKeys = new Set(['totalUsage', 'openloaf', 'agent', 'webSearch', 'reasoning'])
  const remainingEntries = Object.entries(metadata).filter(([k]) => !handledKeys.has(k))

  // Build flat rows: [label, value] for a clean grid
  const rows: { label: string; value: string }[] = []

  if (totalUsage) {
    const parts: string[] = []
    if (totalUsage.inputTokens != null) parts.push(`${t('debug.meta.in')}: ${totalUsage.inputTokens.toLocaleString()}`)
    if (totalUsage.outputTokens != null) parts.push(`${t('debug.meta.out')}: ${totalUsage.outputTokens.toLocaleString()}`)
    if (totalUsage.reasoningTokens != null && totalUsage.reasoningTokens > 0)
      parts.push(`${t('debug.meta.reasoning')}: ${totalUsage.reasoningTokens.toLocaleString()}`)
    if (totalUsage.cachedInputTokens != null && totalUsage.cachedInputTokens > 0)
      parts.push(`${t('debug.meta.cached')}: ${totalUsage.cachedInputTokens.toLocaleString()}`)
    if (parts.length > 0) rows.push({ label: t('debug.meta.tokens'), value: parts.join('  ·  ') })
  }

  if (openloaf) {
    const parts: string[] = []
    if (typeof openloaf.assistantElapsedMs === 'number')
      parts.push(`${t('debug.meta.elapsed')}: ${formatDuration(openloaf.assistantElapsedMs)}`)
    if (typeof openloaf.creditsConsumed === 'number')
      parts.push(`${t('debug.meta.credits')}: ${openloaf.creditsConsumed}`)
    if (typeof openloaf.assistantStartedAt === 'string')
      parts.push(`${t('debug.meta.started')}: ${formatTimestamp(openloaf.assistantStartedAt)}`)
    if (typeof openloaf.assistantFinishedAt === 'string')
      parts.push(`${t('debug.meta.finished')}: ${formatTimestamp(openloaf.assistantFinishedAt)}`)
    if (parts.length > 0) rows.push({ label: 'OpenLoaf', value: parts.join('  ·  ') })
  }

  if (agent) {
    const parts: string[] = []
    if (typeof agent.name === 'string') {
      let s = agent.name
      if (typeof agent.kind === 'string') s += ` (${agent.kind})`
      parts.push(s)
    }
    if (typeof agent.model === 'object' && agent.model !== null) {
      const m = agent.model as Record<string, unknown>
      const modelName = String(m.name ?? m.chatModelId ?? '')
      if (modelName) parts.push(`${t('debug.meta.model')}: ${modelName}`)
    }
    if (parts.length > 0) rows.push({ label: t('debug.meta.agent'), value: parts.join('  ·  ') })
  }

  if (webSearch) rows.push({ label: t('debug.meta.webSearch'), value: webSearch.enabled ? t('debug.meta.enabled') : t('debug.meta.disabled') })
  if (reasoning) rows.push({ label: t('debug.meta.reasoningMode'), value: String(reasoning.mode ?? 'default') })

  for (const [k, v] of remainingEntries) {
    rows.push({ label: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) })
  }

  if (rows.length === 0) return null

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[11px]">
      {rows.map((r) => (
        <span key={r.label} className="inline-flex items-baseline gap-1.5">
          <span className="text-muted-foreground font-medium whitespace-nowrap">{r.label}</span>
          <span className="text-foreground/80 tabular-nums break-words">{r.value}</span>
        </span>
      ))}
    </div>
  )
}

type DebugStep = {
  stepNumber: number
  attemptTag: string
  request: unknown
  response: unknown
}

/** Structured display of a debug step request. */
function DebugRequestView({ data }: { data: Record<string, unknown> }) {
  const model = data.model as Record<string, unknown> | undefined
  const messages = data.messages as unknown[] | undefined
  const tools = data.activeTools as unknown[] | undefined
  const system = data.system as string | undefined
  const toolChoice = data.toolChoice as Record<string, unknown> | undefined

  return (
    <div className="space-y-1.5 py-2 px-3 text-[11px]" style={{ userSelect: 'text' }}>
      {/* Model & config row */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
        {model && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground font-medium">Model</span>
            <span className="font-mono text-foreground/80">{String(model.provider ?? '')}/{String(model.modelId ?? '')}</span>
          </span>
        )}
        {messages && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground font-medium">Messages</span>
            <span className="tabular-nums text-foreground/80">{messages.length}</span>
          </span>
        )}
        {tools && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground font-medium">Tools</span>
            <span className="tabular-nums text-foreground/80">{tools.length}</span>
          </span>
        )}
        {toolChoice && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground font-medium">ToolChoice</span>
            <span className="text-foreground/80">{String(toolChoice.type ?? 'auto')}</span>
          </span>
        )}
      </div>

      {/* Tools list */}
      {tools && tools.length > 0 && (
        <div>
          <span className="text-muted-foreground font-medium text-[10px]">Tools: </span>
          <span className="text-[10px] text-foreground/60 font-mono">
            {tools.map((t) => (typeof t === 'string' ? t : typeof t === 'object' && t ? String((t as any).name ?? (t as any).id ?? '?') : '?')).join(', ')}
          </span>
        </div>
      )}

      {/* System prompt preview */}
      {system && (
        <div>
          <span className="text-muted-foreground font-medium text-[10px]">System: </span>
          <span className="text-[10px] text-foreground/50">{system.slice(0, 120).replace(/\n/g, ' ')}…</span>
        </div>
      )}

      {/* Messages preview */}
      {messages && messages.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-muted-foreground font-medium text-[10px]">Messages:</span>
          {messages.map((m, i) => {
            const msg = m as Record<string, unknown>
            const role = String(msg.role ?? '?')
            const content = msg.content
            let preview = ''
            const badges: { label: string; cls: string }[] = []
            if (typeof content === 'string') {
              preview = content.slice(0, 100).replace(/\n/g, ' ')
            } else if (Array.isArray(content)) {
              const parts: string[] = []
              for (const c of content as Array<Record<string, unknown>>) {
                const ct = typeof c.type === 'string' ? c.type : ''
                if (ct === 'text' && typeof c.text === 'string') {
                  parts.push(c.text.slice(0, 80).replace(/\n/g, ' '))
                } else if (ct === 'tool-call') {
                  badges.push({ label: String(c.toolName ?? '?'), cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' })
                } else if (ct === 'tool-result') {
                  const res = typeof c.result === 'string' ? c.result : typeof c.content === 'string' ? c.content : ''
                  if (res) parts.push(res.slice(0, 60).replace(/\n/g, ' '))
                  badges.push({ label: String(c.toolName ?? 'result'), cls: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' })
                }
              }
              preview = parts.join(' ')
            }
            return (
              <div key={i} className="flex items-baseline gap-1.5 text-[10px] min-w-0">
                <span className="tabular-nums text-muted-foreground/40 w-3 text-right shrink-0">{i}</span>
                <span className={`font-semibold shrink-0 ${role === 'user' ? 'text-blue-600 dark:text-blue-400' : role === 'assistant' ? 'text-emerald-600 dark:text-emerald-400' : role === 'tool' ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'}`}>
                  {role}
                </span>
                {badges.map((b, bi) => (
                  <span key={bi} className={`rounded px-1 py-px text-[8px] font-mono font-semibold shrink-0 ${b.cls}`}>{b.label}</span>
                ))}
                <span className="text-foreground/50 truncate min-w-0">{preview || '…'}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Structured display of a single tool result. */
function ToolResultView({ toolName, output }: { toolName: string; output: unknown }) {
  const isToolSearch = /tool[-_]?search/i.test(toolName)

  // tool-search structured output
  if (isToolSearch && output && typeof output === 'object' && !Array.isArray(output)) {
    const o = output as Record<string, unknown>
    const tools = o.tools as Array<Record<string, unknown>> | undefined
    const skills = o.skills as Array<Record<string, unknown>> | undefined
    const notFound = o.notFound as string[] | undefined

    return (
      <div className="text-[11px] space-y-2" style={{ userSelect: 'text' }}>
        {/* Loaded tools */}
        {tools && tools.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-muted-foreground font-medium text-[10px]">Tools ({tools.length})</span>
            {tools.map((tool, j) => {
              const tid = String(tool.id ?? tool.name ?? '?')
              const tname = tool.name ? String(tool.name) : ''
              const tdesc = tool.description ? String(tool.description) : ''
              const params = tool.parameters as Record<string, unknown> | undefined
              const props = params?.properties as Record<string, Record<string, unknown>> | undefined
              const paramNames = props ? Object.keys(props) : []
              return (
                <div key={j} className="rounded border bg-violet-500/5 p-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-violet-600 dark:text-violet-400 font-mono font-semibold text-[11px]">{tid}</span>
                    {tname && tname !== tid && (
                      <span className="text-foreground/60 text-[10px]">{tname}</span>
                    )}
                  </div>
                  {tdesc && (
                    <div className="text-[10px] text-foreground/50 leading-relaxed">{tdesc}</div>
                  )}
                  {paramNames.length > 0 && (
                    <div className="space-y-0.5 pt-0.5">
                      {paramNames.map((pn) => {
                        const pdesc = props?.[pn]?.description ? String(props[pn].description) : ''
                        return (
                          <div key={pn} className="flex items-baseline gap-1.5 text-[9px]">
                            <span className="font-mono text-foreground/70 shrink-0">{pn}</span>
                            {pdesc && <span className="text-muted-foreground truncate">{pdesc}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Loaded skills */}
        {skills && skills.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-muted-foreground font-medium text-[10px]">Skills ({skills.length})</span>
            {skills.map((skill, j) => {
              const sname = String(skill.name ?? '?')
              const sscope = skill.scope ? String(skill.scope) : ''
              const scontent = skill.content ? String(skill.content).slice(0, 120).replace(/\n/g, ' ') : ''
              const stools = Array.isArray(skill.tools) ? (skill.tools as string[]) : []
              return (
                <div key={j} className="rounded border bg-indigo-500/5 p-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono font-semibold text-[11px]">{sname}</span>
                    {sscope && <span className="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground">{sscope}</span>}
                  </div>
                  {scontent && <div className="text-[10px] text-foreground/50">{scontent}</div>}
                  {stools.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {stools.map((st) => (
                        <span key={st} className="rounded bg-violet-500/10 px-1.5 py-px text-[9px] font-mono text-violet-600 dark:text-violet-400">{st}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Not found */}
        {notFound && notFound.length > 0 && (
          <div>
            <span className="text-red-500 font-medium text-[10px]">Not Found: </span>
            <span className="text-red-400 font-mono text-[10px]">{notFound.join(', ')}</span>
          </div>
        )}
      </div>
    )
  }

  // Truncated output (file reference)
  if (typeof output === 'string' && output.includes('<truncated-output')) {
    const pathMatch = output.match(/path="([^"]+)"/)
    const lenMatch = output.match(/original-length="(\d+)"/)
    const previewEnd = output.indexOf('\n</truncated-output>')
    const preview = previewEnd > 0
      ? output.slice(output.indexOf('>') + 1, previewEnd).trim().slice(0, 150)
      : ''
    return (
      <div className="text-[10px] rounded border bg-amber-500/5 p-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-teal-600 dark:text-teal-400 font-semibold font-mono">{toolName}</span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">truncated</span>
          {lenMatch && <span className="text-muted-foreground/60 tabular-nums">{(Number(lenMatch[1]) / 1024).toFixed(1)}KB</span>}
        </div>
        {pathMatch && <div className="text-foreground/40 font-mono truncate mt-0.5">{pathMatch[1]}</div>}
        {preview && <div className="text-foreground/50 mt-0.5 truncate">{preview}</div>}
      </div>
    )
  }

  // Default: plain text truncation
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output)
  return (
    <div className="text-[10px]">
      <span className="text-teal-600 dark:text-teal-400 font-semibold font-mono">{toolName}</span>
      <span className="text-foreground/50 font-mono ml-1.5 break-all">{outputStr.length > 200 ? outputStr.slice(0, 200) + '…' : outputStr}</span>
    </div>
  )
}

/** Structured display of a debug step response. */
function DebugResponseView({ data }: { data: Record<string, unknown> }) {
  const finishReason = data.finishReason as string | undefined
  const text = data.text as string | undefined
  const toolCalls = data.toolCalls as unknown[] | undefined
  const toolResults = data.toolResults as unknown[] | undefined
  const usage = data.usage as Record<string, unknown> | undefined

  return (
    <div className="space-y-1.5 py-2 px-3 text-[11px]" style={{ userSelect: 'text' }}>
      {/* Status row */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
        {finishReason && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground font-medium">Finish</span>
            <span className={`font-mono font-semibold ${finishReason === 'stop' ? 'text-emerald-600 dark:text-emerald-400' : finishReason === 'tool-calls' ? 'text-violet-600 dark:text-violet-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {finishReason}
            </span>
          </span>
        )}
        {toolCalls && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground font-medium">ToolCalls</span>
            <span className="tabular-nums text-foreground/80">{toolCalls.length}</span>
          </span>
        )}
        {usage && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground font-medium">Usage</span>
            <span className="text-foreground/60 font-mono text-[10px]">{JSON.stringify(usage)}</span>
          </span>
        )}
      </div>

      {/* Text response */}
      {text && text.trim() && (
        <div>
          <span className="text-muted-foreground font-medium text-[10px]">Text: </span>
          <span className="text-[10px] text-foreground/70 whitespace-pre-wrap">{text.length > 300 ? text.slice(0, 300) + '…' : text}</span>
        </div>
      )}

      {/* Tool calls */}
      {toolCalls && toolCalls.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-muted-foreground font-medium text-[10px]">Tool Calls:</span>
          {toolCalls.map((tc, i) => {
            const call = tc as Record<string, unknown>
            const name = String(call.toolName ?? call.name ?? '?')
            const input = call.input as Record<string, unknown> | undefined
            return (
              <div key={i} className="flex items-baseline gap-1.5 text-[10px]">
                <span className="text-violet-600 dark:text-violet-400 font-semibold font-mono shrink-0">{name}</span>
                {input && (
                  <span className="text-foreground/50 font-mono truncate">{JSON.stringify(input)}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tool results */}
      {toolResults && toolResults.length > 0 && (
        <div className="space-y-1">
          <span className="text-muted-foreground font-medium text-[10px]">Tool Results:</span>
          {toolResults.map((tr, i) => {
            const result = tr as Record<string, unknown>
            const name = String(result.toolName ?? '?')
            const output = result.output
            return (
              <ToolResultView key={i} toolName={name} output={output} />
            )
          })}
        </div>
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-Agent Viewer — dialog content for Agent tool calls
// ---------------------------------------------------------------------------

function SubAgentViewer({ parentSessionId, agentId }: { parentSessionId: string; agentId: string }) {
  const { t } = useTranslation('ai')
  const [messages, setMessages] = useState<StoredMessageView[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [promptContent, setPromptContent] = useState<string | undefined>()
  const [prefaceContent, setPrefaceContent] = useState<string | undefined>()
  const [agentMeta, setAgentMeta] = useState<{ name?: string; task?: string; agentType?: string } | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    // Load agent metadata from session.json via getSubAgentHistory
    trpcClient.chat.getSubAgentHistory.query({ sessionId: parentSessionId, toolCallId: agentId })
      .then((res: any) => {
        if (cancelled) return
        if (res.agentMeta) setAgentMeta(res.agentMeta)
      })
      .catch(() => {})

    // Load messages
    trpcClient.chat.getSessionMessages.query({ sessionId: agentId, parentSessionId, isAgentSession: true })
      .then((res: any) => {
        if (cancelled) return
        setMessages(res.messages)
      })
      .catch(() => { if (!cancelled) setMessages([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    // Load PROMPT.md / PREFACE.md
    trpcClient.chat.getSessionPreface.query({ sessionId: agentId, parentSessionId, isAgentSession: true })
      .then((res: any) => {
        if (cancelled) return
        if (res.promptContent) setPromptContent(res.promptContent)
        if (res.content) setPrefaceContent(res.content)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [parentSessionId, agentId])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="bg-purple-500/5">
      {/* Agent metadata header */}
      {agentMeta && (
        <div className="px-3 py-2 border-b border-purple-500/20 flex items-center gap-2 flex-wrap">
          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300">
            {agentMeta.agentType ?? 'agent'}
          </span>
          {agentMeta.name && (
            <span className="text-[11px] font-medium text-foreground/80">{agentMeta.name}</span>
          )}
          {agentMeta.task && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[400px]" title={agentMeta.task}>
              {agentMeta.task.slice(0, 100)}{agentMeta.task.length > 100 ? '...' : ''}
            </span>
          )}
        </div>
      )}
      {/* PROMPT.md / PREFACE.md */}
      {promptContent?.trim() && (
        <StaticRow
          label={t('debug.systemPrompt')}
          content={promptContent!}
          badgeClass="bg-red-500/15 text-red-700 dark:text-red-300"
          borderClass="border-l-red-400"
        />
      )}
      {prefaceContent?.trim() && (
        <StaticRow
          label={t('debug.chatPreface')}
          content={prefaceContent!}
          badgeClass="bg-amber-500/15 text-amber-700 dark:text-amber-300"
          borderClass="border-l-amber-400"
        />
      )}
      {/* Messages */}
      {loading ? (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">{t('debug.loadingMessages')}</p>
      ) : !messages || messages.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">{t('debug.noMessages')}</p>
      ) : (
        <div>
          {(() => {
            const idToIndex = new Map(messages.map((m, i) => [m.id, i]))
            return messages.map((msg, idx) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                idx={idx}
                expanded={expandedIds.has(msg.id)}
                onToggle={() => toggleExpand(msg.id)}
                idToIndex={idToIndex}
                sessionId={agentId}
                parentSessionId={parentSessionId}
                isAgentSession
              />
            ))
          })()}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-Agent Index — top-level panel listing all sub-agents
// ---------------------------------------------------------------------------

type SubAgentInfo = {
  agentId: string
  name?: string
  task?: string
  agentType?: string
  messageCount: number
  hasDebug: boolean
}

function SubAgentIndex({ sessionId }: { sessionId: string }) {
  const [agents, setAgents] = useState<SubAgentInfo[] | null>(null)
  const [open, setOpen] = useState(false)
  const [dialogAgent, setDialogAgent] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  const handleToggle = useCallback(() => {
    setOpen((v) => !v)
    if (!fetchedRef.current) {
      fetchedRef.current = true
      trpcClient.chat.listSubAgents.query({ sessionId })
        .then((res: any) => setAgents(res.agents))
        .catch(() => setAgents([]))
    }
  }, [sessionId])

  if (agents !== null && agents.length === 0 && !open) return null

  return (
    <div className="border-b border-purple-500/30">
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-purple-500/5 transition-colors"
        onClick={handleToggle}
      >
        <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
          {open ? '▾' : '▸'} Sub-Agents
          {agents ? ` (${agents.length})` : ''}
        </span>
      </div>
      {open && agents && agents.length > 0 && (
        <div className="px-1 pb-1">
          {agents.map((a) => (
            <div
              key={a.agentId}
              className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-[11px] hover:bg-purple-500/10"
              onClick={() => setDialogAgent(a.agentId)}
            >
              <span className="inline-flex rounded-full px-1.5 py-px text-[9px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300 shrink-0">
                {a.agentType ?? 'agent'}
              </span>
              <span className="font-mono text-muted-foreground/60 shrink-0 text-[10px]">{a.agentId.slice(0, 16)}</span>
              {a.name && <span className="text-foreground/70 shrink-0">{a.name}</span>}
              <span className="text-muted-foreground truncate min-w-0 flex-1">
                {a.task?.slice(0, 80)}{(a.task?.length ?? 0) > 80 ? '...' : ''}
              </span>
              <span className="text-muted-foreground/50 shrink-0 tabular-nums">{a.messageCount} msgs</span>
              {a.hasDebug && <span className="text-amber-600 dark:text-amber-400 shrink-0">debug</span>}
            </div>
          ))}
        </div>
      )}
      {open && agents && agents.length === 0 && (
        <p className="px-3 py-1.5 text-[10px] text-muted-foreground">No sub-agents found</p>
      )}
      {open && !agents && (
        <p className="px-3 py-1.5 text-[10px] text-muted-foreground">Loading...</p>
      )}
      {/* Sub-agent dialog */}
      <Dialog open={!!dialogAgent} onOpenChange={(v) => { if (!v) setDialogAgent(null) }}>
        <DialogContent className="max-w-[70vw] w-[70vw] max-h-[60vh] h-[60vh] p-0 gap-0 overflow-hidden flex flex-col rounded-xl sm:max-w-[70vw]" showCloseButton>
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-sm font-medium flex items-center gap-2">
              <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300">sub-agent</span>
              <span className="font-mono text-muted-foreground text-xs">{dialogAgent}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto ![scrollbar-width:thin]">
            {dialogAgent && <SubAgentViewer parentSessionId={sessionId} agentId={dialogAgent} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DebugStepsSection({ sessionId, messageId, parentSessionId, isAgentSession }: { sessionId: string; messageId: string; parentSessionId?: string; isAgentSession?: boolean }) {
  const { t } = useTranslation('ai')
  const [steps, setSteps] = useState<DebugStep[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedStep, setSelectedStep] = useState(0)
  const [stepTab, setStepTab] = useState<'request' | 'response' | 'req-json' | 'res-json'>('request')
  const fetchedRef = useRef(false)

  const handleOpen = useCallback(() => {
    setOpen((v) => !v)
    if (!fetchedRef.current) {
      fetchedRef.current = true
      setLoading(true)
      trpcClient.chat.getMessageDebugSteps.query({ sessionId, messageId, ...(isAgentSession ? { parentSessionId, isAgentSession: true } : {}) })
        .then((res) => setSteps(res.steps as DebugStep[]))
        .catch(() => setSteps([]))
        .finally(() => setLoading(false))
    }
  }, [sessionId, messageId])

  const activeStep = steps?.[selectedStep] ?? null
  const activeReq = activeStep?.request as Record<string, unknown> | null
  const activeRes = activeStep?.response as Record<string, unknown> | null

  return (
    <div className="border-t">
      <div
        className="flex items-center gap-2 px-4 py-1.5 cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
        onClick={handleOpen}
      >
        <Bug className="h-3 w-3 text-amber-600 dark:text-amber-400" />
        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
          API Debug
          {steps != null && steps.length > 0 && (
            <span className="ml-1 text-amber-600/60 dark:text-amber-400/60">({steps.length} steps)</span>
          )}
        </span>
        <span className="text-[11px] text-amber-600/40 dark:text-amber-400/40 ml-auto">
          {open ? '▾' : '▸'}
        </span>
      </div>
      {open && (
        <div>
          {loading && <span className="text-[11px] text-muted-foreground px-4 py-2 block">{t('debug.loadingMessages')}</span>}
          {steps != null && steps.length === 0 && (
            <span className="text-[11px] text-muted-foreground italic px-4 py-2 block">{t('debug.noDebugSteps')}</span>
          )}
          {steps != null && steps.length > 0 && (
            <div className="flex divide-x divide-border/50" style={{ minHeight: '40vh', maxHeight: '80vh' }}>
              {/* Left: step list */}
              <div className="w-2/5 overflow-y-auto ![scrollbar-width:thin] shrink-0">
                {steps.map((step, i) => {
                  const res = step.response as Record<string, unknown> | null
                  const finish = typeof res?.finishReason === 'string' ? res.finishReason : ''
                  const isActive = i === selectedStep
                  const prevTag = i > 0 ? steps[i - 1]?.attemptTag : undefined
                  const isNewAttempt = i > 0 && step.attemptTag !== prevTag
                  const tag = step.attemptTag
                  const timeStr = tag.length >= 6 ? `${tag.slice(0, 2)}:${tag.slice(2, 4)}:${tag.slice(4, 6)}` : tag

                  // Extract tool names from response for display
                  const toolCalls = res?.toolCalls as Array<Record<string, unknown>> | undefined
                  const toolNames = toolCalls?.map((tc) => String(tc.toolName ?? tc.name ?? '?')) ?? []
                  // Extract text snippet from response
                  const resText = typeof res?.text === 'string' ? res.text : ''
                  const textSnippet = resText.replace(/\n/g, ' ').trim().slice(0, 60)
                  // Summary line: show tool names or text snippet
                  const summary = toolNames.length > 0
                    ? toolNames.join(', ')
                    : textSnippet || ''

                  return (
                    <div key={step.stepNumber}>
                      {isNewAttempt && (
                        <div className="flex items-center gap-2 px-3 py-1 border-b border-dashed border-amber-400/40 bg-amber-500/5">
                          <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">{timeStr}</span>
                          <span className="flex-1 border-t border-dashed border-amber-400/30" />
                        </div>
                      )}
                      {i === 0 && (
                        <div className="flex items-center gap-2 px-3 py-1 border-b border-dashed border-blue-400/40 bg-blue-500/5">
                          <span className="text-[9px] text-blue-600 dark:text-blue-400 font-medium">{timeStr}</span>
                          <span className="flex-1 border-t border-dashed border-blue-400/30" />
                        </div>
                      )}
                      <div
                        className={`flex flex-col gap-0.5 px-3 py-1.5 cursor-pointer border-b transition-colors ${isActive ? 'bg-accent/50' : 'hover:bg-muted/30'}`}
                        onClick={() => { setSelectedStep(i); setStepTab('request') }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground/40 w-4 text-right shrink-0 tabular-nums">
                            {step.stepNumber}
                          </span>
                          <span className="text-[10px] text-foreground/70 font-mono truncate min-w-0 flex-1 font-medium">
                            {summary}
                          </span>
                          {finish && (
                            <span className={`rounded px-1 py-px text-[9px] font-mono font-semibold shrink-0 ${finish === 'stop' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : finish === 'tool-calls' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                              {finish}
                            </span>
                          )}
                        </div>
                        {textSnippet && toolNames.length > 0 ? (
                          <div className="ml-5 text-[9px] text-muted-foreground truncate">{textSnippet}</div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Right: detail with tabs */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {activeStep != null && (
                  <div className="flex items-center border-b shrink-0 bg-muted/10">
                    <button
                      type="button"
                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${stepTab === 'request' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setStepTab('request')}
                    >
                      Request
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${stepTab === 'response' ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setStepTab('response')}
                    >
                      Response
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${stepTab === 'req-json' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setStepTab('req-json')}
                    >
                      Req JSON
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${stepTab === 'res-json' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setStepTab('res-json')}
                    >
                      Res JSON
                    </button>
                    <div className="ml-auto pr-1">
                      <CopyButton
                        text={JSON.stringify(stepTab === 'request' || stepTab === 'req-json' ? activeReq : activeRes, null, 2)}
                        className="h-5 w-5"
                      />
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto ![scrollbar-width:thin]">
                  {activeStep == null ? (
                    <span className="text-xs text-muted-foreground italic px-3 py-2 block">No step selected</span>
                  ) : stepTab === 'request' ? (
                    activeReq ? <DebugRequestView data={activeReq} /> : <span className="text-xs text-muted-foreground italic px-3 py-2 block">No request data</span>
                  ) : stepTab === 'response' ? (
                    activeRes ? <DebugResponseView data={activeRes} /> : <span className="text-xs text-muted-foreground italic px-3 py-2 block">No response data</span>
                  ) : stepTab === 'req-json' ? (
                    <pre className="px-3 py-2 text-[11px] leading-[1.7] whitespace-pre-wrap break-all font-mono text-foreground/50" style={{ userSelect: 'text', cursor: 'text' }}>
                      {highlightJson(JSON.stringify(activeReq, null, 2))}
                    </pre>
                  ) : (
                    <pre className="px-3 py-2 text-[11px] leading-[1.7] whitespace-pre-wrap break-all font-mono text-foreground/50" style={{ userSelect: 'text', cursor: 'text' }}>
                      {highlightJson(JSON.stringify(activeRes, null, 2))}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MessageRow({ msg, idx, expanded, onToggle, idToIndex, sessionId, parentSessionId, isAgentSession }: { msg: StoredMessageView; idx: number; expanded: boolean; onToggle: () => void; idToIndex: Map<string, number>; sessionId: string; parentSessionId?: string; isAgentSession?: boolean }) {
  const { t } = useTranslation('ai')
  const colors = ROLE_COLORS[msg.role] ?? DEFAULT_ROLE_COLOR
  const usage = msg.metadata?.totalUsage as Record<string, number> | undefined
  const preview = extractPreview(msg.parts)
  const [selectedPart, setSelectedPart] = useState(0)
  const [detailTab, setDetailTab] = useState<'parsed' | 'json'>('parsed')
  const [subAgentDialog, setSubAgentDialog] = useState<string | null>(null)

  const activePart = msg.parts[selectedPart] ?? null
  const activePartJson = activePart != null ? JSON.stringify(activePart, null, 2) : ''

  return (
    <div className={`group/row border-b border-l-4 ${colors.border} ${expanded ? 'bg-muted/20' : ''}`}>
      {/* Header bar — always visible */}
      <div
        className="flex items-center gap-2 px-1.5 py-2 cursor-pointer hover:bg-muted/40 transition-colors select-text"
        onClick={() => { if (!hasTextSelection()) onToggle() }}
      >
        <span className="text-[11px] text-muted-foreground/50 w-3 text-right shrink-0 tabular-nums">
          {idx + 1}
        </span>
        <span className={`inline-flex w-[72px] justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 ${colors.badge}`}>
          {t(`debug.role.${msg.role}`, msg.role)}
        </span>
        {msg.messageKind !== 'normal' && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
            {msg.messageKind}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground font-mono shrink-0 truncate max-w-[120px]" title={msg.id}>
          {msg.id}
        </span>
        {msg.parentMessageId && (() => {
          const parentIdx = idToIndex.get(msg.parentMessageId)
          const parentNo = parentIdx != null ? parentIdx + 1 : '?'
          const isBranch = parentIdx != null && parentIdx !== idx - 1
          return (
            <span
              className={`text-[10px] font-mono shrink-0 ${isBranch ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground/80'}`}
              title={msg.parentMessageId}
            >
              ← #{parentNo}
            </span>
          )
        })()}
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/60">
          {preview.slice(0, 120)}
        </span>
        {usage && (
          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {usage.inputTokens != null ? `${usage.inputTokens}` : ''}
            {usage.outputTokens != null ? ` / ${usage.outputTokens}` : ''}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground/60 shrink-0 tabular-nums">
          {formatTimestamp(msg.createdAt)}
        </span>
        <span className="text-[11px] text-muted-foreground/40 shrink-0">
          {expanded ? '▾' : '▸'}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="ml-8 bg-muted/20 rounded-bl-md" onClick={(e) => e.stopPropagation()}>
          {/* Metadata */}
          {msg.metadata && Object.keys(msg.metadata).length > 0 && (
            <div className="py-1.5 px-4 border-b border-border/50 flex justify-end" style={{ userSelect: 'text', cursor: 'text' }}>
              <MetadataSection metadata={msg.metadata} />
            </div>
          )}
          {/* Two-column: part list | detail with tabs */}
          <div className="flex divide-x divide-border/50" style={{ minHeight: '40vh', maxHeight: '80vh' }}>
            {/* Left: compact part list */}
            <div className="w-2/5 overflow-y-auto ![scrollbar-width:thin] shrink-0">
              {msg.parts.length === 0 ? (
                <span className="text-xs text-muted-foreground italic px-3 py-2 block">Empty parts</span>
              ) : (
                msg.parts.map((part, i) => {
                  const typeLabel = getPartTypeLabel(part)
                  const typeStyle = PART_TYPE_STYLES[typeLabel] ?? (typeLabel.startsWith('tool-') ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-muted text-muted-foreground')
                  const summary = getPartSummary(part)
                  const isActive = i === selectedPart
                  // Extract scope for data-skill parts and translate
                  const rawScope = typeLabel === 'data-skill' && part && typeof part === 'object'
                    ? String((((part as Record<string, unknown>).data) as Record<string, unknown> | undefined)?.scope ?? '')
                    : ''
                  const skillScope = rawScope ? t(`debug.scope.${rawScope}`, rawScope) : ''
                  // Detect error state for tool-* parts
                  const isErrorPart = part && typeof part === 'object'
                    && typeof (part as Record<string, unknown>).state === 'string'
                    && String((part as Record<string, unknown>).state).includes('error')
                  // Detect Agent tool for sub-agent drill-down button on the row
                  const isAgentToolPart = typeLabel === 'tool-Agent'
                  const partObj = (part && typeof part === 'object') ? part as Record<string, unknown> : null
                  const rawToolCallId = isAgentToolPart && partObj ? String(partObj.toolCallId ?? '') : ''
                  const agentIdFromPart = isAgentToolPart && partObj
                    ? (rawToolCallId.startsWith('agent_') ? rawToolCallId : '')
                      || (typeof partObj.output === 'string' ? (partObj.output.match(/<task-id>(agent_[^<]+)<\/task-id>/)?.[1] ?? '') : '')
                    : ''
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer border-b transition-colors ${isErrorPart ? (isActive ? 'bg-red-500/20' : 'bg-red-500/10 hover:bg-red-500/15') : (isActive ? 'bg-accent/50' : 'hover:bg-muted/30')}`}
                      onClick={() => { setSelectedPart(i); setDetailTab('parsed') }}
                    >
                      <span className="text-[10px] text-muted-foreground/40 w-4 text-right shrink-0 tabular-nums">
                        {i + 1}
                      </span>
                      <span className="text-[10px] text-foreground/50 truncate min-w-0 flex-1">
                        {summary}
                      </span>
                      {skillScope && (
                        <span className="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground shrink-0">
                          {skillScope}
                        </span>
                      )}
                      {isAgentToolPart && agentIdFromPart && (
                        <button
                          type="button"
                          className="rounded px-1.5 py-px text-[9px] font-medium bg-purple-500/15 text-purple-700 dark:text-purple-300 hover:bg-purple-500/25 transition-colors shrink-0"
                          onClick={(e) => { e.stopPropagation(); setSubAgentDialog(agentIdFromPart) }}
                          title="View Sub-Agent"
                        >
                          <Bug className="h-3 w-3 inline mr-0.5" />debug
                        </button>
                      )}
                      <span className={`rounded px-1 py-px text-[10px] font-medium shrink-0 ${typeStyle}`}>
                        {typeLabel}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
            {/* Right: detail panel with tabs */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Tab bar */}
              {activePart != null && (
                <div className="flex items-center border-b shrink-0 bg-muted/10">
                  <button
                    type="button"
                    className={`px-3 py-1 text-[11px] font-medium transition-colors ${detailTab === 'parsed' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setDetailTab('parsed')}
                  >
                    Parsed
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 text-[11px] font-medium transition-colors ${detailTab === 'json' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setDetailTab('json')}
                  >
                    JSON
                  </button>
                  <div className="ml-auto pr-1">
                    <CopyButton text={activePartJson} className="h-5 w-5" />
                  </div>
                </div>
              )}
              {/* Tab content */}
              <div className="flex-1 overflow-y-auto ![scrollbar-width:thin]">
                {activePart == null ? (
                  <span className="text-xs text-muted-foreground italic px-3 py-2 block">No part selected</span>
                ) : detailTab === 'parsed' ? (
                  <PartDetail part={activePart} />
                ) : (
                  <pre className="px-3 py-2 text-[11px] leading-[1.7] whitespace-pre-wrap break-all font-mono text-foreground/50" style={{ userSelect: 'text', cursor: 'text' }}>
                    {highlightJson(activePartJson)}
                  </pre>
                )}
              </div>
            </div>
          </div>
          {/* API Debug steps — only for assistant messages */}
          {msg.role === 'assistant' && (
            <DebugStepsSection sessionId={sessionId} messageId={msg.id} parentSessionId={parentSessionId} isAgentSession={isAgentSession} />
          )}
        </div>
      )}
      {/* Sub-agent detail dialog */}
      {subAgentDialog && (
        <Dialog open onOpenChange={(v) => { if (!v) setSubAgentDialog(null) }}>
          <DialogContent className="max-w-[70vw] w-[70vw] max-h-[60vh] h-[60vh] p-0 gap-0 overflow-hidden flex flex-col rounded-xl sm:max-w-[70vw] allow-text-select" showCloseButton>
            <DialogHeader className="px-4 py-3 border-b shrink-0">
              <DialogTitle className="text-sm font-medium flex items-center gap-2">
                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300">sub-agent</span>
                <span className="font-mono text-muted-foreground text-xs">{subAgentDialog}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto ![scrollbar-width:thin]">
              <SubAgentViewer parentSessionId={isAgentSession ? parentSessionId! : sessionId} agentId={subAgentDialog} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/**
 * Insert a zero-width space after every `<` so the markdown renderer
 * treats angle brackets as literal text, not HTML. Visually identical
 * to the original but prevents tag parsing/swallowing.
 */
function escapeAngleBrackets(text: string): string {
  return text
    .replace(/</g, '<\u200B')
    .replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0') // preserve tabs as 4 non-breaking spaces
    .split('\n')
    .map((line) => {
      // Replace leading spaces with non-breaking spaces to preserve indentation
      const match = line.match(/^( +)/)
      if (match) {
        return '\u00A0'.repeat(match[1].length) + line.slice(match[1].length)
      }
      return line
    })
    .join('  \n') // two trailing spaces = markdown hard line break
}

function StaticRow({ label, content, defaultExpanded, badgeClass, borderClass }: { label: string; content: string; defaultExpanded?: boolean; badgeClass?: string; borderClass?: string }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false)
  const rawContent = content.trim()
  if (!rawContent) return null

  const preview = rawContent.replace(/\n/g, ' ').slice(0, 120)
  const safeMarkdown = escapeAngleBrackets(rawContent)

  return (
    <div className={`group/row border-b border-l-4 ${borderClass ?? 'border-l-gray-300 dark:border-l-gray-600'}`}>
      <div
        className="flex items-center gap-2 px-1.5 py-2 cursor-pointer hover:bg-muted/40 transition-colors select-text"
        onClick={() => { if (!hasTextSelection()) setExpanded((v) => !v) }}
      >
        <span className="text-[11px] text-muted-foreground/50 w-3 text-right shrink-0">—</span>
        <span className={`inline-flex justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 whitespace-nowrap ${badgeClass ?? 'bg-gray-500/15 text-gray-700 dark:text-gray-300'}`}>
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/60">
          {preview}
        </span>
        <span className="text-[11px] text-muted-foreground/40 shrink-0">
          {expanded ? '▾' : '▸'}
        </span>
      </div>
      {expanded && (
        <div className="border-t" onClick={(e) => e.stopPropagation()}>
          <div className="flex divide-x" style={{ minHeight: '50vh', maxHeight: '100vh' }}>
            {/* Left: rendered markdown */}
            <div className="w-3/5 overflow-y-auto ![scrollbar-width:thin] px-4 py-3" style={{ userSelect: 'text', cursor: 'text' }}>
              <MessageStreamMarkdown
                markdown={safeMarkdown}
                className={MESSAGE_STREAM_MARKDOWN_CLASSNAME}
              />
            </div>
            {/* Right: raw markdown source */}
            <div className="w-2/5 overflow-y-auto ![scrollbar-width:thin] relative group/raw">
              <div className="sticky top-0 flex justify-end p-1 z-10 pointer-events-none">
                <CopyButton
                  text={rawContent}
                  className="pointer-events-auto opacity-0 group-hover/raw:opacity-100 bg-background/80 backdrop-blur-sm shadow-sm border"
                />
              </div>
              <pre className="px-4 pb-3 -mt-5 text-[11px] leading-[1.7] whitespace-pre-wrap break-all font-mono select-text text-foreground/60">
                {rawContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MessagesPanel({ sessionId, promptContent, prefaceContent }: { sessionId: string; promptContent?: string; prefaceContent?: string }) {
  const { t } = useTranslation('ai')
  const [messages, setMessages] = useState<StoredMessageView[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const fetchMessages = useCallback(() => {
    setLoading(true)
    setError(null)
    trpcClient.chat.getSessionMessages.query({ sessionId })
      .then((res: { messages: StoredMessageView[] }) => {
        setMessages(res.messages)
      })
      .catch((err: Error) => {
        setError(err.message ?? 'Failed to load messages')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [sessionId])

  const fetchedRef = useRef(false)
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetchMessages()
  }, [fetchMessages])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allExpanded = messages != null && messages.length > 0 && expandedIds.size === messages.length

  const handleExpandCollapseAll = useCallback(() => {
    if (!messages) return
    if (allExpanded) {
      setExpandedIds(new Set())
    } else {
      setExpandedIds(new Set(messages.map((m) => m.id)))
    }
  }, [messages, allExpanded])

  const handleRefresh = useCallback(() => {
    fetchedRef.current = false
    setExpandedIds(new Set())
    fetchMessages()
  }, [fetchMessages])

  if (loading) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">{t('debug.loadingMessages')}</p>
  }
  if (error) {
    return <p className="px-4 py-3 text-sm text-destructive">{error}</p>
  }
  if (!messages || messages.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">{t('debug.noMessages')}</p>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-4 py-1.5 text-xs text-muted-foreground border-b shrink-0">
        <span className="tabular-nums">{messages.length} {t('debug.messageCount')}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleExpandCollapseAll}
            title={allExpanded ? t('debug.collapseAll') : t('debug.expandAll')}
          >
            {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleRefresh}
            title={t('debug.refresh')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto ![scrollbar-width:thin]">
        <SubAgentIndex sessionId={sessionId} />
        {promptContent?.trim() && (
          <StaticRow
            label={t('debug.systemPrompt')}
            content={promptContent!}
            badgeClass="bg-red-500/15 text-red-700 dark:text-red-300"
            borderClass="border-l-red-400"
          />
        )}
        {prefaceContent?.trim() && (
          <StaticRow
            label={t('debug.chatPreface')}
            content={prefaceContent!}
            badgeClass="bg-amber-500/15 text-amber-700 dark:text-amber-300"
            borderClass="border-l-amber-400"
          />
        )}
        {(() => {
          const idToIndex = new Map(messages.map((m, i) => [m.id, i]))
          return messages.map((msg, idx) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              idx={idx}
              expanded={expandedIds.has(msg.id)}
              onToggle={() => toggleExpand(msg.id)}
              idToIndex={idToIndex}
              sessionId={sessionId}
            />
          ))
        })()}
      </div>
    </div>
  )
}

export default function AiDebugViewer({
  tabId,
  panelKey,
  prefaceContent,
  promptContent,
  sessionId,
  jsonlPath,
}: AiDebugViewerProps) {
  const { t } = useTranslation('ai')
  const removeStackItem = useLayoutState((s) => s.removeStackItem)
  const shouldRenderStackHeader = Boolean(tabId && panelKey)
  const logFolderPath = resolveLogFolderPath(jsonlPath)

  const handleCopyLogFolderPath = useCallback(async () => {
    if (!logFolderPath) {
      toast.error(t('debug.copyError'))
      return
    }
    try {
      await navigator.clipboard.writeText(logFolderPath)
      toast.success(t('debug.copySuccess'))
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = logFolderPath
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast.success(t('debug.copySuccess'))
    }
  }, [logFolderPath, t])

  const handleOpenFolder = useCallback(async () => {
    if (!logFolderPath) return
    const api = window.openloafElectron
    if (api?.openPath) {
      await api.openPath({ uri: toFileUri(logFolderPath) })
    }
  }, [logFolderPath])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden allow-text-select">
      {shouldRenderStackHeader ? (
        <StackHeader
          title={t('debug.title')}
          rightSlotBeforeClose={
            sessionId ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyLogFolderPath}
                  aria-label={t('debug.copyLogPath')}
                  title={t('debug.copyLogPath')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenFolder}
                  aria-label={t('debug.openLogFolder')}
                  title={t('debug.openLogFolder')}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </>
            ) : null
          }
          showMinimize
          onMinimize={() => {
            useLayoutState.getState().setStackHidden(true)
          }}
          onClose={() => {
            if (!panelKey) return
            removeStackItem(panelKey)
          }}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        {sessionId ? (
          <MessagesPanel
            sessionId={sessionId}
            promptContent={promptContent}
            prefaceContent={prefaceContent}
          />
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('debug.noMessages')}</p>
        )}
      </div>
    </div>
  )
}
