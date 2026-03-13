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
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind, shortPath, EmptyView, FilePathLink } from './shared/office-tool-utils'
import type { TFunction } from 'i18next'

const MAX_PREVIEW_CHARS = 2000
const MAX_PREVIEW_PARAGRAPHS = 20

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function WordStructureView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const paragraphs = Array.isArray(data.paragraphs)
    ? (data.paragraphs as Record<string, unknown>[])
    : []
  const tables = Array.isArray(data.tables)
    ? (data.tables as Record<string, unknown>[])
    : []
  const images = Array.isArray(data.images)
    ? (data.images as Record<string, unknown>[])
    : []
  const headers = Array.isArray(data.headers) ? (data.headers as string[]) : []
  const footers = Array.isArray(data.footers) ? (data.footers as string[]) : []
  const totalParagraphs = typeof data.totalParagraphs === 'number' ? data.totalParagraphs : paragraphs.length
  const truncated = data.truncated === true

  const displayParas = paragraphs.slice(0, MAX_PREVIEW_PARAGRAPHS)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>{t('tool.word.totalParagraphs', { count: totalParagraphs })}</span>
        {tables.length > 0 && <span>{t('tool.word.tables', { count: tables.length })}</span>}
        {images.length > 0 && <span>{t('tool.word.images', { count: images.length })}</span>}
      </div>

      {displayParas.length > 0 && (
        <div className="space-y-0.5">
          {displayParas.map((p, i) => {
            const text = typeof p.text === 'string' ? p.text : ''
            const style = typeof p.style === 'string' ? p.style : ''
            const isHeading = style.toLowerCase().startsWith('heading')
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                {style && (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${isHeading ? 'bg-ol-blue/10 text-ol-blue' : 'bg-muted text-muted-foreground'}`}>
                    {style}
                  </span>
                )}
                <span className="min-w-0 truncate">{text || '—'}</span>
              </div>
            )
          })}
          {truncated && (
            <div className="text-center text-[10px] text-muted-foreground">
              {t('tool.word.truncated', { shown: displayParas.length, total: totalParagraphs })}
            </div>
          )}
        </div>
      )}

      {tables.length > 0 && (
        <div className="space-y-2">
          {tables.map((table, i) => {
            const rows = typeof table.rows === 'number' ? table.rows : 0
            const cols = typeof table.cols === 'number' ? table.cols : 0
            const preview = Array.isArray(table.preview) ? (table.preview as string[][]) : []
            return (
              <div key={i} className="rounded border border-border/40">
                <div className="bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
                  {t('tool.word.table', { index: typeof table.index === 'number' ? table.index + 1 : i + 1 })} · {rows}×{cols}
                </div>
                {preview.length > 0 && (
                  <div className="overflow-auto">
                    <table className="w-full border-collapse text-xs font-mono">
                      <tbody>
                        {preview.map((row, ri) => (
                          <tr key={ri} className="even:bg-muted/30">
                            {row.map((cell, ci) => (
                              <td key={ci} className="max-w-[160px] truncate border-r border-border/30 px-2 py-0.5">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {(headers.length > 0 || footers.length > 0) && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {headers.length > 0 && <span>{t('tool.word.header')}: {headers.join(', ')}</span>}
          {footers.length > 0 && <span>{t('tool.word.footer')}: {footers.join(', ')}</span>}
        </div>
      )}
    </div>
  )
}

function TextPreviewView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const rawText = typeof data.text === 'string' ? data.text : ''
  const truncated = data.truncated === true
  const characterCount = typeof data.characterCount === 'number' ? data.characterCount : rawText.length
  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : undefined
  const legacy = data.legacy === true
  const hint = typeof data.hint === 'string' ? data.hint : ''

  const displayText = rawText.length > MAX_PREVIEW_CHARS ? rawText.slice(0, MAX_PREVIEW_CHARS) : rawText
  const uiTruncated = rawText.length > MAX_PREVIEW_CHARS || truncated

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>{t('tool.word.characterCount', { count: characterCount })}</span>
        {pageCount != null && <span>{t('tool.pdf.pageCount', { count: pageCount })}</span>}
        {uiTruncated && <span className="text-ol-amber">{t('tool.word.textTruncated')}</span>}
      </div>
      <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs leading-relaxed">
        {displayText}
      </pre>
      {legacy && hint && (
        <div className="rounded bg-ol-amber/10 px-2 py-1 text-[10px] text-ol-amber">
          {hint}
        </div>
      )}
    </div>
  )
}

function ContentSummaryView({
  content,
  t,
}: {
  content: Record<string, unknown>[]
  t: TFunction
}) {
  const counts: Record<string, number> = {}
  for (const item of content) {
    const type = typeof item.type === 'string' ? item.type : 'unknown'
    counts[type] = (counts[type] ?? 0) + 1
  }
  const parts = Object.entries(counts).map(([type, count]) => `${count} ${type}`)
  return (
    <div className="text-xs text-muted-foreground">
      {t('tool.word.contentPreview')}: {parts.join(', ')}
    </div>
  )
}

function EditOperationsPreview({
  edits,
  t,
}: {
  edits: Record<string, unknown>[]
  t: TFunction
}) {
  return (
    <div className="space-y-0.5">
      {edits.slice(0, 10).map((edit, i) => {
        const op = typeof edit.op === 'string' ? edit.op : '?'
        const editPath = typeof edit.path === 'string' ? edit.path : ''
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {op}
            </span>
            <span className="min-w-0 truncate font-mono text-muted-foreground">{editPath}</span>
          </div>
        )
      })}
      {edits.length > 10 && (
        <div className="text-[10px] text-muted-foreground">
          {t('tool.office.more', { count: edits.length - 10 })}
        </div>
      )}
    </div>
  )
}

type ResultEntry = { label: string; value?: string; fileLink?: string }

function MutateResultEntries({ entries }: { entries: ResultEntry[] }) {
  if (entries.length === 0) return <EmptyView />
  return (
    <div className="space-y-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{entry.label}</span>
          {entry.fileLink ? (
            <FilePathLink filePath={entry.fileLink} />
          ) : entry.value ? (
            <span className="truncate font-mono text-foreground">{entry.value}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WordTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)
  const isMutate = toolKind === 'word-mutate'

  return (
    <OfficeToolShell
      part={part}
      className={className}
      toolKind={toolKind}
      isMutate={isMutate}
      i18nPrefix="tool.office"
    >
      {(ctx) => {
        const { data, input, mode, isPending, isDone, t } = ctx

        // Mutate pending: show preview from input
        if (isMutate && isPending && input) {
          const action = typeof input.action === 'string' ? input.action : ''
          if (action === 'create' && Array.isArray(input.content)) {
            return <ContentSummaryView content={input.content as Record<string, unknown>[]} t={t} />
          }
          if (action === 'edit' && Array.isArray(input.edits)) {
            return <EditOperationsPreview edits={input.edits as Record<string, unknown>[]} t={t} />
          }
          const entries: ResultEntry[] = []
          if (typeof input.filePath === 'string') entries.push({ label: t('tool.office.file'), fileLink: input.filePath as string })
          if (action) entries.push({ label: t('tool.office.action'), value: action })
          return <MutateResultEntries entries={entries} />
        }

        // Done with output data
        if (data) {
          if (isMutate && isDone) {
            const action = typeof data.action === 'string' ? data.action : ''
            const entries: ResultEntry[] = []
            const resultFilePath = (typeof input?.filePath === 'string' ? input.filePath : data.filePath) as string | undefined
            if (typeof resultFilePath === 'string') entries.push({ label: t('tool.office.file'), fileLink: resultFilePath })
            if (action === 'create' && typeof data.elementCount === 'number') {
              entries.push({ label: t('tool.word.elementCount'), value: String(data.elementCount) })
            }
            if (action === 'edit' && typeof data.editCount === 'number') {
              entries.push({ label: t('tool.word.editCount'), value: String(data.editCount) })
            }
            return <MutateResultEntries entries={entries} />
          }

          if (mode === 'read-structure') {
            return <WordStructureView data={data} t={t} />
          }
          if (mode === 'read-text') {
            return <TextPreviewView data={data} t={t} />
          }
        }

        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
