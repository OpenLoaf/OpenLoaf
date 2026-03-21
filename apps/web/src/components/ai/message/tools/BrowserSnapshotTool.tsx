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
import { GlobeIcon, LayersIcon, MousePointerClickIcon } from 'lucide-react'
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind, EmptyView } from './shared/office-tool-utils'
import { cn } from '@/lib/utils'
import type { TFunction } from 'i18next'

type SnapshotElement = { selector: string; text: string; tag: string }

type SnapshotData = {
  url?: string
  title?: string
  readyState?: string
  text?: string
  elements?: SnapshotElement[]
}

/** Extract snapshot data — handles both browser-snapshot and browser-observe shapes. */
function resolveSnapshot(data: Record<string, unknown> | null): { task?: string; snapshot: SnapshotData } {
  if (!data) return { snapshot: {} }
  // browser-observe wraps snapshot inside { task, snapshot }
  if (typeof data.task === 'string' && data.snapshot && typeof data.snapshot === 'object') {
    return { task: data.task, snapshot: data.snapshot as SnapshotData }
  }
  // browser-snapshot returns snapshot fields directly
  return { snapshot: data as unknown as SnapshotData }
}

function PageInfoView({ snapshot, task, t }: { snapshot: SnapshotData; task?: string; t: TFunction }) {
  return (
    <div className="space-y-1">
      {task && (
        <div className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{t('tool.browser.task', { defaultValue: '任务' })}</span>
          <span className="truncate font-medium text-foreground">{task}</span>
        </div>
      )}
      {snapshot.url && (
        <div className="flex items-center gap-2 text-xs">
          <GlobeIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-foreground">{snapshot.url}</span>
        </div>
      )}
      {snapshot.title && (
        <div className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{t('tool.browser.title', { defaultValue: '标题' })}</span>
          <span className="truncate text-foreground">{snapshot.title}</span>
        </div>
      )}
      {snapshot.readyState && (
        <div className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{t('tool.browser.state', { defaultValue: '状态' })}</span>
          <span className="font-mono text-foreground">{snapshot.readyState}</span>
        </div>
      )}
    </div>
  )
}

function ElementsTable({ elements, t }: { elements: SnapshotElement[]; t: TFunction }) {
  const [expanded, setExpanded] = React.useState(false)
  const limit = 20
  const visible = expanded ? elements : elements.slice(0, limit)
  const hasMore = elements.length > limit

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MousePointerClickIcon className="size-3" />
        <span>
          {t('tool.browser.elements', { defaultValue: '可交互元素' })}
          <span className="ml-1 font-mono">({elements.length})</span>
        </span>
      </div>
      <div className="max-h-[240px] overflow-auto rounded border border-border/40">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b bg-muted/30 text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">tag</th>
              <th className="px-2 py-1 text-left font-medium">selector</th>
              <th className="px-2 py-1 text-left font-medium">text</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((el, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0">
                <td className="whitespace-nowrap px-2 py-0.5 font-mono text-foreground">{el.tag}</td>
                <td className="max-w-[200px] truncate px-2 py-0.5 font-mono">{el.selector}</td>
                <td className="max-w-[160px] truncate px-2 py-0.5 text-muted-foreground">{el.text || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && !expanded && (
        <button
          type="button"
          className="mt-1 text-[11px] text-muted-foreground hover:underline"
          onClick={() => setExpanded(true)}
        >
          {t('tool.browser.showAll', { defaultValue: '显示全部', count: elements.length })}
        </button>
      )}
    </div>
  )
}

function TextPreview({ text, t }: { text: string; t: TFunction }) {
  const [expanded, setExpanded] = React.useState(false)
  const previewLength = 300
  const truncated = text.length > previewLength
  const displayed = expanded ? text : text.slice(0, previewLength)

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <LayersIcon className="size-3" />
        <span>{t('tool.browser.pageText', { defaultValue: '页面文本' })}</span>
      </div>
      <pre className="max-h-[120px] overflow-auto whitespace-pre-wrap rounded border border-border/40 bg-muted/20 px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
        {displayed}{truncated && !expanded ? '…' : ''}
      </pre>
      {truncated && !expanded && (
        <button
          type="button"
          className="mt-1 text-[11px] text-muted-foreground hover:underline"
          onClick={() => setExpanded(true)}
        >
          {t('tool.browser.expandText', { defaultValue: '展开全文' })}
        </button>
      )}
    </div>
  )
}

function SnapshotContent({ data, t }: { data: Record<string, unknown> | null; t: TFunction }) {
  const { task, snapshot } = resolveSnapshot(data)
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : []
  const text = typeof snapshot.text === 'string' ? snapshot.text.trim() : ''

  return (
    <div className="space-y-1">
      <PageInfoView snapshot={snapshot} task={task} t={t} />
      {elements.length > 0 && <ElementsTable elements={elements} t={t} />}
      {text && <TextPreview text={text} t={t} />}
    </div>
  )
}

export default function BrowserSnapshotTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)

  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-xl', className)}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.office"
      defaultOpen
    >
      {(ctx) => {
        const { data, isDone, t } = ctx

        if (data && isDone) {
          return <SnapshotContent data={data} t={t} />
        }

        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
