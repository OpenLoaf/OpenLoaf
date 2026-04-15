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

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  SearchIcon,
  XCircleIcon,
} from 'lucide-react'
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from '@openloaf/api/common'
import { cn } from '@/lib/utils'
import { useAppView } from '@/hooks/use-app-view'
import { useLayoutState } from '@/hooks/use-layout-state'
import { createBrowserTabId } from '@/hooks/tab-id'
import { isElectronEnv } from '@/utils/is-electron-env'
import { normalizeUrl } from '@/components/browser/browser-utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import {
  Collapsible,
  CollapsibleTrigger,
} from '@openloaf/ui/collapsible'
import {
  ToolOutputContent,
  ToolOutputError,
  ToolOutputLoading,
} from './shared/ToolOutput'
import {
  asPlainObject,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
  type AnyToolPart,
} from './shared/tool-utils'

type WebSearchItem = {
  title: string
  url: string
  snippet: string
  source?: string
  publishedAt?: string
}

/**
 * Try to parse the SaaS cloud `webSearch` tool JSON envelope:
 *   { ok, feature, data: { items: [{ title, url, snippet, content, source, publishedAt }] } }
 * Returns null if the text is not JSON or doesn't match the shape.
 */
function parseJsonResults(text: string): WebSearchItem[] | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  let data: unknown
  try {
    data = JSON.parse(trimmed)
  } catch {
    return null
  }
  const envelope = data as {
    ok?: boolean
    data?: { items?: unknown[] }
    items?: unknown[]
  }
  const rawItems = Array.isArray(envelope?.data?.items)
    ? envelope.data!.items!
    : Array.isArray(envelope?.items)
      ? envelope.items!
      : null
  if (!rawItems) return null
  return rawItems
    .map((raw) => {
      const it = (raw ?? {}) as Record<string, unknown>
      const title = typeof it.title === 'string' ? it.title : ''
      const url = typeof it.url === 'string' ? it.url : ''
      const snippet =
        (typeof it.snippet === 'string' && it.snippet) ||
        (typeof it.content === 'string' && it.content) ||
        ''
      const source = typeof it.source === 'string' ? it.source : undefined
      const publishedAt =
        typeof it.publishedAt === 'string' ? it.publishedAt : undefined
      return { title, url, snippet, source, publishedAt }
    })
    .filter((it) => it.title || it.url)
}

/**
 * Parse markdown emitted by Claude Code's webSearchTool (streaming delta or final output).
 * Each result is a block starting with `### <title>`, followed by a URL line
 * (optionally prefixed with `URL: `), followed by snippet lines until the next
 * block or a blank line.
 */
function parseMarkdownResults(text: string): WebSearchItem[] {
  if (!text) return []
  const lines = text.split('\n')
  const items: WebSearchItem[] = []
  let current: WebSearchItem | null = null
  let phase: 'title' | 'url' | 'snippet' = 'title'

  const flush = () => {
    if (current && (current.title || current.url)) {
      current.snippet = current.snippet.trim()
      items.push(current)
    }
    current = null
    phase = 'title'
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('### ')) {
      flush()
      current = { title: line.slice(4).trim(), url: '', snippet: '' }
      phase = 'url'
      continue
    }
    if (!current) continue
    if (phase === 'url') {
      const urlLine = line.replace(/^URL:\s*/i, '').trim()
      if (urlLine) {
        current.url = urlLine
        phase = 'snippet'
      }
      continue
    }
    if (phase === 'snippet') {
      if (!line.trim()) {
        // blank line ends the current block
        flush()
        continue
      }
      current.snippet += (current.snippet ? '\n' : '') + line
    }
  }
  flush()
  return items
}

function parseResults(text: string): WebSearchItem[] {
  if (!text) return []
  const json = parseJsonResults(text)
  if (json && json.length > 0) return json
  return parseMarkdownResults(text)
}

function openUrl(url: string, title?: string) {
  const normalized = normalizeUrl(url)
  if (!normalized) return
  if (!isElectronEnv()) {
    window.open(normalized, '_blank', 'noopener,noreferrer')
    return
  }
  const chatSessionId = useAppView.getState().chatSessionId
  const baseKey = `browser:${chatSessionId}`
  const viewKey = `${baseKey}:${createBrowserTabId()}`
  useLayoutState.getState().pushStackItem(
    {
      id: BROWSER_WINDOW_PANEL_ID,
      sourceKey: BROWSER_WINDOW_PANEL_ID,
      component: BROWSER_WINDOW_COMPONENT,
      params: { __customHeader: true, __open: { url: normalized, title, viewKey } },
    } as any,
    70,
  )
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function WebSearchTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const query = inputObj
    ? typeof inputObj.query === 'string'
      ? inputObj.query.trim()
      : typeof inputObj.source === 'string'
        ? inputObj.source.trim()
        : ''
    : ''

  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const tp = part.toolProgress
  const progressActive = tp?.status === 'active'
  const progressDone = tp?.status === 'done'
  const progressError = tp?.status === 'error'
  const showSpinner = streaming || progressActive

  const output =
    typeof part.output === 'string' ? part.output : safeStringify(part.output)
  const rawText = output.trim() ? output : tp?.accumulatedText ?? ''
  const results = React.useMemo(() => parseResults(rawText), [rawText])

  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : tp?.errorText

  const count = results.length

  return (
    <Collapsible
      className={cn('min-w-0 text-xs', className)}
      defaultOpen={progressActive}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger
            className={cn(
              'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
              'transition-colors duration-150 hover:bg-muted/60',
            )}
          >
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t('toolNames.WebSearch')}
            </span>
            {query ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {query}
              </span>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
            {count > 0 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {t('tool.webSearch.resultCount', { count })}
              </span>
            ) : null}
            {showSpinner ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError || progressError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : count > 0 || progressDone ? (
              <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground/50" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        {query ? (
          <TooltipContent side="top" className="max-w-sm break-all font-mono text-xs">
            {query}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <ToolOutputContent>
        {count > 0 ? (
          <ul className="flex flex-col gap-1">
            {results.map((item, idx) => (
              <li key={`${idx}-${item.url}`}>
                <button
                  type="button"
                  onClick={() => openUrl(item.url, item.title)}
                  className={cn(
                    'group flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left',
                    'transition-colors duration-150 hover:bg-muted/60',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
                      {item.title || hostnameOf(item.url)}
                    </span>
                    <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100" />
                  </div>
                  {item.url ? (
                    <div className="min-w-0 truncate font-mono text-[10px] text-muted-foreground/60">
                      {hostnameOf(item.url)}
                    </div>
                  ) : null}
                  {item.snippet ? (
                    <p className="line-clamp-2 whitespace-pre-wrap text-[11px] leading-[1.45] text-muted-foreground">
                      {item.snippet}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : progressActive ? (
          <ToolOutputLoading label={tp?.label || t('tool.webSearch.searching')} />
        ) : errorText || hasError || progressError ? (
          <ToolOutputError message={errorText || t('tool.webSearch.searchFailed')} />
        ) : streaming ? (
          <ToolOutputLoading label={t('tool.webSearch.loading')} />
        ) : (
          <div className="py-0.5 text-[11px] text-muted-foreground/60">{t('tool.webSearch.noResults')}</div>
        )}
      </ToolOutputContent>
    </Collapsible>
  )
}
