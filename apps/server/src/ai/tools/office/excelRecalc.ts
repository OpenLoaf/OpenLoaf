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
 * Excel recalc engine.
 *
 *   recalc(filePath, mode?): RecalcResult
 *     mode: 'auto' | 'simple' | 'libreoffice'
 *       auto        — prefer libreoffice when `soffice` is resolvable;
 *                     fall back to simple on timeout or missing binary
 *       simple      — pure JS (@formulajs/formulajs), only the shallow
 *                     `=FN(range|args)` shape; can't resolve arbitrary A1
 *                     ASTs. Good enough for single-sheet SUM/AVG/IF/etc.
 *       libreoffice — headless soffice round-trips the file, which
 *                     resolves every formula the real engine can.
 *
 *   The return always carries:
 *     { ok, mode, errorCount, errors, warnings }
 *   where `errors[]` is populated whether recalc succeeded or not — the
 *   caller uses this to guide fix-up flows.
 *
 * Error types recognised when scanning: #REF! / #DIV/0! / #VALUE! /
 *   #NAME? / #N/A / #NULL! / #NUM!
 *
 * Cross-file refs (e.g. `'[Book2.xlsx]Sheet1'!A1`) are **not** rewritten —
 *   recalc leaves them untouched and adds a `CROSS_FILE_REF_IGNORED`
 *   warning per occurrence.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import ExcelJS from 'exceljs'
import * as formulajs from '@formulajs/formulajs'
import { loadWorkbook, parseRange, letterToColIndex } from './excelEngine'
import { resolveSofficeBinary } from './docxInspectEngine'

export type RecalcMode = 'auto' | 'simple' | 'libreoffice'

export interface RecalcErrorRecord {
  sheet: string
  cell: string
  type: string
  formula?: string
}

export interface RecalcResult {
  ok: boolean
  mode: 'simple' | 'libreoffice'
  errorCount: number
  errors: RecalcErrorRecord[]
  warnings: string[]
}

export class ExcelRecalcError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ExcelRecalcError'
    this.code = code
  }
}

const CROSS_FILE_RE = /'?\[[^\]]+\][^'!]+'?!/

const ERROR_TOKENS = ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#N/A', '#NULL!', '#NUM!']

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function recalc(filePath: string, mode: RecalcMode = 'auto'): Promise<RecalcResult> {
  const sofficePath = resolveSofficeBinary()
  if (mode === 'libreoffice' && !sofficePath) {
    throw new ExcelRecalcError(
      'LIBREOFFICE_UNAVAILABLE',
      'LibreOffice (soffice) is not available on this host. Install LibreOffice or pass mode="simple".',
    )
  }

  const warnings: string[] = []

  // Pre-scan for cross-file refs — we'll warn once per occurrence and skip
  // them during simple-mode evaluation.
  const crossFileHits = await collectCrossFileRefs(filePath)
  for (const hit of crossFileHits) {
    warnings.push(`CROSS_FILE_REF_IGNORED: ${hit.sheet}!${hit.cell} → ${hit.formula}`)
  }

  const pickLibreOffice = mode === 'libreoffice' || (mode === 'auto' && !!sofficePath)

  if (pickLibreOffice) {
    try {
      await runLibreOfficeRecalc(sofficePath!, filePath)
      const errors = await scanErrors(filePath)
      return {
        ok: true,
        mode: 'libreoffice',
        errorCount: errors.length,
        errors,
        warnings,
      }
    } catch (err) {
      if (mode === 'libreoffice') throw err
      warnings.push(
        `LIBREOFFICE_RECALC_FAILED: ${String((err as Error).message ?? err)} — fell back to simple mode`,
      )
      // fall through to simple
    }
  }

  // simple mode
  await runSimpleRecalc(filePath)
  const errors = await scanErrors(filePath)
  return {
    ok: true,
    mode: 'simple',
    errorCount: errors.length,
    errors,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Error scanning — always runs after recalc
// ---------------------------------------------------------------------------

async function scanErrors(filePath: string): Promise<RecalcErrorRecord[]> {
  const wb = await loadWorkbook(filePath)
  const out: RecalcErrorRecord[] = []
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value
        if (!v) return
        if (typeof v === 'object') {
          const obj = v as unknown as Record<string, unknown>
          const formula = (obj.formula ?? obj.sharedFormula) as string | undefined
          const result = obj.result as unknown
          let type: string | undefined
          if (result && typeof result === 'object' && 'error' in (result as Record<string, unknown>)) {
            type = String((result as { error: string }).error)
          } else if ('error' in obj) {
            type = String((obj as { error: string }).error)
          } else if (typeof result === 'string' && ERROR_TOKENS.includes(result)) {
            type = result
          }
          if (type) {
            out.push({ sheet: ws.name, cell: cell.address, type, formula })
          }
        } else if (typeof v === 'string' && ERROR_TOKENS.includes(v)) {
          out.push({ sheet: ws.name, cell: cell.address, type: v })
        }
      })
    })
  })
  return out
}

async function collectCrossFileRefs(filePath: string): Promise<RecalcErrorRecord[]> {
  const wb = await loadWorkbook(filePath)
  const hits: RecalcErrorRecord[] = []
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value
        if (!v || typeof v !== 'object') return
        const obj = v as unknown as Record<string, unknown>
        const formula = (obj.formula ?? obj.sharedFormula) as string | undefined
        if (formula && CROSS_FILE_RE.test(formula)) {
          hits.push({ sheet: ws.name, cell: cell.address, type: 'cross-file', formula })
        }
      })
    })
  })
  return hits
}

// ---------------------------------------------------------------------------
// libreoffice round-trip
// ---------------------------------------------------------------------------

function runLibreOfficeRecalc(
  soffice: string,
  filePath: string,
  timeoutMs = 60_000,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const tmpOut = await fs.mkdtemp(path.join(os.tmpdir(), 'xlsx-recalc-'))
    const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-profile-'))
    const userInstallArg = `-env:UserInstallation=file://${profileDir}`
    // `--convert-to xlsx` re-saves the workbook after evaluating formulas.
    const proc = spawn(
      soffice,
      [userInstallArg, '--headless', '--calc', '--convert-to', 'xlsx', filePath, '--outdir', tmpOut],
      { stdio: 'ignore' },
    )
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error(`soffice recalc timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    proc.on('error', (err) => {
      clearTimeout(timer)
      cleanup().finally(() => reject(err))
    })
    proc.on('exit', async (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        await cleanup()
        reject(new Error(`soffice exited with code ${code}`))
        return
      }
      try {
        const baseName = path.basename(filePath, path.extname(filePath))
        const recalced = path.join(tmpOut, `${baseName}.xlsx`)
        await fs.copyFile(recalced, filePath)
        resolve()
      } catch (err) {
        reject(err)
      } finally {
        await cleanup()
      }
    })
    async function cleanup() {
      await fs.rm(tmpOut, { recursive: true, force: true }).catch(() => {})
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {})
    }
  })
}

// ---------------------------------------------------------------------------
// simple-mode evaluator (formulajs)
// ---------------------------------------------------------------------------

const FN_CALL_RE = /^([A-Z][A-Z0-9_.]*)\((.*)\)$/i
const A1_RE = /^([A-Z]+)([1-9][0-9]*)$/
const RANGE_RE = /^([A-Z]+[1-9][0-9]*):([A-Z]+[1-9][0-9]*)$/

async function runSimpleRecalc(filePath: string): Promise<void> {
  const wb = await loadWorkbook(filePath)
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value
        if (!v || typeof v !== 'object') return
        const obj = v as unknown as Record<string, unknown>
        const formula = (obj.formula ?? obj.sharedFormula) as string | undefined
        if (!formula) return
        if (CROSS_FILE_RE.test(formula)) return // skip — warned by collector
        const result = evalSimpleFormula(formula, ws)
        if (result === undefined) return
        // preserve existing shape; only refresh `.result`
        cell.value = { ...(obj as object), formula, result } as ExcelJS.CellValue
      })
    })
  })
  await wb.xlsx.writeFile(filePath)
}

function evalSimpleFormula(formula: string, ws: ExcelJS.Worksheet): unknown | undefined {
  const body = formula.trim().startsWith('=') ? formula.trim().slice(1) : formula.trim()
  // Try function call shape first.
  const m = body.match(FN_CALL_RE)
  if (!m) return tryLiteral(body, ws)
  const fnName = m[1]!.toUpperCase()
  const argsStr = m[2]!
  const fn = (formulajs as unknown as Record<string, unknown>)[fnName]
  if (typeof fn !== 'function') return { error: '#NAME?' }
  const args = splitArgs(argsStr).map((a) => resolveArg(a, ws))
  try {
    const out = (fn as (...a: unknown[]) => unknown)(...args)
    if (out && typeof out === 'object' && 'name' in (out as Record<string, unknown>) && (out as { name: string }).name?.startsWith?.('#')) {
      return { error: (out as { name: string }).name }
    }
    return out
  } catch (err) {
    return { error: '#VALUE!' }
  }
}

function tryLiteral(body: string, ws: ExcelJS.Worksheet): unknown | undefined {
  // A single cell ref or range or literal.
  const trimmed = body.trim()
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (/^".*"$/.test(trimmed)) return trimmed.slice(1, -1)
  if (A1_RE.test(trimmed)) return readCellPrimitive(ws, trimmed)
  return undefined
}

function splitArgs(str: string): string[] {
  const out: string[] = []
  let depth = 0
  let inStr = false
  let cur = ''
  for (const ch of str) {
    if (inStr) {
      cur += ch
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      cur += ch
      continue
    }
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function resolveArg(arg: string, ws: ExcelJS.Worksheet): unknown {
  // Literal
  if (/^-?\d+(\.\d+)?$/.test(arg)) return Number(arg)
  if (/^".*"$/.test(arg)) return arg.slice(1, -1)
  if (/^(TRUE|FALSE)$/i.test(arg)) return arg.toUpperCase() === 'TRUE'
  // Range
  if (RANGE_RE.test(arg)) return readRangeMatrix(ws, arg)
  // Cell
  if (A1_RE.test(arg)) return readCellPrimitive(ws, arg)
  // Nested function call
  if (FN_CALL_RE.test(arg)) {
    const r = evalSimpleFormula(arg, ws)
    return r
  }
  // Boolean expressions like A1>B1 — evaluate naively for IF.
  const relMatch = arg.match(/^(.+?)(>=|<=|<>|=|>|<)(.+)$/)
  if (relMatch) {
    const lhs = resolveArg(relMatch[1]!.trim(), ws)
    const rhs = resolveArg(relMatch[3]!.trim(), ws)
    const op = relMatch[2]!
    return compareOp(lhs, rhs, op)
  }
  // fallthrough: pass raw
  return arg
}

function compareOp(a: unknown, b: unknown, op: string): boolean {
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  const bothNum = Number.isFinite(na) && Number.isFinite(nb)
  switch (op) {
    case '>':
      return bothNum ? na > nb : String(a) > String(b)
    case '<':
      return bothNum ? na < nb : String(a) < String(b)
    case '>=':
      return bothNum ? na >= nb : String(a) >= String(b)
    case '<=':
      return bothNum ? na <= nb : String(a) <= String(b)
    case '=':
      return a === b || (bothNum && na === nb)
    case '<>':
      return !(a === b || (bothNum && na === nb))
  }
  return false
}

function readCellPrimitive(ws: ExcelJS.Worksheet, addr: string): unknown {
  const cell = ws.getCell(addr)
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    const obj = v as unknown as Record<string, unknown>
    if ('result' in obj) {
      const r = obj.result
      if (r && typeof r === 'object' && 'error' in (r as Record<string, unknown>)) return null
      return r
    }
    if ('text' in obj) return obj.text
    return null
  }
  return v
}

function readRangeMatrix(ws: ExcelJS.Worksheet, range: string): unknown[][] {
  const p = parseRange(range)
  const matrix: unknown[][] = []
  for (let r = p.startRow; r <= p.endRow; r++) {
    const row: unknown[] = []
    for (let c = p.startCol; c <= p.endCol; c++) {
      const addr = String.fromCharCode(64 + c) + r
      // For multi-letter cols, recompute the letter:
      const letter = columnLetter(c)
      const cell = ws.getCell(`${letter}${r}`)
      void addr
      const v = cell.value
      if (v === null || v === undefined) row.push(null)
      else if (typeof v === 'object') {
        const obj = v as unknown as Record<string, unknown>
        if ('result' in obj) {
          const rr = obj.result
          if (rr && typeof rr === 'object' && 'error' in (rr as Record<string, unknown>)) row.push(null)
          else row.push(rr)
        } else if ('text' in obj) row.push(obj.text)
        else row.push(null)
      } else row.push(v)
    }
    matrix.push(row)
  }
  return matrix
}

function columnLetter(idx: number): string {
  let n = idx
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

// Keep imports live for bundler-side tree-shaking checks.
void letterToColIndex
