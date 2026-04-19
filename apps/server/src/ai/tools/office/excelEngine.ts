/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Excel engine — low-level workbook loader shared by Inspect + Mutate engines.
 *
 * Responsibilities:
 *   - Load an XLSX / CSV file into an exceljs Workbook.
 *   - For .csv: dispatch to papaparse → build a virtual single-sheet workbook
 *     with sheet name "Sheet1" so downstream code can treat both formats
 *     uniformly.
 *   - Guard against obviously-bad inputs (missing file, wrong extension,
 *     corrupted payload) with clear errors.
 *
 * Higher-level read / write semantics live in:
 *   - excelInspectEngine.ts  (summary / read / tables / images / render)
 *   - excelEngine.ts (mutate helpers, later phase C)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import type {
  CellSpec,
  CellStyleObject,
  ExcelMutateInput,
  ExcelMutateOutput,
  StylePreset,
  Validation,
} from '@openloaf/api/types/tools/excel'
import { resolvePreset } from './excelStylePresets'

export const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.csv', '.tsv'])

export function isCsvLike(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return ext === '.csv' || ext === '.tsv'
}

export class ExcelUnsupportedExtensionError extends Error {
  readonly code = 'UNSUPPORTED_EXTENSION'
  constructor(ext: string) {
    super(`Unsupported file extension: ${ext}. Expected one of .xlsx, .xlsm, .csv, .tsv`)
    this.name = 'ExcelUnsupportedExtensionError'
  }
}

export class ExcelCorruptedFileError extends Error {
  readonly code = 'CORRUPTED_FILE'
  constructor(message: string) {
    super(`Corrupted or unreadable spreadsheet: ${message}`)
    this.name = 'ExcelCorruptedFileError'
  }
}

/**
 * Load a spreadsheet into an exceljs Workbook.
 *
 * Throws:
 *   - ENOENT-style Error when the file does not exist (surfaces fs.stat error).
 *   - ExcelUnsupportedExtensionError for unknown extensions.
 *   - ExcelCorruptedFileError when exceljs fails to parse.
 */
export async function loadWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const absPath = path.resolve(filePath)
  await fs.access(absPath) // throws ENOENT if missing

  const ext = path.extname(absPath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new ExcelUnsupportedExtensionError(ext || '(none)')
  }

  if (isCsvLike(absPath)) {
    return loadCsvAsWorkbook(absPath)
  }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.readFile(absPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new ExcelCorruptedFileError(msg)
  }
  return wb
}

async function loadCsvAsWorkbook(absPath: string): Promise<ExcelJS.Workbook> {
  const delimiter = path.extname(absPath).toLowerCase() === '.tsv' ? '\t' : ','
  const raw = await fs.readFile(absPath, 'utf8')
  const parsed = Papa.parse<string[]>(raw, {
    delimiter,
    skipEmptyLines: true,
  })
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!
    throw new ExcelCorruptedFileError(`CSV parse error: ${first.message}`)
  }
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  for (const row of parsed.data) {
    ws.addRow(row)
  }
  // Mark virtual origin so callers can report meta.upgradedFrom if they write back.
  ;(wb as unknown as { __csvOrigin?: string }).__csvOrigin = absPath
  return wb
}

/**
 * Convert a column index (1-based) to an Excel letter like `A`, `Z`, `AA`.
 */
export function colIndexToLetter(idx: number): string {
  let n = idx
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/**
 * Parse an Excel letter like `A`, `Z`, `AA` into a 1-based column index.
 */
export function letterToColIndex(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n
}

export interface ParsedRange {
  startCol: number
  startRow: number
  endCol: number
  endRow: number
}

/** Parse `A1:B2` into 1-based col/row bounds. */
export function parseRange(range: string): ParsedRange {
  const m = range.match(/^([A-Z]+)([1-9][0-9]*):([A-Z]+)([1-9][0-9]*)$/)
  if (!m) throw new Error(`Invalid range: ${range}`)
  return {
    startCol: letterToColIndex(m[1]!),
    startRow: Number(m[2]),
    endCol: letterToColIndex(m[3]!),
    endRow: Number(m[4]),
  }
}

// ===========================================================================
// Mutate engine (phase C)
// ===========================================================================

/**
 * Error class for Mutate-side failures. Code is one of the documented
 * error codes in the xlsx skill plan (§5):
 *   VALUE_FORMULA_CONFLICT | MERGED_CELL_WRITE | PROTECTED_WORKBOOK |
 *   SHEET_NOT_FOUND | RANGE_OUT_OF_BOUNDS | CHART_RANGE_INVALID |
 *   CSV_UPGRADE_TO_XLSX | IMAGE_READ_FAILED | STRUCTURE_OP_INVALID
 */
export class ExcelMutateError extends Error {
  code: string
  hint?: string
  constructor(code: string, message: string, hint?: string) {
    super(message)
    this.name = 'ExcelMutateError'
    this.code = code
    this.hint = hint
  }
}

function parseCellRef(addr: string): { col: number; row: number } {
  const m = addr.match(/^([A-Z]+)([1-9][0-9]*)$/)
  if (!m) throw new ExcelMutateError('RANGE_OUT_OF_BOUNDS', `Invalid cell ref: ${addr}`)
  return { col: letterToColIndex(m[1]!), row: Number(m[2]) }
}

function isStylePreset(value: unknown): value is StylePreset {
  return (
    value === 'HEADER' || value === 'TOTAL' || value === 'INPUT' || value === 'ASSUMPTION'
  )
}

function resolveCellStyle(style: CellSpec['style']): CellStyleObject | undefined {
  if (!style) return undefined
  if (isStylePreset(style)) return resolvePreset(style)
  return style
}

function applyStyleToCell(cell: ExcelJS.Cell, style: CellStyleObject) {
  if (style.font) {
    const f = style.font
    const prev = cell.font ?? {}
    cell.font = {
      ...prev,
      ...(f.family !== undefined ? { name: f.family } : {}),
      ...(f.size !== undefined ? { size: f.size } : {}),
      ...(f.bold !== undefined ? { bold: f.bold } : {}),
      ...(f.italic !== undefined ? { italic: f.italic } : {}),
      ...(f.color !== undefined ? { color: { argb: `FF${f.color}` } } : {}),
    } as ExcelJS.Font
  }
  if (style.fill) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${style.fill}` },
    } as ExcelJS.FillPattern
  }
  const align = cell.alignment ?? {}
  let touchedAlign = false
  const nextAlign: ExcelJS.Alignment = { ...(align as ExcelJS.Alignment) }
  if (style.align) {
    nextAlign.horizontal = style.align
    touchedAlign = true
  }
  if (style.verticalAlign) {
    nextAlign.vertical =
      style.verticalAlign === 'middle' ? 'middle' : (style.verticalAlign as 'top' | 'bottom')
    touchedAlign = true
  }
  if (style.wrap !== undefined) {
    nextAlign.wrapText = style.wrap
    touchedAlign = true
  }
  if (touchedAlign) cell.alignment = nextAlign
  if (style.border) {
    const bord: ExcelJS.Borders = (cell.border ?? {}) as ExcelJS.Borders
    const toEdge = (e: { style?: string; color?: string } | undefined) =>
      e && e.style && e.style !== 'none'
        ? ({
            style: e.style as ExcelJS.BorderStyle,
            ...(e.color ? { color: { argb: `FF${e.color}` } } : {}),
          } as ExcelJS.Border)
        : undefined
    cell.border = {
      ...bord,
      ...(style.border.top !== undefined ? { top: toEdge(style.border.top) } : {}),
      ...(style.border.bottom !== undefined ? { bottom: toEdge(style.border.bottom) } : {}),
      ...(style.border.left !== undefined ? { left: toEdge(style.border.left) } : {}),
      ...(style.border.right !== undefined ? { right: toEdge(style.border.right) } : {}),
    } as ExcelJS.Borders
  }
}

function applyValidationToCell(cell: ExcelJS.Cell, v: Validation) {
  switch (v.type) {
    case 'list':
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${v.values.join(',')}"`],
      } as ExcelJS.DataValidation
      break
    case 'date': {
      const formulae: Array<Date | string> = []
      if (v.min) formulae.push(new Date(v.min))
      if (v.max) formulae.push(new Date(v.max))
      cell.dataValidation = {
        type: 'date',
        operator: formulae.length === 2 ? 'between' : formulae.length === 1 ? 'greaterThan' : 'between',
        formulae: formulae.length ? formulae : [new Date('1900-01-01')],
      } as unknown as ExcelJS.DataValidation
      break
    }
    case 'whole':
    case 'decimal': {
      const formulae: number[] = []
      if (v.min !== undefined) formulae.push(v.min)
      if (v.max !== undefined) formulae.push(v.max)
      cell.dataValidation = {
        type: v.type,
        operator: formulae.length === 2 ? 'between' : formulae.length === 1 ? 'greaterThan' : 'between',
        formulae: formulae.length ? formulae : [0],
      } as unknown as ExcelJS.DataValidation
      break
    }
    case 'custom':
      cell.dataValidation = {
        type: 'custom',
        formulae: [v.formula],
      } as unknown as ExcelJS.DataValidation
      break
  }
}

function assertNoValueFormulaConflict(addr: string, spec: CellSpec) {
  if (spec.value !== undefined && spec.formula !== undefined) {
    throw new ExcelMutateError(
      'VALUE_FORMULA_CONFLICT',
      `Cell ${addr}: value and formula are mutually exclusive`,
      'Pick either value or formula, not both.',
    )
  }
}

function isMergedNonAnchor(ws: ExcelJS.Worksheet, addr: string): boolean {
  const merges = (ws as unknown as { _merges?: Record<string, { model?: { top: number; left: number; bottom: number; right: number } }> })._merges
  if (!merges) return false
  const cellRef = parseCellRef(addr)
  for (const key of Object.keys(merges)) {
    const m = merges[key]?.model
    if (!m) continue
    // ExcelJS uses {top,left,bottom,right} 1-based
    const inside = cellRef.row >= m.top && cellRef.row <= m.bottom && cellRef.col >= m.left && cellRef.col <= m.right
    if (!inside) continue
    const isAnchor = cellRef.row === m.top && cellRef.col === m.left
    if (!isAnchor) return true
  }
  return false
}

function writeCellValue(cell: ExcelJS.Cell, spec: CellSpec) {
  if (spec.formula !== undefined) {
    const f = spec.formula.startsWith('=') ? spec.formula.slice(1) : spec.formula
    cell.value = { formula: f } as ExcelJS.CellValue
  } else if (spec.value !== undefined) {
    cell.value = spec.value as ExcelJS.CellValue
  }
  if (spec.numberFormat) cell.numFmt = spec.numberFormat
  const style = resolveCellStyle(spec.style)
  if (style) applyStyleToCell(cell, style)
  if (spec.comment) {
    cell.note = { texts: [{ text: spec.comment }] } as unknown as ExcelJS.Comment
  }
  if (spec.validation) applyValidationToCell(cell, spec.validation)
}

function applyConditionalFormatRules(
  ws: ExcelJS.Worksheet,
  rules: Array<
    | { type: 'dataBar'; range: string; color?: string }
    | { type: 'colorScale'; range: string; min?: string; mid?: string; max?: string }
    | { type: 'formula'; range: string; formula: string; style?: CellStyleObject }
  >,
) {
  const wsAny = ws as unknown as {
    addConditionalFormatting: (cf: unknown) => void
  }
  if (typeof wsAny.addConditionalFormatting !== 'function') return
  for (const rule of rules) {
    if (rule.type === 'dataBar') {
      wsAny.addConditionalFormatting({
        ref: rule.range,
        rules: [
          {
            type: 'dataBar',
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: { argb: `FF${rule.color ?? '3B82F6'}` },
            gradient: true,
          },
        ],
      })
    } else if (rule.type === 'colorScale') {
      wsAny.addConditionalFormatting({
        ref: rule.range,
        rules: [
          {
            type: 'colorScale',
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: [
              { argb: `FF${rule.min ?? 'FFFFFF'}` },
              { argb: `FF${rule.max ?? '63BE7B'}` },
            ],
          },
        ],
      })
    } else if (rule.type === 'formula') {
      const style = rule.style
      const fill = style?.fill
        ? ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${style.fill}` } } as ExcelJS.FillPattern)
        : undefined
      wsAny.addConditionalFormatting({
        ref: rule.range,
        rules: [
          {
            type: 'expression',
            formulae: [rule.formula],
            style: {
              ...(fill ? { fill } : {}),
            },
          },
        ],
      })
    }
  }
}

function addChartToSheet(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  opts: { type: 'bar' | 'line' | 'pie'; dataRange: string; anchor: string; title?: string },
) {
  // exceljs chart support is limited. We wire a minimal chart via the
  // low-level worksheet `_charts` array. If the library update cycle adds
  // stronger chart APIs later, this helper can move to a typed path.
  const rangeHasSheet = opts.dataRange.includes('!')
  const rangeOnly = rangeHasSheet ? opts.dataRange.split('!')[1]! : opts.dataRange
  const sheetName = rangeHasSheet ? opts.dataRange.split('!')[0]! : ws.name
  const p = parseRange(rangeOnly)
  const anchor = parseCellRef(opts.anchor)
  const chartObj = {
    type: opts.type,
    title: opts.title ?? '',
    anchor: { type: 'oneCellAnchor', tl: { col: anchor.col - 1, row: anchor.row - 1 } },
    dataRange: {
      sheet: sheetName,
      startRow: p.startRow,
      startCol: p.startCol,
      endRow: p.endRow,
      endCol: p.endCol,
    },
  }
  const wsAny = ws as unknown as { _charts?: unknown[] }
  if (!Array.isArray(wsAny._charts)) wsAny._charts = []
  wsAny._charts.push(chartObj)
  // Also ensure workbook has a charts collection (some versions of exceljs
  // consult the worksheet model during serialisation — this mutation is
  // best-effort because exceljs writing charts is known to be unreliable).
  void wb
}

async function loadImageSource(source: string): Promise<{ buffer: Buffer; extension: 'png' | 'jpeg' | 'gif' }> {
  // Support URLs (http / https / data:) and local file paths.
  if (/^data:/.test(source)) {
    const m = source.match(/^data:([^;]+);base64,(.*)$/)
    if (!m) throw new ExcelMutateError('IMAGE_READ_FAILED', 'Invalid data URL')
    const mime = m[1]!
    const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpeg' : mime.includes('gif') ? 'gif' : 'png'
    return { buffer: Buffer.from(m[2]!, 'base64'), extension: ext }
  }
  if (/^https?:/.test(source)) {
    const resp = await fetch(source)
    if (!resp.ok) {
      throw new ExcelMutateError('IMAGE_READ_FAILED', `HTTP ${resp.status}: ${source}`)
    }
    const buf = Buffer.from(await resp.arrayBuffer())
    const ct = resp.headers.get('content-type') ?? ''
    const ext = ct.includes('jpeg') ? 'jpeg' : ct.includes('gif') ? 'gif' : 'png'
    return { buffer: buf, extension: ext }
  }
  try {
    const buf = await fs.readFile(source)
    const ext = path.extname(source).toLowerCase()
    const extension = ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : ext === '.gif' ? 'gif' : 'png'
    return { buffer: buf, extension }
  } catch (err) {
    throw new ExcelMutateError(
      'IMAGE_READ_FAILED',
      `Failed to read image source: ${String((err as Error).message)}`,
    )
  }
}

function detectCsvUpgradeNeeded(wb: ExcelJS.Workbook): boolean {
  // Any formula, any merged cell, any chart, >1 sheet forces xlsx.
  let sheets = 0
  let hasFormulas = false
  let hasMerge = false
  let hasChart = false
  wb.eachSheet((ws) => {
    sheets += 1
    const merges = (ws as unknown as { _merges?: Record<string, unknown> })._merges
    if (merges && Object.keys(merges).length > 0) hasMerge = true
    const charts = (ws as unknown as { _charts?: unknown[] })._charts
    if (Array.isArray(charts) && charts.length > 0) hasChart = true
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value
        if (v && typeof v === 'object') {
          const obj = v as unknown as Record<string, unknown>
          if ('formula' in obj || 'sharedFormula' in obj) hasFormulas = true
        }
      })
    })
  })
  return hasFormulas || hasMerge || hasChart || sheets > 1
}

async function writeWorkbookMaybeUpgraded(
  wb: ExcelJS.Workbook,
  originalPath: string,
): Promise<{ filePath: string; upgradedFromCsv: boolean }> {
  const ext = path.extname(originalPath).toLowerCase()
  if (ext === '.csv' || ext === '.tsv') {
    const csvOrigin = (wb as unknown as { __csvOrigin?: string }).__csvOrigin ?? originalPath
    if (detectCsvUpgradeNeeded(wb)) {
      const upgraded = csvOrigin.replace(/\.(csv|tsv)$/i, '.xlsx')
      await wb.xlsx.writeFile(upgraded)
      return { filePath: upgraded, upgradedFromCsv: true }
    }
    // keep csv shape
    const ws = wb.worksheets[0]!
    const lines: string[] = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value
        cells.push(v === null || v === undefined ? '' : String(v))
      })
      lines.push(cells.join(ext === '.tsv' ? '\t' : ','))
    })
    await fs.writeFile(originalPath, `${lines.join('\n')}\n`, 'utf8')
    return { filePath: originalPath, upgradedFromCsv: false }
  }
  await wb.xlsx.writeFile(originalPath)
  return { filePath: originalPath, upgradedFromCsv: false }
}

// ---------------------------------------------------------------------------
// Per-action implementations
// ---------------------------------------------------------------------------

async function doCreate(input: Extract<ExcelMutateInput, { action: 'create' }>): Promise<ExcelMutateOutput> {
  const wb = new ExcelJS.Workbook()
  for (const sheetSpec of input.sheets) {
    const ws = wb.addWorksheet(sheetSpec.name)
    for (const [addr, rawSpec] of Object.entries(sheetSpec.cells ?? {})) {
      const spec = rawSpec as CellSpec
      assertNoValueFormulaConflict(addr, spec)
      writeCellValue(ws.getCell(addr), spec)
    }
    if (sheetSpec.merges) {
      for (const r of sheetSpec.merges) ws.mergeCells(r)
    }
    if (sheetSpec.freeze) {
      ws.views = [
        {
          state: 'frozen',
          xSplit: sheetSpec.freeze.cols ?? 0,
          ySplit: sheetSpec.freeze.rows ?? 0,
        },
      ]
    }
    if (sheetSpec.columnWidths) {
      for (const [letter, width] of Object.entries(sheetSpec.columnWidths)) {
        ws.getColumn(letter).width = width
      }
    }
    if (sheetSpec.conditionalFormats) {
      applyConditionalFormatRules(ws, sheetSpec.conditionalFormats)
    }
  }
  if (input.charts) {
    for (const ch of input.charts) {
      const ws = wb.getWorksheet(ch.sheetName)
      if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Chart target sheet not found: ${ch.sheetName}`)
      addChartToSheet(wb, ws, ch)
    }
  }
  if (input.images) {
    for (const im of input.images) {
      const ws = wb.getWorksheet(im.sheetName)
      if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Image target sheet not found: ${im.sheetName}`)
      const { buffer, extension } = await loadImageSource(im.source)
      const imageId = wb.addImage({ buffer: buffer as unknown as ArrayBuffer, extension })
      const a = parseCellRef(im.anchor)
      ws.addImage(imageId, {
        tl: { col: a.col - 1, row: a.row - 1 },
        ext: { width: im.widthPx ?? 120, height: im.heightPx ?? 80 },
      })
    }
  }
  await wb.xlsx.writeFile(input.filePath)
  return {
    ok: true,
    action: 'create',
    data: { filePath: input.filePath },
  }
}

async function doUpdate(input: Extract<ExcelMutateInput, { action: 'update' }>): Promise<ExcelMutateOutput> {
  const wb = await loadWorkbook(input.filePath)
  const ws = wb.getWorksheet(input.sheetName)
  if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Sheet not found: ${input.sheetName}`)
  if (sheetProtection(ws)) {
    throw new ExcelMutateError(
      'PROTECTED_WORKBOOK',
      `Sheet "${input.sheetName}" is protected`,
      'Unprotect the sheet in Excel, or ask the user for the password.',
    )
  }
  for (const [addr, rawSpec] of Object.entries(input.cells)) {
    const spec = rawSpec as CellSpec
    assertNoValueFormulaConflict(addr, spec)
    if (isMergedNonAnchor(ws, addr)) {
      throw new ExcelMutateError(
        'MERGED_CELL_WRITE',
        `Cell ${addr} is inside a merged range but is not the top-left anchor`,
        'Write to the top-left cell or unmerge the range first.',
      )
    }
    writeCellValue(ws.getCell(addr), spec)
  }
  if (input.unmerges) {
    for (const r of input.unmerges) ws.unMergeCells(r)
  }
  if (input.merges) {
    for (const r of input.merges) ws.mergeCells(r)
  }
  const { filePath, upgradedFromCsv } = await writeWorkbookMaybeUpgraded(wb, input.filePath)
  const meta: Record<string, unknown> = {}
  if (upgradedFromCsv) meta.upgradedFrom = 'csv'
  return {
    ok: true,
    action: 'update',
    data: { filePath },
    ...(Object.keys(meta).length ? { meta } : {}),
  }
}

function sheetProtection(ws: ExcelJS.Worksheet): boolean {
  const proto = (ws as unknown as { sheetProtection?: unknown }).sheetProtection
  return proto !== undefined && proto !== null
}

async function doStructure(input: Extract<ExcelMutateInput, { action: 'structure' }>): Promise<ExcelMutateOutput> {
  const wb = await loadWorkbook(input.filePath)
  const { op, target } = input
  if (target === 'sheet') {
    if (op === 'insert') {
      const name = input.to
      if (!name) throw new ExcelMutateError('STRUCTURE_OP_INVALID', 'insert sheet requires `to` name')
      if (wb.getWorksheet(name)) {
        throw new ExcelMutateError('STRUCTURE_OP_INVALID', `Sheet already exists: ${name}`)
      }
      wb.addWorksheet(name)
    } else if (op === 'delete') {
      if (!input.sheetName) throw new ExcelMutateError('STRUCTURE_OP_INVALID', 'delete sheet requires sheetName')
      const ws = wb.getWorksheet(input.sheetName)
      if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Sheet not found: ${input.sheetName}`)
      wb.removeWorksheet(ws.id)
    } else if (op === 'rename') {
      if (!input.from || !input.to) {
        throw new ExcelMutateError('STRUCTURE_OP_INVALID', 'rename sheet requires from + to')
      }
      const ws = wb.getWorksheet(input.from)
      if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Sheet not found: ${input.from}`)
      ws.name = input.to
    }
  } else {
    // row / col
    if (!input.sheetName) {
      throw new ExcelMutateError('STRUCTURE_OP_INVALID', 'row/col structure op requires sheetName')
    }
    const ws = wb.getWorksheet(input.sheetName)
    if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Sheet not found: ${input.sheetName}`)
    const at = input.at
    const count = input.count ?? 1
    if (at === undefined) throw new ExcelMutateError('STRUCTURE_OP_INVALID', 'row/col op requires at')
    if (op === 'insert') {
      if (target === 'row') ws.spliceRows(at, 0, ...Array.from({ length: count }, () => []))
      else ws.spliceColumns(at, 0, ...Array.from({ length: count }, () => []))
    } else if (op === 'delete') {
      if (target === 'row') ws.spliceRows(at, count)
      else ws.spliceColumns(at, count)
    } else {
      throw new ExcelMutateError('STRUCTURE_OP_INVALID', `Invalid op for ${target}: ${op}`)
    }
  }
  await wb.xlsx.writeFile(input.filePath)
  return {
    ok: true,
    action: 'structure',
    data: { filePath: input.filePath },
  }
}

async function doLayout(input: Extract<ExcelMutateInput, { action: 'layout' }>): Promise<ExcelMutateOutput> {
  const wb = await loadWorkbook(input.filePath)
  const ws = wb.getWorksheet(input.sheetName)
  if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Sheet not found: ${input.sheetName}`)
  if (input.freeze) {
    ws.views = [
      {
        state: 'frozen',
        xSplit: input.freeze.cols ?? 0,
        ySplit: input.freeze.rows ?? 0,
      },
    ]
  }
  if (input.autoFilter) {
    ws.autoFilter = input.autoFilter.range
  }
  if (input.columnWidths) {
    for (const [letter, w] of Object.entries(input.columnWidths)) {
      ws.getColumn(letter).width = w
    }
  }
  if (input.rowHeights) {
    for (const [rowStr, h] of Object.entries(input.rowHeights)) {
      const rowNumber = Number(rowStr)
      if (!Number.isFinite(rowNumber) || rowNumber < 1) continue
      ws.getRow(rowNumber).height = h
    }
  }
  if (input.printArea) {
    ws.pageSetup = { ...(ws.pageSetup ?? {}), printArea: input.printArea }
  }
  if (input.sort && input.sort.length > 0) {
    // Determine header row by existing autoFilter, else first row.
    const headerRow = 1
    const colLetterToIdx = (l: string) => letterToColIndex(l)
    const actualRows = ws.actualRowCount ?? ws.rowCount
    const rowsData: Array<{ values: unknown[]; styles: Array<Record<string, unknown>> }> = []
    for (let r = headerRow + 1; r <= actualRows; r++) {
      const row = ws.getRow(r)
      const values: unknown[] = []
      const styles: Array<Record<string, unknown>> = []
      const cols = ws.actualColumnCount ?? ws.columnCount
      for (let c = 1; c <= cols; c++) {
        const cell = row.getCell(c)
        values.push(cell.value)
        styles.push({ numFmt: cell.numFmt, font: cell.font, fill: cell.fill, alignment: cell.alignment, border: cell.border })
      }
      rowsData.push({ values, styles })
    }
    rowsData.sort((a, b) => {
      for (const sp of input.sort!) {
        const idx = colLetterToIdx(sp.column) - 1
        const av = a.values[idx]
        const bv = b.values[idx]
        const cmp = compareCellValues(av, bv)
        if (cmp !== 0) return sp.order === 'desc' ? -cmp : cmp
      }
      return 0
    })
    // write back
    for (let i = 0; i < rowsData.length; i++) {
      const r = headerRow + 1 + i
      const row = ws.getRow(r)
      const cols = ws.actualColumnCount ?? ws.columnCount
      for (let c = 1; c <= cols; c++) {
        const cell = row.getCell(c)
        cell.value = rowsData[i]!.values[c - 1] as ExcelJS.CellValue
        const st = rowsData[i]!.styles[c - 1]!
        if (st.numFmt) cell.numFmt = st.numFmt as string
        if (st.font) cell.font = st.font as ExcelJS.Font
        if (st.fill) cell.fill = st.fill as ExcelJS.Fill
        if (st.alignment) cell.alignment = st.alignment as ExcelJS.Alignment
        if (st.border) cell.border = st.border as ExcelJS.Borders
      }
    }
  }
  await wb.xlsx.writeFile(input.filePath)
  return {
    ok: true,
    action: 'layout',
    data: { filePath: input.filePath },
  }
}

function compareCellValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

async function doFormatRules(input: Extract<ExcelMutateInput, { action: 'format-rules' }>): Promise<ExcelMutateOutput> {
  const wb = await loadWorkbook(input.filePath)
  const ws = wb.getWorksheet(input.sheetName)
  if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Sheet not found: ${input.sheetName}`)
  applyConditionalFormatRules(ws, input.rules)
  await wb.xlsx.writeFile(input.filePath)
  return {
    ok: true,
    action: 'format-rules',
    data: { filePath: input.filePath },
  }
}

async function doAddChart(input: Extract<ExcelMutateInput, { action: 'add-chart' }>): Promise<ExcelMutateOutput> {
  const wb = await loadWorkbook(input.filePath)
  const ws = wb.getWorksheet(input.sheetName)
  if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Sheet not found: ${input.sheetName}`)
  // Validate range fits inside the source sheet (or cross-sheet target).
  const rangeHasSheet = input.dataRange.includes('!')
  const sheetForRange = rangeHasSheet ? input.dataRange.split('!')[0]! : input.sheetName
  const rangeOnly = rangeHasSheet ? input.dataRange.split('!')[1]! : input.dataRange
  const p = parseRange(rangeOnly)
  const targetWs = wb.getWorksheet(sheetForRange)
  if (!targetWs) {
    throw new ExcelMutateError('CHART_RANGE_INVALID', `Chart dataRange refers to unknown sheet: ${sheetForRange}`)
  }
  const rowCount = targetWs.actualRowCount ?? targetWs.rowCount ?? 0
  const colCount = targetWs.actualColumnCount ?? targetWs.columnCount ?? 0
  if (rowCount === 0 || colCount === 0) {
    throw new ExcelMutateError('CHART_RANGE_INVALID', `Chart dataRange targets empty sheet: ${sheetForRange}`)
  }
  if (p.endRow > rowCount || p.endCol > colCount) {
    throw new ExcelMutateError(
      'CHART_RANGE_INVALID',
      `Chart dataRange ${input.dataRange} exceeds sheet bounds (${rowCount} rows × ${colCount} cols)`,
    )
  }
  addChartToSheet(wb, ws, {
    type: input.type,
    dataRange: input.dataRange,
    anchor: input.anchor,
    title: input.title,
  })
  await wb.xlsx.writeFile(input.filePath)
  return {
    ok: true,
    action: 'add-chart',
    data: { filePath: input.filePath },
  }
}

async function doAddImage(input: Extract<ExcelMutateInput, { action: 'add-image' }>): Promise<ExcelMutateOutput> {
  const wb = await loadWorkbook(input.filePath)
  const ws = wb.getWorksheet(input.sheetName)
  if (!ws) throw new ExcelMutateError('SHEET_NOT_FOUND', `Sheet not found: ${input.sheetName}`)
  const { buffer, extension } = await loadImageSource(input.source)
  const id = wb.addImage({ buffer: buffer as unknown as ArrayBuffer, extension })
  const a = parseCellRef(input.anchor)
  ws.addImage(id, {
    tl: { col: a.col - 1, row: a.row - 1 },
    ext: { width: input.widthPx ?? 120, height: input.heightPx ?? 80 },
  })
  await wb.xlsx.writeFile(input.filePath)
  return {
    ok: true,
    action: 'add-image',
    data: { filePath: input.filePath },
  }
}

/**
 * Main mutate entry point. Dispatches on `action`. Throws ExcelMutateError
 * with a structured `code` for every documented failure mode.
 *
 * Note: `recalc` is NOT handled here — it lives in `excelRecalc.ts` and is
 * wired in phase D.
 */
export async function applyMutate(input: ExcelMutateInput): Promise<ExcelMutateOutput> {
  switch (input.action) {
    case 'create':
      return doCreate(input)
    case 'update':
      return doUpdate(input)
    case 'structure':
      return doStructure(input)
    case 'layout':
      return doLayout(input)
    case 'format-rules':
      return doFormatRules(input)
    case 'add-chart':
      return doAddChart(input)
    case 'add-image':
      return doAddImage(input)
    case 'recalc':
      throw new ExcelMutateError(
        'STRUCTURE_OP_INVALID',
        'recalc must be dispatched through excelRecalc.recalc(), not applyMutate()',
      )
    default: {
      // exhaustiveness — the schema already rejects unknown actions.
      const _exhaust: never = input
      throw new Error(`Unknown action: ${String((_exhaust as { action: string }).action)}`)
    }
  }
}
