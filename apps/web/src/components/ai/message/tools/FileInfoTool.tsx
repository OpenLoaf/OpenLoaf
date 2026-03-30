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
import { getToolKind, EmptyView, FilePathLink } from './shared/office-tool-utils'
import type { TFunction } from 'i18next'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  if (m < 60) return `${m}:${String(sec).padStart(2, '0')}`
  const h = Math.floor(m / 60)
  return `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Collect summary segments (shown as "a · b · c" in one line)
// and metadata rows (label: value pairs, only for extra info)
// ---------------------------------------------------------------------------

type MetaRow = { label: string; value: string }

function collectSegments(
  base: Record<string, unknown>,
  details: Record<string, unknown>,
  fileType: string,
  t: TFunction,
): { segments: string[]; rows: MetaRow[]; dateStr: string } {
  const segments: string[] = []
  const rows: MetaRow[] = []

  // File type — always first
  segments.push(fileType.toUpperCase())

  // Size
  if (typeof base.formattedSize === 'string') segments.push(base.formattedSize)
  else if (typeof base.fileSize === 'number') segments.push(fmtSize(base.fileSize))

  // Type-specific key stats as segments
  switch (fileType) {
    case 'image': {
      if (typeof details.width === 'number' && typeof details.height === 'number') {
        segments.push(`${details.width}×${details.height}`)
      }
      if (typeof details.format === 'string') segments.push(details.format.toUpperCase())
      if (details.hasAlpha === true) segments.push('Alpha')
      if (details.isAnimated === true) segments.push(t('tool.fileInfo.animated'))
      if (typeof details.colorSpace === 'string') rows.push({ label: t('tool.fileInfo.colorSpace'), value: details.colorSpace })
      if (typeof details.density === 'number') rows.push({ label: t('tool.fileInfo.density'), value: `${details.density} DPI` })
      break
    }
    case 'video':
    case 'audio': {
      if (typeof details.duration === 'number') segments.push(fmtDuration(details.duration))
      if (typeof details.resolution === 'string') segments.push(details.resolution)
      const codecs = details.codecs as Record<string, unknown> | undefined
      if (codecs) {
        const parts: string[] = []
        if (typeof codecs.video === 'string') parts.push(codecs.video)
        if (typeof codecs.audio === 'string') parts.push(codecs.audio)
        if (parts.length > 0) rows.push({ label: t('tool.fileInfo.codec'), value: parts.join(' / ') })
      }
      if (typeof details.bitRate === 'number') {
        rows.push({ label: t('tool.fileInfo.bitRate'), value: `${(details.bitRate / 1000).toFixed(0)} kbps` })
      }
      break
    }
    case 'pdf': {
      if (typeof details.pageCount === 'number') {
        segments.push(t('tool.fileInfo.pageCount', { count: details.pageCount }))
      }
      if (details.hasForm === true && typeof details.formFieldCount === 'number' && details.formFieldCount > 0) {
        segments.push(t('tool.fileInfo.formFields', { count: details.formFieldCount }))
      }
      break
    }
    case 'spreadsheet': {
      const sheets = Array.isArray(details.sheets) ? (details.sheets as Record<string, unknown>[]) : []
      if (typeof details.sheetCount === 'number') {
        segments.push(t('tool.fileInfo.sheetCount', { count: details.sheetCount }))
      }
      for (const sheet of sheets.slice(0, 3)) {
        const name = typeof sheet.name === 'string' ? sheet.name : '?'
        const rc = typeof sheet.rowCount === 'number' && typeof sheet.colCount === 'number'
          ? ` (${sheet.rowCount}×${sheet.colCount})`
          : ''
        rows.push({ label: name, value: rc })
      }
      if (sheets.length > 3) {
        rows.push({ label: '', value: `+${sheets.length - 3} ${t('tool.fileInfo.moreSheets')}` })
      }
      break
    }
  }

  // Date — separate for right-alignment
  const dateStr = typeof base.modifiedAt === 'string' ? fmtDate(base.modifiedAt) : ''

  return { segments, rows, dateStr }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FileInfoTool({
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
      className={className}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.office"
      defaultOpen
    >
      {(ctx) => {
        const { data, input, isPending, isDone, t } = ctx

        if (isPending && input) {
          const filePath = typeof input.filePath === 'string' ? input.filePath : ''
          return filePath ? (
            <div className="text-xs">
              <FilePathLink filePath={filePath} />
            </div>
          ) : <EmptyView />
        }

        if (!data || !isDone) return <EmptyView />

        const fileType = typeof data.fileType === 'string' ? data.fileType : 'other'
        const base = typeof data.base === 'object' && data.base != null
          ? (data.base as Record<string, unknown>)
          : {}
        const details = typeof data.details === 'object' && data.details != null
          ? (data.details as Record<string, unknown>)
          : {}

        if (typeof details.error === 'string') {
          return <div className="text-xs text-destructive">{details.error}</div>
        }

        const { segments, rows, dateStr } = collectSegments(base, details, fileType, t)

        return (
          <div className="space-y-1.5">
            {/* One-liner: type · size · stats ... date (right-aligned) */}
            {(segments.length > 0 || dateStr) && (
              <div className="flex items-center gap-x-1 text-xs text-muted-foreground">
                {segments.map((seg, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-muted-foreground/40">·</span>}
                    <span className={i === 0 ? 'font-medium text-foreground' : ''}>{seg}</span>
                  </React.Fragment>
                ))}
                {dateStr && <span className="ml-auto shrink-0">{dateStr}</span>}
              </div>
            )}

            {/* Extra metadata rows */}
            {rows.length > 0 && (
              <div className="space-y-0.5 border-t border-border/30 pt-1.5">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-xs">
                    {row.label && <span className="shrink-0 text-muted-foreground">{row.label}</span>}
                    <span className="min-w-0 truncate font-mono text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }}
    </OfficeToolShell>
  )
}
