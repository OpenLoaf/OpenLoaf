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
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import {
  asPlainObject,
  getApprovalId,
  getToolKind,
  getToolName,
  isApprovalPending,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
} from './shared/tool-utils'
import ToolApprovalActions from './shared/ToolApprovalActions'

// ---------------------------------------------------------------------------
// Data parsing helpers
// ---------------------------------------------------------------------------

type ExcelOutputData = Record<string, unknown>

function parseOutput(part: AnyToolPart): { ok: boolean; data: ExcelOutputData | null; error?: string } {
  const output = asPlainObject(part.output)
  if (!output) return { ok: false, data: null }
  const ok = output.ok !== false
  const data = asPlainObject(output.data)
  if (!ok) {
    const errText = typeof output.error === 'string' ? output.error : undefined
    return { ok: false, data, error: errText }
  }
  return { ok: true, data }
}

function parseInput(part: AnyToolPart): Record<string, unknown> | null {
  const input = normalizeToolInput(part.input)
  return asPlainObject(input)
}

function getMode(data: ExcelOutputData | null, input: Record<string, unknown> | null): string {
  if (typeof data?.mode === 'string') return data.mode
  if (typeof data?.action === 'string') return data.action
  if (typeof input?.mode === 'string') return input.mode
  if (typeof input?.action === 'string') return input.action
  return ''
}

// ---------------------------------------------------------------------------
// Column letter helper (0 → A, 1 → B, ...)
// ---------------------------------------------------------------------------

function colLetter(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

/** Compact data table for read-sheet / read-cells / write-cells preview. */
function DataTable({
  columns,
  rows,
  startRow,
}: {
  columns: string[]
  rows: (string | number | boolean | null | unknown)[][]
  startRow?: number
}) {
  if (columns.length === 0 && rows.length === 0) return null
  const base = startRow ?? 1
  return (
    <div className="max-h-[320px] overflow-auto overflow-x-auto rounded border border-border/40">
      <table className="w-full border-collapse text-xs font-mono">
        {columns.length > 0 && (
          <thead>
            <tr className="sticky top-0 z-10 bg-muted/80">
              <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="even:bg-muted/30">
              <td className="border-r border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground/60">
                {base + ri}
              </td>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="max-w-[200px] truncate border-r border-border/30 px-2 py-0.5"
                >
                  {cell == null ? '' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** read-sheet view: data.rows is Record<string, unknown>[] */
function ReadSheetView({
  data,
  t,
}: {
  data: ExcelOutputData
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const rows = Array.isArray(data.rows) ? (data.rows as Record<string, unknown>[]) : []
  if (rows.length === 0) return <EmptyView />
  const columns = Object.keys(rows[0] ?? {})
  const tableRows = rows.map((r) => columns.map((col) => r[col]))
  const offset = typeof data.offset === 'number' ? data.offset : 0
  const hasMore = data.hasMore === true
  const totalRows = typeof data.totalRows === 'number' ? data.totalRows : 0
  const returnedRows = typeof data.returnedRows === 'number' ? data.returnedRows : rows.length

  return (
    <div className="relative">
      <DataTable columns={columns} rows={tableRows} startRow={offset + 1} />
      {hasMore && (
        <div className="mt-1 text-center text-[10px] text-muted-foreground">
          {t('tool.excel.hasMore', { returned: returnedRows, total: totalRows })}
        </div>
      )}
    </div>
  )
}

/** read-cells view: data.cells is primitive[][] */
function ReadCellsView({ data }: { data: ExcelOutputData }) {
  const cells = Array.isArray(data.cells) ? (data.cells as unknown[][]) : []
  if (cells.length === 0) return <EmptyView />
  const range = typeof data.range === 'string' ? data.range : ''
  let startCol = 0
  let startRow = 1
  if (range) {
    const match = range.match(/^([A-Z]+)(\d+)/)
    if (match) {
      const letters = match[1]!
      startRow = Number.parseInt(match[2]!, 10)
      startCol = 0
      for (let i = 0; i < letters.length; i++) {
        startCol = startCol * 26 + (letters.charCodeAt(i) - 64)
      }
      startCol -= 1
    }
  }
  const colCount = cells[0]?.length ?? 0
  const columns = Array.from({ length: colCount }, (_, i) => colLetter(startCol + i))
  return <DataTable columns={columns} rows={cells} startRow={startRow} />
}

/** get-info / read-structure view */
function GetInfoView({
  data,
  t,
}: {
  data: ExcelOutputData
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const fileName = typeof data.fileName === 'string' ? data.fileName : ''
  const sheets = Array.isArray(data.sheets)
    ? (data.sheets as Record<string, unknown>[])
    : []
  const sheetCount = typeof data.sheetCount === 'number' ? data.sheetCount : sheets.length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-medium">{fileName}</span>
        <span className="text-muted-foreground">
          {t('tool.excel.sheetCount', { count: sheetCount })}
        </span>
      </div>
      {sheets.length > 0 && (
        <div className="overflow-auto rounded border border-border/40">
          <table className="w-full border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-muted/80">
                <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                  Sheet
                </th>
                <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                  Rows
                </th>
                <th className="border-b border-r border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                  Cols
                </th>
                <th className="border-b border-border/30 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">
                  Range
                </th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((sheet, i) => (
                <tr key={i} className="even:bg-muted/30">
                  <td className="border-r border-border/30 px-2 py-0.5 font-medium">
                    {String(sheet.name ?? '')}
                  </td>
                  <td className="border-r border-border/30 px-2 py-0.5 tabular-nums">
                    {String(sheet.rows ?? sheet.rowCount ?? '')}
                  </td>
                  <td className="border-r border-border/30 px-2 py-0.5 tabular-nums">
                    {String(sheet.cols ?? sheet.colCount ?? '')}
                  </td>
                  <td className="px-2 py-0.5 text-muted-foreground">
                    {String(sheet.ref ?? sheet.range ?? '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** read-xml view */
function ReadXmlView({ data }: { data: ExcelOutputData }) {
  const xml = typeof data.xml === 'string' ? data.xml : ''
  const xmlPath = typeof data.xmlPath === 'string' ? data.xmlPath : ''
  // list mode: entries is string[]
  const entries = Array.isArray(data.entries) ? (data.entries as string[]) : []

  if (entries.length > 0) {
    return (
      <div className="max-h-[320px] space-y-0.5 overflow-auto rounded border border-border/40 p-2 text-xs font-mono">
        {entries.map((entry) => (
          <div key={entry} className="text-muted-foreground">{entry}</div>
        ))}
      </div>
    )
  }

  if (!xml) return <EmptyView />
  return (
    <div className="space-y-1">
      {xmlPath && (
        <div className="text-[10px] text-muted-foreground">{xmlPath}</div>
      )}
      <div className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded border border-border/40 p-2 text-xs font-mono">
        {xml}
      </div>
    </div>
  )
}

/** read-text view */
function ReadTextView({ data }: { data: ExcelOutputData }) {
  const text = typeof data.text === 'string' ? data.text : ''
  if (!text) return <EmptyView />
  return (
    <div className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded border border-border/40 p-2 text-xs font-mono">
      {text}
    </div>
  )
}

/** list-sheets view */
function ListSheetsView({ data }: { data: ExcelOutputData }) {
  const sheets = Array.isArray(data.sheets) ? (data.sheets as string[]) : []
  if (sheets.length === 0) return <EmptyView />
  return (
    <div className="flex flex-wrap gap-1.5">
      {sheets.map((name) => (
        <span
          key={name}
          className="inline-flex items-center rounded-3xl bg-muted/60 px-2 py-0.5 text-xs font-medium"
        >
          {name}
        </span>
      ))}
    </div>
  )
}

/** Mutate result summary */
function MutateSummaryView({
  data,
  t,
}: {
  data: ExcelOutputData
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const action = typeof data.action === 'string' ? data.action : ''
  const entries: [string, string][] = []

  if (typeof data.filePath === 'string') entries.push(['File', shortPath(data.filePath as string)])
  if (typeof data.outputPath === 'string') entries.push([t('tool.excel.exportedTo'), shortPath(data.outputPath as string)])
  if (typeof data.sheetName === 'string') entries.push(['Sheet', data.sheetName as string])

  if (action === 'write-cells' && typeof data.cellsWritten === 'number') {
    entries.push([t('tool.excel.cellsWritten', { count: data.cellsWritten }), ''])
  }
  if (action === 'rename-sheet') {
    const oldName = typeof data.oldName === 'string' ? data.oldName : ''
    const newName = typeof data.newName === 'string' ? data.newName : ''
    entries.push([t('tool.excel.renamed'), `${oldName} → ${newName}`])
  }
  if (action === 'set-formula') {
    if (typeof data.cell === 'string') entries.push(['Cell', data.cell as string])
    if (typeof data.formula === 'string') entries.push([t('tool.excel.formula'), data.formula as string])
  }
  if (action === 'delete-sheet' && typeof data.deletedSheet === 'string') {
    entries.push(['Deleted', data.deletedSheet as string])
  }

  if (entries.length === 0) return <EmptyView />

  return (
    <div className="space-y-1">
      {entries.map(([label, value], i) => (
        <div key={i} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{label}</span>
          {value && (
            <span className="truncate font-mono text-foreground">{value}</span>
          )}
        </div>
      ))}
    </div>
  )
}

/** Approval preview for mutate pending state */
function MutatePreviewView({
  input,
  t,
}: {
  input: Record<string, unknown>
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const action = typeof input.action === 'string' ? input.action : ''
  const entries: [string, string][] = []

  if (typeof input.filePath === 'string') entries.push(['File', shortPath(input.filePath as string)])
  if (typeof input.sheetName === 'string') entries.push(['Sheet', input.sheetName as string])

  if (action === 'write-cells') {
    const data = Array.isArray(input.data) ? (input.data as unknown[][]) : []
    const range = typeof input.range === 'string' ? input.range : 'A1'
    if (data.length > 0) {
      const colCount = (data[0] as unknown[])?.length ?? 0
      const columns = Array.from({ length: colCount }, (_, i) => colLetter(i))
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            {entries.map(([label, value], i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground">{label}</span>
                <span className="truncate font-mono text-foreground">{value}</span>
              </div>
            ))}
            <div className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0 text-muted-foreground">Range</span>
              <span className="font-mono text-foreground">{range}</span>
            </div>
          </div>
          <DataTable columns={columns} rows={data as unknown[][]} />
        </div>
      )
    }
  }

  if (action === 'set-formula') {
    if (typeof input.range === 'string') entries.push(['Cell', input.range as string])
    if (typeof input.formula === 'string') entries.push([t('tool.excel.formula'), input.formula as string])
  }

  if (action === 'rename-sheet') {
    if (typeof input.newSheetName === 'string') entries.push([t('tool.excel.renamed'), `${input.sheetName ?? ''} → ${input.newSheetName}`])
  }

  if (action === 'delete-sheet') {
    entries.push(['Action', 'Delete sheet'])
  }

  if (action === 'create') {
    entries.push(['Action', 'Create workbook'])
  }

  if (action === 'add-sheet') {
    const name = typeof input.newSheetName === 'string' ? input.newSheetName : (input.sheetName as string ?? '')
    entries.push(['Action', `Add sheet: ${name}`])
  }

  if (action === 'import-csv') {
    if (typeof input.csvFilePath === 'string') entries.push(['CSV', shortPath(input.csvFilePath as string)])
  }

  if (action === 'save-as') {
    if (typeof input.outputPath === 'string') entries.push([t('tool.excel.exportedTo'), shortPath(input.outputPath as string)])
  }

  if (entries.length === 0) return null

  return (
    <div className="space-y-1">
      {entries.map(([label, value], i) => (
        <div key={i} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{label}</span>
          <span className="truncate font-mono text-foreground">{value}</span>
        </div>
      ))}
    </div>
  )
}

function EmptyView() {
  return <div className="py-2 text-center text-xs text-muted-foreground">—</div>
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length <= 3 ? p : `…/${parts.slice(-2).join('/')}`
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ExcelTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const toolKind = getToolKind(part)
  const isMutate = toolKind === 'excel-mutate'
  const title = getToolName(part)

  const isStreaming = isToolStreaming(part)
  const state = typeof part.state === 'string' ? part.state : ''
  const isDone = state === 'output-available'
  const isError = state === 'output-error'
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : ''

  const approvalId = getApprovalId(part)
  const isPending = isApprovalPending(part)

  const { ok, data, error: outputError } = parseOutput(part)
  const input = parseInput(part)
  const mode = getMode(data, input)

  const displayError = errorText || outputError || (!ok && isDone ? t('tool.excel.operationFailed') : '')

  const windowState = isError || displayError
    ? ('error' as const)
    : isStreaming
      ? ('running' as const)
      : isDone
        ? ('success' as const)
        : ('idle' as const)

  // 默认折叠，审批时自动展开
  const [isOpen, setIsOpen] = React.useState(isPending)

  // 审批状态变化时自动展开
  React.useEffect(() => {
    if (isPending) setIsOpen(true)
  }, [isPending])

  // Resolve content view
  const renderContent = () => {
    if (isStreaming) {
      return (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          {t('tool.excel.processing')}
        </div>
      )
    }

    if (displayError) {
      return (
        <div className="px-3 py-3 text-xs text-destructive">
          {displayError}
        </div>
      )
    }

    // Mutate pending: show preview from input
    if (isMutate && isPending && input) {
      return (
        <div className="px-3 py-2.5">
          <MutatePreviewView input={input} t={t} />
        </div>
      )
    }

    // Done with output data
    if (data) {
      return (
        <div className="px-3 py-2.5">
          {mode === 'read-sheet' && <ReadSheetView data={data} t={t} />}
          {mode === 'read-cells' && <ReadCellsView data={data} />}
          {(mode === 'get-info' || mode === 'read-structure') && <GetInfoView data={data} t={t} />}
          {mode === 'read-xml' && <ReadXmlView data={data} />}
          {mode === 'read-text' && <ReadTextView data={data} />}
          {mode === 'list-sheets' && <ListSheetsView data={data} />}
          {mode === 'export-csv' && <MutateSummaryView data={data} t={t} />}
          {isMutate && isDone && <MutateSummaryView data={data} t={t} />}
          {!['read-sheet', 'read-cells', 'get-info', 'read-structure', 'read-xml', 'read-text', 'list-sheets', 'export-csv'].includes(mode) &&
            !isMutate && <EmptyView />}
        </div>
      )
    }

    return (
      <div className="px-3 py-3">
        <EmptyView />
      </div>
    )
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-3xl border bg-card text-card-foreground">
        {/* macOS 风格标题栏（可点击折叠/展开） */}
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 bg-muted/50 px-3 py-2',
            isOpen && 'border-b',
          )}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <TrafficLights state={windowState} />
          <span className="truncate text-[10px] text-muted-foreground/60">
            {toolKind}
          </span>
          <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">
            {title}
          </span>
          <ChevronDownIcon
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-180',
            )}
          />
        </button>

        {/* Collapsible content */}
        {isOpen && (
          <>
            {renderContent()}

            {/* Approval footer */}
            {isMutate && isPending && approvalId ? (
              <div className="flex items-center justify-between border-t px-3 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {t('tool.excel.confirmAction')}
                </span>
                <ToolApprovalActions approvalId={approvalId} size="default" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
