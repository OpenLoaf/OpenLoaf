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
 * Excel engine — low-level workbook loader shared by Inspect (and any future
 * read-oriented utilities). The previous Mutate engine was removed when we
 * unified xlsx creation/editing onto JsSandbox + exceljs.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'

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

export async function loadWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const absPath = path.resolve(filePath)
  await fs.access(absPath)

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
  ;(wb as unknown as { __csvOrigin?: string }).__csvOrigin = absPath
  return wb
}

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
