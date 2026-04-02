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

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function PdfStructureView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : 0
  const fileSize = typeof data.fileSize === 'number' ? data.fileSize : 0
  const hasForm = data.hasForm === true
  const formFieldCount = typeof data.formFieldCount === 'number' ? data.formFieldCount : 0
  const metadata = typeof data.metadata === 'object' && data.metadata != null
    ? (data.metadata as Record<string, unknown>)
    : {}

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const metaEntries = Object.entries(metadata).filter(([, v]) => v != null && v !== '')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="rounded bg-secondary px-2 py-0.5 font-medium text-foreground">
          {t('tool.pdf.pageCount', { count: pageCount })}
        </span>
        <span className="text-muted-foreground">{t('tool.pdf.fileSize')}: {formatSize(fileSize)}</span>
        {hasForm && (
          <span className="rounded bg-secondary px-2 py-0.5 text-foreground">
            {t('tool.pdf.formFieldCount', { count: formFieldCount })}
          </span>
        )}
      </div>

      {metaEntries.length > 0 && (
        <div className="rounded border border-border/40">
          <div className="bg-muted/50 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {t('tool.pdf.metadata')}
          </div>
          <div className="space-y-0.5 px-2 py-1.5">
            {metaEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 capitalize text-muted-foreground">{key}</span>
                <span className="min-w-0 truncate font-mono">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PdfTextPreviewView({
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

  const displayText = rawText.length > MAX_PREVIEW_CHARS ? rawText.slice(0, MAX_PREVIEW_CHARS) : rawText
  const uiTruncated = rawText.length > MAX_PREVIEW_CHARS || truncated

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {pageCount != null && <span>{t('tool.pdf.pageCount', { count: pageCount })}</span>}
        <span>{t('tool.word.characterCount', { count: characterCount })}</span>
        {uiTruncated && <span className="text-muted-foreground">{t('tool.word.textTruncated')}</span>}
      </div>
      <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs leading-relaxed">
        {displayText}
      </pre>
    </div>
  )
}

function PdfFormFieldsView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const fields = Array.isArray(data.fields)
    ? (data.fields as Record<string, unknown>[])
    : []
  const fieldCount = typeof data.fieldCount === 'number' ? data.fieldCount : fields.length

  if (fields.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground">
        {t('tool.pdf.noFormFields')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {t('tool.pdf.formFieldCount', { count: fieldCount })}
      </div>
      <div className="max-h-[320px] overflow-auto rounded border border-border/40">
        <table className="w-full border-collapse text-xs font-mono">
          <thead>
            <tr className="sticky top-0 z-10 bg-muted/80">
              <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                {t('tool.pdf.fieldName')}
              </th>
              <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                {t('tool.pdf.fieldType')}
              </th>
              <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                {t('tool.pdf.fieldValue')}
              </th>
              <th className="border-b border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                {t('tool.pdf.fieldOptions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => (
              <tr key={i} className="even:bg-muted/30">
                <td className="max-w-[160px] truncate border-r border-border/30 px-2 py-0.5 font-medium">
                  {String(field.name ?? '')}
                </td>
                <td className="border-r border-border/30 px-2 py-0.5 text-muted-foreground">
                  {String(field.type ?? '')}
                </td>
                <td className="max-w-[160px] truncate border-r border-border/30 px-2 py-0.5">
                  {String(field.value ?? '—')}
                </td>
                <td className="max-w-[160px] truncate px-2 py-0.5 text-muted-foreground">
                  {Array.isArray(field.options) ? (field.options as string[]).join(', ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PdfScreenshotView({
  data,
  t,
}: {
  data: Record<string, unknown>
  t: TFunction
}) {
  const url = typeof data.url === 'string' ? data.url : ''
  const pageNumber = typeof data.pageNumber === 'number' ? data.pageNumber : 1
  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : undefined
  const width = typeof data.width === 'number' ? data.width : 0
  const height = typeof data.height === 'number' ? data.height : 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>
          {t('tool.pdf.screenshotPage', { page: pageNumber, total: pageCount ?? '?' })}
        </span>
        <span>{width}×{height}px</span>
      </div>
      {url && (
        <div className="max-h-[400px] overflow-auto rounded border border-border/40">
          <img
            src={url}
            alt={`PDF page ${pageNumber}`}
            className="w-full"
            loading="lazy"
          />
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

function FillFormPreview({
  fields,
  t,
}: {
  fields: Record<string, string>
  t: TFunction
}) {
  const entries = Object.entries(fields)
  if (entries.length === 0) return <EmptyView />
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-muted-foreground">{t('tool.pdf.fillForm')}</div>
      {entries.slice(0, 15).map(([name, value]) => (
        <div key={name} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 font-mono text-muted-foreground">{name}</span>
          <span className="text-muted-foreground">→</span>
          <span className="min-w-0 truncate font-mono">{value}</span>
        </div>
      ))}
      {entries.length > 15 && (
        <div className="text-[10px] text-muted-foreground">{t('tool.office.more', { count: entries.length - 15 })}</div>
      )}
    </div>
  )
}

function MergePreview({
  sourcePaths,
  t,
}: {
  sourcePaths: string[]
  t: TFunction
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-muted-foreground">{t('tool.pdf.mergePdfs')}</div>
      {sourcePaths.map((p, i) => (
        <div key={i} className="text-xs">
          <FilePathLink filePath={p} />
        </div>
      ))}
    </div>
  )
}

function AddTextPreview({
  overlays,
  t,
}: {
  overlays: Record<string, unknown>[]
  t: TFunction
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-muted-foreground">{t('tool.pdf.addText')}</div>
      {overlays.slice(0, 10).map((o, i) => {
        const page = typeof o.page === 'number' ? o.page : '?'
        const text = typeof o.text === 'string' ? o.text : ''
        const x = typeof o.x === 'number' ? o.x : 0
        const y = typeof o.y === 'number' ? o.y : 0
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="shrink-0 text-[10px] text-muted-foreground">
              p{page} ({x},{y})
            </span>
            <span className="min-w-0 truncate font-mono">{text}</span>
          </div>
        )
      })}
      {overlays.length > 10 && (
        <div className="text-[10px] text-muted-foreground">{t('tool.office.more', { count: overlays.length - 10 })}</div>
      )}
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
        <div className="text-[10px] text-muted-foreground">{t('tool.office.more', { count: edits.length - 10 })}</div>
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

export default function PdfTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)
  const isMutate = toolKind === 'PdfMutate'

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
          if (action === 'fill-form' && typeof input.fields === 'object' && input.fields != null) {
            return <FillFormPreview fields={input.fields as Record<string, string>} t={t} />
          }
          if (action === 'merge' && Array.isArray(input.sourcePaths)) {
            return <MergePreview sourcePaths={input.sourcePaths as string[]} t={t} />
          }
          if (action === 'add-text' && Array.isArray(input.overlays)) {
            return <AddTextPreview overlays={input.overlays as Record<string, unknown>[]} t={t} />
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
            if (action === 'create') {
              if (typeof data.pageCount === 'number') entries.push({ label: t('tool.pdf.pageCount', { count: data.pageCount as number }), value: '' })
              if (typeof data.elementCount === 'number') entries.push({ label: t('tool.pdf.elementCount'), value: String(data.elementCount) })
            }
            if (action === 'fill-form' && typeof data.filledCount === 'number') {
              entries.push({ label: t('tool.pdf.filledCount'), value: String(data.filledCount) })
              if (Array.isArray(data.skippedFields) && (data.skippedFields as string[]).length > 0) {
                entries.push({ label: t('tool.pdf.skipped'), value: (data.skippedFields as string[]).join(', ') })
              }
            }
            if (action === 'merge') {
              if (typeof data.pageCount === 'number') entries.push({ label: t('tool.pdf.pageCount', { count: data.pageCount as number }), value: '' })
              if (typeof data.sourceCount === 'number') entries.push({ label: t('tool.pdf.sourceCount'), value: String(data.sourceCount) })
            }
            return <MutateResultEntries entries={entries} />
          }

          // Query views
          if (mode === 'read-structure') {
            return <PdfStructureView data={data} t={t} />
          }
          if (mode === 'read-text') {
            return <PdfTextPreviewView data={data} t={t} />
          }
          if (mode === 'read-form-fields') {
            return <PdfFormFieldsView data={data} t={t} />
          }
          if (mode === 'read-screenshot') {
            return <PdfScreenshotView data={data} t={t} />
          }
        }

        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
