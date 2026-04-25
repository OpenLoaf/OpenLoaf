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
import {
  CheckCircle2Icon,
  ImageIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from '@openloaf/api/common'
import { cn } from '@/lib/utils'
import { applyChatImageDrag } from '@/lib/image/drag'
import { ChatImageActions } from './shared/ChatImageActions'
import { useChatView } from '@/hooks/use-chat-view'
import { getChatScope } from '@/lib/chat-scope'
import { useLayoutState } from '@/hooks/use-layout-state'
import { createBrowserTabId } from '@/hooks/tab-id'
import { isElectronEnv } from '@/utils/is-electron-env'
import { normalizeUrl } from '@/components/browser/browser-utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import { Collapsible, CollapsibleTrigger } from '@openloaf/ui/collapsible'
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

type WebSearchImageItem = {
  title: string
  imageUrl: string
  sourceUrl: string
  source?: string
}

type ParsedOutput = {
  variantId?: string
  items: WebSearchImageItem[]
}

/**
 * Parse cloud `webSearchImage` envelope from cloudToolsDynamic.ts:
 *   { ok, feature, credits, variantId, data: { items: [{ title, url, imageUrl, source }], totalCount, metadata } }
 * items[].url is the source page, items[].imageUrl is the image asset itself.
 */
function parseOutput(text: string): ParsedOutput {
  const empty: ParsedOutput = { items: [] }
  if (!text) return empty
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return empty
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return empty
  }
  const envelope = parsed as {
    variantId?: unknown
    data?: { items?: unknown[] } | unknown[]
    items?: unknown[]
  }
  const variantId =
    typeof envelope?.variantId === 'string' ? envelope.variantId : undefined
  const rawItems = Array.isArray(envelope?.data)
    ? envelope.data
    : Array.isArray((envelope?.data as { items?: unknown[] } | undefined)?.items)
      ? ((envelope.data as { items?: unknown[] }).items as unknown[])
      : Array.isArray(envelope?.items)
        ? envelope.items
        : null
  if (!rawItems) return { variantId, items: [] }
  const items: WebSearchImageItem[] = rawItems
    .map((raw) => {
      const it = (raw ?? {}) as Record<string, unknown>
      const title = typeof it.title === 'string' ? it.title : ''
      const sourceUrl = typeof it.url === 'string' ? it.url : ''
      const imageUrl =
        (typeof it.imageUrl === 'string' && it.imageUrl) ||
        (typeof it.thumbUrl === 'string' && it.thumbUrl) ||
        ''
      const source = typeof it.source === 'string' ? it.source : undefined
      return { title, imageUrl, sourceUrl, source }
    })
    .filter((it) => it.imageUrl)
  return { variantId, items }
}

function openUrl(url: string, title?: string) {
  const normalized = normalizeUrl(url)
  if (!normalized) return
  if (!isElectronEnv()) {
    window.open(normalized, '_blank', 'noopener,noreferrer')
    return
  }
  const chatSessionId = useChatView.getState().getActiveSessionId(getChatScope().scope)
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

export default function WebSearchImageTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const query = inputObj
    ? typeof inputObj.source === 'string'
      ? inputObj.source.trim()
      : typeof inputObj.query === 'string'
        ? inputObj.query.trim()
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
  const parsed = React.useMemo(() => parseOutput(rawText), [rawText])
  const items = parsed.items

  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : tp?.errorText

  const count = items.length

  return (
    <Collapsible
      open
      className={cn('min-w-0 text-xs', className)}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger
            className={cn(
              'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
              'transition-colors duration-150 hover:bg-muted/60',
            )}
          >
            <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t('toolNames.WebSearchImage')}
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
                {t('tool.webSearchImage.resultCount', { count })}
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
          <div className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5 overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <Tooltip key={`${idx}-${item.imageUrl}`}>
                <TooltipTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openUrl(item.imageUrl, item.title)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openUrl(item.imageUrl, item.title)
                      }
                    }}
                    className={cn(
                      'group/image relative block aspect-square cursor-pointer overflow-hidden rounded-md bg-muted/50',
                      'transition-opacity duration-150 hover:opacity-90',
                    )}
                    aria-label={item.title || hostnameOf(item.imageUrl)}
                    draggable
                    onDragStart={(event) => {
                      applyChatImageDrag(event, {
                        url: item.imageUrl,
                        name: item.title?.trim() || undefined,
                      })
                    }}
                  >
                    {/* biome-ignore lint/performance/noImgElement: external remote URLs */}
                    <img
                      src={item.imageUrl}
                      alt={item.title || ''}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      draggable={false}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                      }}
                    />
                    <ChatImageActions url={item.imageUrl} name={item.title?.trim() || undefined} />
                  </div>
                </TooltipTrigger>
                {item.title ? (
                  <TooltipContent side="right" className="max-w-xs break-words text-xs">
                    {item.title}
                  </TooltipContent>
                ) : null}
              </Tooltip>
            ))}
          </div>
        ) : progressActive ? (
          <ToolOutputLoading label={tp?.label || t('tool.webSearchImage.searching')} />
        ) : errorText || hasError || progressError ? (
          <ToolOutputError message={errorText || t('tool.webSearchImage.searchFailed')} />
        ) : streaming ? (
          <ToolOutputLoading label={t('tool.webSearchImage.loading')} />
        ) : (
          <div className="py-0.5 text-[11px] text-muted-foreground/60">
            {t('tool.webSearchImage.noResults')}
          </div>
        )}
      </ToolOutputContent>
    </Collapsible>
  )
}
