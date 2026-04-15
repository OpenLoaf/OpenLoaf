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
 * XLSX content extractor for the unified Read tool.
 *
 * Uses SheetJS to convert each sheet into a Markdown table, then re-opens
 * the workbook as a ZIP to extract `xl/media/image*.*` entries alongside the
 * text. Images cannot reliably be mapped to a specific sheet without parsing
 * `xl/drawings/*.xml` + rels (skipped for v1), so they are appended at the
 * end of `content` as a trailing "## Images" section.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { listZipEntries, readZipEntryBuffer } from './streamingZip'
import type { FileContentImage, FileContentResult } from './types'

const DEFAULT_MAX_ROWS_PER_SHEET = 500

type CellValue = string | number | boolean | Date | null | undefined

/**
 * Extract an XLSX file into Markdown tables + inline image references.
 *
 * @param absPath Absolute path to the .xlsx file on disk.
 * @param assetDirAbsPath Absolute path to the asset dir (created if missing).
 * @param assetRelPrefix Relative prefix used in Markdown image refs, e.g. "report_asset".
 * @param options.sheetName When set, extract only this sheet.
 * @param options.maxRowsPerSheet Row cap per sheet; defaults to 500.
 */
export async function extractXlsxContent(
  absPath: string,
  assetDirAbsPath: string,
  assetRelPrefix: string,
  options?: {
    sheetName?: string
    maxRowsPerSheet?: number
  },
): Promise<FileContentResult> {
  const XLSX = await import('xlsx')
  const sharp = (await import('sharp')).default

  const maxRows = options?.maxRowsPerSheet ?? DEFAULT_MAX_ROWS_PER_SHEET
  const fileName = path.basename(absPath)

  const buf = await fs.readFile(absPath)
  const wb = XLSX.read(buf, { type: 'buffer' })

  const allSheetNames = wb.SheetNames
  const targetSheetNames = options?.sheetName
    ? allSheetNames.filter((n) => n === options.sheetName)
    : allSheetNames

  await fs.mkdir(assetDirAbsPath, { recursive: true })

  const contentParts: string[] = []
  const rowCounts: Record<string, number> = {}
  let anyTruncated = false
  let anyRowsRendered = false

  for (const sheetName of targetSheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as CellValue[][]

    const totalRows = rows.length
    rowCounts[sheetName] = totalRows

    contentParts.push(`## Sheet: ${sheetName}\n`)

    if (totalRows === 0) {
      contentParts.push('_(empty sheet)_\n')
      continue
    }

    anyRowsRendered = true

    const displayRows = rows.slice(0, maxRows)
    const truncatedRows = totalRows > maxRows
    if (truncatedRows) anyTruncated = true

    contentParts.push(renderMarkdownTable(displayRows))

    if (truncatedRows) {
      contentParts.push(`\n… ${totalRows - maxRows} more rows\n`)
    }

    contentParts.push('\n')
  }

  // --- Image extraction via raw ZIP walk ---------------------------------
  const images: FileContentImage[] = []
  const entries = await listZipEntries(absPath)
  const mediaEntries = entries
    .filter((e) => /^xl\/media\/image[^/]+$/i.test(e))
    .sort()

  let imageIndex = 0
  for (const entry of mediaEntries) {
    try {
      const imgBuf = await readZipEntryBuffer(absPath, entry)
      const origExt = path.extname(entry).replace(/^\./, '').toLowerCase() || 'png'
      const fileBase = `img-${imageIndex}.${origExt}`
      const outPath = path.join(assetDirAbsPath, fileBase)
      await fs.writeFile(outPath, imgBuf)

      let width = 0
      let height = 0
      try {
        const meta = await sharp(imgBuf).metadata()
        width = meta.width ?? 0
        height = meta.height ?? 0
      } catch {
        // Unknown/corrupt image — keep zero dims, still surface the file.
      }

      const url = `${assetRelPrefix}/${fileBase}`
      images.push({ index: imageIndex, url, width, height })
      imageIndex++
    } catch {
      // Skip unreadable entries rather than failing the whole extraction.
    }
  }

  if (images.length > 0) {
    contentParts.push('## Images\n')
    for (const img of images) {
      contentParts.push(`![image-${img.index}](${img.url})\n`)
    }
    contentParts.push('\n')
  }

  // --- Fallback: workbook is fully empty ---------------------------------
  const hasContent = anyRowsRendered || images.length > 0
  if (!hasContent) {
    const fallbackName = 'original.xlsx'
    const fallbackAbs = path.join(assetDirAbsPath, fallbackName)
    await fs.writeFile(fallbackAbs, buf)
    return {
      type: 'xlsx',
      fileName,
      content: '',
      meta: {
        sheetCount: allSheetNames.length,
        sheetNames: allSheetNames,
        rowCounts,
        imageCount: 0,
      },
      images: [],
      assetDir: assetRelPrefix,
      fallbackPath: `${assetRelPrefix}/${fallbackName}`,
    }
  }

  return {
    type: 'xlsx',
    fileName,
    content: contentParts.join(''),
    meta: {
      sheetCount: allSheetNames.length,
      sheetNames: allSheetNames,
      rowCounts,
      imageCount: images.length,
    },
    images,
    assetDir: assetRelPrefix,
    truncated: anyTruncated,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render a 2D cell array as a GitHub-flavored Markdown pipe table.
 *
 * The first row is always used as the header; if the sheet has only one row
 * we still emit a header + empty separator so the output is a valid table.
 * Column count is normalized to the widest row to keep the pipe grid square.
 */
function renderMarkdownTable(rows: CellValue[][]): string {
  if (rows.length === 0) return ''

  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0)
  if (colCount === 0) return ''

  const normalize = (row: CellValue[]): string[] => {
    const out: string[] = []
    for (let i = 0; i < colCount; i++) out.push(formatCell(row[i]))
    return out
  }

  const headerRaw = normalize(rows[0] ?? [])
  const header = headerRaw.map((h, i) => (h.length > 0 ? h : `Col${i + 1}`))
  const separator = header.map(() => '---')

  const lines: string[] = []
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(`| ${separator.join(' | ')} |`)

  for (let i = 1; i < rows.length; i++) {
    const cells = normalize(rows[i] ?? [])
    lines.push(`| ${cells.join(' | ')} |`)
  }

  return `${lines.join('\n')}\n`
}

/** Stringify a cell value and escape pipe/newline characters for Markdown tables. */
function formatCell(value: CellValue): string {
  if (value === null || value === undefined) return ''
  let str: string
  if (value instanceof Date) {
    str = Number.isNaN(value.getTime()) ? '' : value.toISOString()
  } else if (typeof value === 'number') {
    str = Number.isFinite(value) ? String(value) : ''
  } else if (typeof value === 'boolean') {
    str = value ? 'true' : 'false'
  } else {
    str = String(value)
  }
  // Replace line breaks with <br> so the pipe-table row stays on one line,
  // and escape stray pipes so they don't break column alignment.
  return str.replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|')
}
