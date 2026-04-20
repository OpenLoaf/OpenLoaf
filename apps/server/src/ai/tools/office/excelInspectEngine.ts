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
 * Excel inspect engine — 5 read-only actions.
 *
 *   inspectSummary — workbook overview, error sampling (≤ 5), render hint.
 *   inspectRead    — unified read across sheet / range / outline with limit.
 *   inspectTables  — tables + pivots + named ranges + data validations.
 *   inspectImages  — image manifest, optional extraction.
 *   inspectRender  — libreoffice-headless render of a sheet / range to PNG.
 *
 * Design notes:
 *   - CSV inputs are routed through `loadWorkbook` → virtual single-sheet
 *     workbook (sheet name "Sheet1"). Inspect APIs treat both formats the
 *     same.
 *   - Large workbooks: inspectRead applies a default `limit: 500` and sets
 *     `truncated: true` when exceeded. `all: true` lifts the cap.
 *   - Error sampling: inspectSummary walks every sheet but stops collecting
 *     samples at 5 — `errorCount` may still exceed the sample size.
 *   - Rendering: reuses the soffice resolver from docxInspectEngine so we do
 *     not maintain two probes.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type ExcelJS from 'exceljs'
import { loadWorkbook, parseRange } from './excelEngine'
import { resolveSofficeBinary } from './docxInspectEngine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InspectSummaryResult {
  sheetCount: number
  sheets: Array<{
    name: string
    rows: number
    cols: number
    hasFormulas: boolean
    isProtected: boolean
    hasMergedCells: boolean
  }>
  hasFormulas: boolean
  hasCharts: boolean
  hasMergedCells: boolean
  hasValidations: boolean
  isProtected: boolean
  errorCount: number
  errorSamples: Array<{ sheet: string; cell: string; error: string; formula?: string }>
  suggestedNextTool: string
}

export interface InspectReadCell {
  value?: unknown
  formula?: string
  computed?: unknown
  error?: string
}

export interface InspectReadResult {
  scope: 'sheet' | 'range' | 'outline'
  sheetName?: string
  range?: string
  rows: Array<Array<InspectReadCell | null>>
  totalRows: number
  truncated: boolean
}

export interface InspectTablesResult {
  tables: Array<{ sheet: string; name: string; range: string }>
  namedRanges: Array<{ name: string; value: string }>
  validations: Array<{ sheet: string; cell: string; type: string; detail: unknown }>
}

export interface InspectImageRecord {
  sheet: string
  index: number
  url?: string
  extension: string
  width?: number
  height?: number
}

export interface InspectImagesResult {
  images: InspectImageRecord[]
  assetDir?: string
}

export interface InspectRenderResult {
  pages: Array<{ url: string; width?: number; height?: number }>
}

const DEFAULT_READ_LIMIT = 500
const MAX_ERROR_SAMPLES = 5

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ExcelLibreOfficeUnavailableError extends Error {
  readonly code = 'LIBREOFFICE_UNAVAILABLE'
  constructor(
    message = 'LibreOffice (soffice) is not available on this host. Install LibreOffice to enable Excel rendering.',
  ) {
    super(message)
    this.name = 'ExcelLibreOfficeUnavailableError'
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FormulaInfo {
  formula: string
  result?: unknown
  error?: string
}

/**
 * exceljs cell values for formula cells come in the shape
 *   { formula, result } | { sharedFormula, result } | { formula: "…", result: { error: "#REF!" } }
 * with a `.formula` / `.result` / `.error` present on the *result* object.
 * Normalise so callers can treat them uniformly.
 */
function readCellView(cell: ExcelJS.Cell): InspectReadCell | null {
  // cell.type can be: null, string, number, boolean, formula, date, error, richText
  const value = cell.value
  if (value === null || value === undefined) return null

  if (typeof value === 'object' && value !== null) {
    const anyVal = value as unknown as Record<string, unknown>
    if ('formula' in anyVal || 'sharedFormula' in anyVal) {
      const formula = (anyVal.formula ?? anyVal.sharedFormula) as string | undefined
      const result = anyVal.result as unknown
      let error: string | undefined
      let computed: unknown = result
      if (result && typeof result === 'object' && 'error' in (result as Record<string, unknown>)) {
        error = (result as { error?: string }).error
        computed = undefined
      }
      return { formula: formula ?? '', computed, error }
    }
    if ('error' in anyVal) {
      return { error: anyVal.error as string }
    }
    if ('richText' in anyVal && Array.isArray((anyVal as { richText?: unknown[] }).richText)) {
      const richText = (anyVal as { richText: Array<{ text?: string }> }).richText
      return { value: richText.map((r) => r.text ?? '').join('') }
    }
    if (value instanceof Date) {
      return { value }
    }
    // Hyperlink etc. — fall through to text representation
    if ('text' in anyVal) return { value: anyVal.text }
  }

  return { value }
}

function readFormulaInfo(cell: ExcelJS.Cell): FormulaInfo | null {
  const value = cell.value
  if (!value || typeof value !== 'object') return null
  const anyVal = value as unknown as Record<string, unknown>
  if (!('formula' in anyVal || 'sharedFormula' in anyVal)) return null
  const formula = (anyVal.formula ?? anyVal.sharedFormula) as string
  const result = anyVal.result as unknown
  let error: string | undefined
  if (result && typeof result === 'object' && 'error' in (result as Record<string, unknown>)) {
    error = (result as { error?: string }).error
  }
  return { formula, result, error }
}

function sheetRowCount(ws: ExcelJS.Worksheet): number {
  // actualRowCount skips empty tail rows; rowCount includes them.
  const real = ws.actualRowCount ?? ws.rowCount
  return typeof real === 'number' ? real : 0
}

function sheetColCount(ws: ExcelJS.Worksheet): number {
  const c = ws.actualColumnCount ?? ws.columnCount
  return typeof c === 'number' ? c : 0
}

function sheetIsProtected(ws: ExcelJS.Worksheet): boolean {
  const proto = (ws as unknown as { sheetProtection?: unknown }).sheetProtection
  return proto !== undefined && proto !== null
}

function sheetHasMerges(ws: ExcelJS.Worksheet): boolean {
  const merges = (ws as unknown as { _merges?: Record<string, unknown> })._merges
  if (merges && typeof merges === 'object') {
    return Object.keys(merges).length > 0
  }
  return false
}

/**
 * Walk each used cell of each sheet with a callback. Uses worksheet.eachRow
 * which skips truly-empty rows.
 */
function eachUsedCell(
  wb: ExcelJS.Workbook,
  cb: (sheet: ExcelJS.Worksheet, cell: ExcelJS.Cell, addr: string) => void,
) {
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const rowNumber = (cell as unknown as { row: number }).row ?? row.number
        const addr = cell.address ?? colIndexToLetter(colNumber) + rowNumber
        cb(ws, cell, addr)
      })
    })
  })
}

function colIndexToLetter(idx: number): string {
  let n = idx
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

// ---------------------------------------------------------------------------
// Action: summary
// ---------------------------------------------------------------------------

export async function inspectSummary(opts: { filePath: string }): Promise<InspectSummaryResult> {
  const wb = await loadWorkbook(opts.filePath)

  let hasFormulas = false
  let hasMergedCells = false
  let hasValidations = false
  let isProtected = false
  let errorCount = 0
  const errorSamples: InspectSummaryResult['errorSamples'] = []
  const sheets: InspectSummaryResult['sheets'] = []

  wb.eachSheet((ws) => {
    const merged = sheetHasMerges(ws)
    const protectedFlag = sheetIsProtected(ws)
    let sheetHasFormulas = false

    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const f = readFormulaInfo(cell)
        if (f) {
          sheetHasFormulas = true
          hasFormulas = true
          if (f.error) {
            errorCount += 1
            if (errorSamples.length < MAX_ERROR_SAMPLES) {
              errorSamples.push({
                sheet: ws.name,
                cell: cell.address,
                error: f.error,
                formula: f.formula,
              })
            }
          }
        }
        // Direct error-typed cells (no formula)
        const v = cell.value
        if (v && typeof v === 'object' && 'error' in (v as unknown as Record<string, unknown>) && !f) {
          errorCount += 1
          if (errorSamples.length < MAX_ERROR_SAMPLES) {
            errorSamples.push({
              sheet: ws.name,
              cell: cell.address,
              error: String((v as unknown as { error: string }).error),
            })
          }
        }
      })
    })

    // Data validations live on worksheet.dataValidations
    const dv = (ws as unknown as { dataValidations?: { model?: Record<string, unknown> } })
      .dataValidations
    const dvModel = dv?.model
    const sheetHasValidations = !!dvModel && Object.keys(dvModel).length > 0
    if (sheetHasValidations) hasValidations = true

    if (merged) hasMergedCells = true
    if (protectedFlag) isProtected = true

    sheets.push({
      name: ws.name,
      rows: sheetRowCount(ws),
      cols: sheetColCount(ws),
      hasFormulas: sheetHasFormulas,
      isProtected: protectedFlag,
      hasMergedCells: merged,
    })
  })

  // Charts: exceljs doesn't expose chart count cleanly; probe workbook media
  // or _worksheet.model.charts.
  let hasCharts = false
  wb.eachSheet((ws) => {
    const model = (ws as unknown as { _charts?: unknown[]; model?: { charts?: unknown[] } })
    if (Array.isArray(model._charts) && model._charts.length > 0) hasCharts = true
    if (Array.isArray(model.model?.charts) && model.model.charts.length > 0) hasCharts = true
  })

  const suggestedNextTool = (() => {
    if (errorCount > 0) return 'JsSandbox + exceljs — resolve formula errors before export'
    if (hasFormulas) return 'ExcelInspect(read, scope=range) to inspect formulas in detail'
    if (sheets.length === 0) return 'JsSandbox + exceljs — workbook is empty, create it from scratch'
    return 'ExcelInspect(read, scope=sheet) to inspect data'
  })()

  return {
    sheetCount: sheets.length,
    sheets,
    hasFormulas,
    hasCharts,
    hasMergedCells,
    hasValidations,
    isProtected,
    errorCount,
    errorSamples,
    suggestedNextTool,
  }
}

// ---------------------------------------------------------------------------
// Action: read
// ---------------------------------------------------------------------------

export async function inspectRead(opts: {
  filePath: string
  scope: 'sheet' | 'range' | 'outline'
  sheetName?: string
  range?: string
  limit?: number
  offset?: number
  all?: boolean
  where?: string
  groupBy?: string[]
}): Promise<InspectReadResult> {
  const wb = await loadWorkbook(opts.filePath)

  if (opts.scope === 'outline') {
    let total = 0
    wb.eachSheet(() => {
      total += 1
    })
    return { scope: 'outline', rows: [], totalRows: total, truncated: false }
  }

  const sheetName = opts.sheetName
  if (!sheetName) throw new Error('sheetName is required for scope=sheet|range')
  const ws = wb.getWorksheet(sheetName)
  if (!ws) throw new Error(`SHEET_NOT_FOUND: ${sheetName}`)

  let startRow: number
  let endRow: number
  let startCol: number
  let endCol: number

  if (opts.scope === 'range') {
    if (!opts.range) throw new Error('range is required for scope=range')
    const p = parseRange(opts.range)
    startRow = p.startRow
    endRow = p.endRow
    startCol = p.startCol
    endCol = p.endCol
  } else {
    startRow = 1
    endRow = sheetRowCount(ws)
    startCol = 1
    endCol = sheetColCount(ws)
  }

  const totalRows = Math.max(0, endRow - startRow + 1)
  const limit = opts.all ? totalRows : (opts.limit ?? DEFAULT_READ_LIMIT)
  const offset = opts.offset ?? 0
  const effectiveStart = startRow + offset
  const effectiveEnd = Math.min(endRow, effectiveStart + limit - 1)
  const truncated = !opts.all && totalRows > (opts.limit ?? DEFAULT_READ_LIMIT)

  const rows: Array<Array<InspectReadCell | null>> = []
  for (let r = effectiveStart; r <= effectiveEnd; r++) {
    const cells: Array<InspectReadCell | null> = []
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c)
      cells.push(readCellView(cell))
    }
    rows.push(cells)
  }

  return {
    scope: opts.scope,
    sheetName,
    range: opts.range,
    rows,
    totalRows,
    truncated,
  }
}

// ---------------------------------------------------------------------------
// Action: tables
// ---------------------------------------------------------------------------

export async function inspectTables(opts: { filePath: string }): Promise<InspectTablesResult> {
  const wb = await loadWorkbook(opts.filePath)
  const tables: InspectTablesResult['tables'] = []
  const validations: InspectTablesResult['validations'] = []
  const namedRanges: InspectTablesResult['namedRanges'] = []

  // Tables (structured Excel tables)
  wb.eachSheet((ws) => {
    const tablesMap = (ws as unknown as { tables?: Record<string, { name: string; tableRef?: string; ref?: string }> })
      .tables
    if (tablesMap) {
      for (const [, t] of Object.entries(tablesMap)) {
        tables.push({ sheet: ws.name, name: t.name, range: t.tableRef ?? t.ref ?? '' })
      }
    }

    // Data validations — exceljs stores them as `dataValidations.model`, keyed by cell ref.
    const dv = (ws as unknown as { dataValidations?: { model?: Record<string, unknown> } })
      .dataValidations
    const dvModel = dv?.model
    if (dvModel) {
      for (const [addr, detail] of Object.entries(dvModel)) {
        const anyDetail = detail as { type?: string }
        validations.push({
          sheet: ws.name,
          cell: addr,
          type: anyDetail.type ?? 'unknown',
          detail,
        })
      }
    }
  })

  // Named ranges via workbook.definedNames
  const defined = (wb as unknown as {
    definedNames?: { model?: Array<{ name: string; ranges?: string[] }> }
  }).definedNames
  const dnModel = defined?.model
  if (Array.isArray(dnModel)) {
    for (const d of dnModel) {
      namedRanges.push({ name: d.name, value: (d.ranges ?? []).join(',') })
    }
  }

  return { tables, namedRanges, validations }
}

// ---------------------------------------------------------------------------
// Action: images
// ---------------------------------------------------------------------------

export async function inspectImages(opts: {
  filePath: string
  extractImages?: boolean
  assetDirAbsPath: string
  assetRelPrefix: string
}): Promise<InspectImagesResult> {
  const wb = await loadWorkbook(opts.filePath)
  const wbAny = wb as unknown as {
    media?: Array<{ name?: string; extension?: string; buffer?: Buffer; type?: string }>
  }
  const media = wbAny.media ?? []

  const images: InspectImageRecord[] = []

  if (opts.extractImages) {
    await fs.mkdir(opts.assetDirAbsPath, { recursive: true })
  }

  let index = 0
  for (const m of media) {
    if (m.type && m.type !== 'image') continue
    const ext = m.extension ?? 'png'
    const record: InspectImageRecord = {
      sheet: '',
      index,
      extension: ext,
    }
    if (opts.extractImages && m.buffer) {
      const fileName = `img-${index}.${ext}`
      const outPath = path.join(opts.assetDirAbsPath, fileName)
      await fs.writeFile(outPath, m.buffer)
      record.url = `${opts.assetRelPrefix}/${fileName}`
    }
    images.push(record)
    index += 1
  }

  return {
    images,
    assetDir: opts.extractImages ? opts.assetRelPrefix : undefined,
  }
}

// ---------------------------------------------------------------------------
// Action: render (libreoffice)
// ---------------------------------------------------------------------------

export async function inspectRender(opts: {
  filePath: string
  sheetName: string
  range?: string
  scale?: number
  assetDirAbsPath: string
  assetRelPrefix: string
}): Promise<InspectRenderResult> {
  const soffice = resolveSofficeBinary()
  if (!soffice) throw new ExcelLibreOfficeUnavailableError()

  await fs.mkdir(opts.assetDirAbsPath, { recursive: true })

  // Convert xlsx → pdf (whole workbook) → then extract page(s) to PNG via sharp.
  // Range filtering inside a specific sheet is best-effort (future work):
  // phase B treats `range` as a hint, not a hard filter, and still renders
  // the full sheet's page.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-render-'))
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-profile-'))
  try {
    await sofficeConvertToPdf(soffice, opts.filePath, tmpDir, profileDir)
    const baseName = path.basename(opts.filePath, path.extname(opts.filePath))
    const pdfPath = path.join(tmpDir, `${baseName}.pdf`)
    const pages = await renderPdfToPng(pdfPath, opts)
    return { pages }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {})
  }
}

function sofficeConvertToPdf(
  binary: string,
  inputPath: string,
  outDir: string,
  profileDir: string,
  timeoutMs = 60_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const userInstallArg = `-env:UserInstallation=file://${profileDir}`
    const proc = spawn(
      binary,
      [userInstallArg, '--headless', '--convert-to', 'pdf', inputPath, '--outdir', outDir],
      { stdio: 'ignore' },
    )
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error(`soffice convert-to-pdf timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`soffice exited with code ${code}`))
    })
  })
}

async function renderPdfToPng(
  pdfPath: string,
  opts: { assetDirAbsPath: string; assetRelPrefix: string; scale?: number },
): Promise<Array<{ url: string; width?: number; height?: number }>> {
  const scale = opts.scale ?? 2
  const pdfBuf = await fs.readFile(pdfPath)
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  const sharp = (await import('sharp')).default
  const lib = await PDFiumLibrary.init()
  const doc = await lib.loadDocument(new Uint8Array(pdfBuf))
  try {
    const pageCount = doc.getPageCount()
    const pages: Array<{ url: string; width?: number; height?: number }> = []
    for (let p = 1; p <= pageCount; p++) {
      const pdfPage = doc.getPage(p - 1)
      const rendered = await pdfPage.render({ scale, render: 'bitmap' })
      const { width, height, data: bgra } = rendered
      const png = await sharp(Buffer.from(bgra), {
        raw: { width, height, channels: 4 },
      })
        .png()
        .toBuffer()
      const fileName = `render-p${p}-s${scale}.png`
      await fs.writeFile(path.join(opts.assetDirAbsPath, fileName), png)
      pages.push({
        url: `${opts.assetRelPrefix}/${fileName}`,
        width,
        height,
      })
    }
    return pages
  } finally {
    doc.destroy()
    lib.destroy()
  }
}
