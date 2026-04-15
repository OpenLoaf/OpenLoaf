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
 * DocPreview tool — fast local preview / full extraction for Office documents.
 *
 * The `preview*` functions are pure and reused by the Read tool's office branch
 * so a naive `Read` on a large PDF/DOCX/XLSX/PPTX returns a compact (<2KB)
 * summary instead of the full Markdown body. Use DocPreview(mode='full') for
 * the heavy extraction path.
 */
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tool, zodSchema } from 'ai'
import { docPreviewToolDef } from '@openloaf/api/types/tools/docPreview'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { extractPdfContent, parsePdfStructure } from '@/ai/tools/office/pdfEngine'
import { extractDocxContent } from '@/ai/tools/office/docxExtractor'
import { extractXlsxContent } from '@/ai/tools/office/xlsxExtractor'
import { extractPptxContent } from '@/ai/tools/office/pptxExtractor'
import { parseDocxStructure } from '@/ai/tools/office/structureParser'
import {
  listZipEntries,
  readZipEntryBuffer,
  readZipEntryText,
} from '@/ai/tools/office/streamingZip'
import { createToolProgress, type ToolProgressEmitter } from '@/ai/tools/toolProgress'
import type { FileContentResult } from '@/ai/tools/office/types'
import { formatFileResult } from '@/ai/tools/fileFormat'

/** Idle watchdog: reject if no progress emit happens for `idleMs`. */
const DOC_PREVIEW_IDLE_TIMEOUT_MS = 60_000

function wrapProgressWithIdleWatchdog(
  progress: ToolProgressEmitter,
  idleMs: number,
): { progress: ToolProgressEmitter; idlePromise: Promise<never>; stop: () => void } {
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  let rejectFn: ((err: Error) => void) | null = null

  const idlePromise = new Promise<never>((_, reject) => {
    rejectFn = reject
  })

  const kick = () => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (stopped) return
      stopped = true
      const err = new Error(
        `[DOC_PREVIEW_IDLE_TIMEOUT] DocPreview produced no progress for ${Math.round(idleMs / 1000)}s. Aborting.`,
      )
      try { progress.error(err.message) } catch { /* ignore */ }
      rejectFn?.(err)
    }, idleMs)
  }

  const stop = () => {
    stopped = true
    if (timer) { clearTimeout(timer); timer = null }
  }

  const wrapped: ToolProgressEmitter = {
    start(label, meta) { kick(); progress.start(label, meta) },
    delta(text, meta) { kick(); progress.delta(text, meta) },
    done(summary, meta) { stop(); progress.done(summary, meta) },
    error(errorText) { stop(); progress.error(errorText) },
  }

  kick()
  return { progress: wrapped, idlePromise, stop }
}

// ---------------------------------------------------------------------------
// Format detection — very small, extension-based only.
// ---------------------------------------------------------------------------

type DocKind = 'pdf' | 'docx' | 'xlsx' | 'pptx'

const DOC_MIME_BY_KIND: Record<DocKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const MUTATE_TOOL_BY_KIND: Record<DocKind, string> = {
  pdf: 'PdfMutate',
  docx: 'WordMutate',
  xlsx: 'ExcelMutate',
  pptx: 'PptxMutate',
}

function classifyDocKind(absPath: string): DocKind {
  const ext = path.extname(absPath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  if (ext === '.xlsx') return 'xlsx'
  if (ext === '.pptx') return 'pptx'
  throw new Error(
    `DocPreview only supports .pdf / .docx / .xlsx / .pptx. Got "${ext || '(no ext)'}". Use Read for text files.`,
  )
}

// ---------------------------------------------------------------------------
// Per-file asset dir resolver (duplicated from fileTools to avoid circular import).
// ---------------------------------------------------------------------------

async function resolveAssetDir(
  sessionId: string,
  filePath: string,
): Promise<{ assetDirAbsPath: string; assetRelPrefix: string }> {
  const assetRoot = await resolveSessionAssetDir(sessionId)
  const baseName = path.basename(filePath, path.extname(filePath))
  const safeName = baseName.replace(/[^\w\u4e00-\u9fff.-]/g, '_') || 'file'
  const assetRelPrefix = `${safeName}_asset`
  const assetDirAbsPath = path.join(assetRoot, assetRelPrefix)
  return { assetDirAbsPath, assetRelPrefix }
}

// ---------------------------------------------------------------------------
// PDF preview — pageCount / metadata / bookmarks / first page text snippet.
// ---------------------------------------------------------------------------

function parsePreviewPageRange(range: string | undefined): { start: number; end: number } | null {
  if (!range) return null
  const parts = range.split('-').map((s) => s.trim())
  if (parts.length === 1) {
    const p = Number.parseInt(parts[0]!, 10)
    if (Number.isNaN(p) || p < 1) return null
    return { start: p, end: p }
  }
  if (parts.length === 2) {
    const s = Number.parseInt(parts[0]!, 10)
    const e = Number.parseInt(parts[1]!, 10)
    if (Number.isNaN(s) || Number.isNaN(e) || s < 1 || e < s) return null
    return { start: s, end: e }
  }
  return null
}

/**
 * Cheap PDF preview: structure metadata + first-page text snippet via unpdf.
 * No image extraction, no disk writes.
 */
export async function previewPdf(
  absPath: string,
  pageRange: string | undefined,
): Promise<FileContentResult> {
  const fileName = path.basename(absPath)
  const structure = await parsePdfStructure(absPath)

  // Parse pageRange; fall back to 1 on bad input.
  const parsed = parsePreviewPageRange(pageRange)
  const targetPage = parsed ? parsed.start : 1

  // Pull just the first target page's text via unpdf. Guard against the
  // missing `Promise.try` the real extractor fixes up (duplicate the polyfill).
  if (typeof (Promise as unknown as { try?: unknown }).try !== 'function') {
    ;(Promise as unknown as { try: typeof Promise.resolve }).try = function <T>(
      fn: (...args: unknown[]) => T | PromiseLike<T>,
      ...args: unknown[]
    ): Promise<T> {
      return new Promise<T>((resolve) => resolve(fn(...args)))
    } as typeof Promise.resolve
  }

  let snippet = ''
  try {
    const buf = await fs.readFile(absPath)
    const { getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    if (targetPage <= pdf.numPages) {
      const page = await pdf.getPage(targetPage)
      const tc = await page.getTextContent()
      const text = (tc.items as Array<{ str?: string }>)
        .map((it) => (typeof it.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      snippet = text.slice(0, 400)
    }
  } catch {
    // Best-effort; keep snippet empty.
  }

  const metaLines: string[] = [
    `# ${fileName}`,
    `- pageCount: ${structure.pageCount}`,
    `- fileSize: ${structure.fileSize} bytes`,
  ]
  const m = structure.metadata
  if (m.title) metaLines.push(`- title: ${m.title}`)
  if (m.author) metaLines.push(`- author: ${m.author}`)
  if (m.subject) metaLines.push(`- subject: ${m.subject}`)
  if (m.creator) metaLines.push(`- creator: ${m.creator}`)
  if (m.producer) metaLines.push(`- producer: ${m.producer}`)
  if (m.creationDate) metaLines.push(`- creationDate: ${m.creationDate}`)
  if (m.modificationDate) metaLines.push(`- modificationDate: ${m.modificationDate}`)
  if (structure.hasForm) metaLines.push(`- formFieldCount: ${structure.formFieldCount}`)

  metaLines.push('')
  metaLines.push(`## Page ${targetPage} snippet (first 400 chars)`)
  metaLines.push(snippet || '_(no extractable text on this page — the PDF may be scanned)_')
  metaLines.push('')
  metaLines.push(
    'Use `DocPreview` with mode="full" for the complete Markdown body + embedded images.',
  )

  return {
    type: 'pdf',
    fileName,
    content: metaLines.join('\n'),
    meta: {
      mode: 'preview',
      pageCount: structure.pageCount,
      fileSize: structure.fileSize,
      characterCount: snippet.length,
      hasForm: structure.hasForm,
      formFieldCount: structure.formFieldCount,
      documentInfo: structure.metadata,
      previewPage: targetPage,
    },
    images: [],
  }
}

// ---------------------------------------------------------------------------
// DOCX preview — heading outline + first ~20 paragraphs via structureParser.
// ---------------------------------------------------------------------------

/** Build an EntryReader over a zip file (DOCX/PPTX/XLSX are all zip packages). */
function makeZipReader(absPath: string): (entryPath: string) => Promise<Buffer> {
  return (entryPath: string) => readZipEntryBuffer(absPath, entryPath)
}

export async function previewDocx(absPath: string): Promise<FileContentResult> {
  const fileName = path.basename(absPath)
  const structure = await parseDocxStructure(makeZipReader(absPath))

  const headings = structure.paragraphs
    .filter((p) => typeof p.level === 'number' && p.text.trim().length > 0)
    .slice(0, 50)
    .map((p) => `${'  '.repeat(Math.max(0, (p.level ?? 1) - 1))}- H${p.level}: ${p.text.trim()}`)

  const previewParas = structure.paragraphs
    .filter((p) => p.text.trim().length > 0)
    .slice(0, 20)
    .map((p) => p.text.trim())

  const imageCount = structure.images.length
  const tableCount = structure.tables.length

  const lines: string[] = [
    `# ${fileName}`,
    `- paragraphCount: ${structure.totalParagraphs}`,
    `- tableCount: ${tableCount}`,
    `- imageCount: ${imageCount}`,
  ]
  if (headings.length > 0) {
    lines.push('')
    lines.push('## Outline')
    for (const h of headings) lines.push(h)
  }
  if (previewParas.length > 0) {
    lines.push('')
    lines.push('## First paragraphs (up to 20)')
    for (const p of previewParas) {
      // Clamp each paragraph to 200 chars.
      lines.push(`- ${p.length > 200 ? `${p.slice(0, 200)}…` : p}`)
    }
  }
  lines.push('')
  lines.push(
    'Use `DocPreview` with mode="full" for the complete Markdown body + extracted images.',
  )

  return {
    type: 'docx',
    fileName,
    content: lines.join('\n'),
    meta: {
      mode: 'preview',
      paragraphCount: structure.totalParagraphs,
      tableCount,
      imageCount,
      headingCount: headings.length,
    },
    images: [],
  }
}

// ---------------------------------------------------------------------------
// XLSX preview — sheet list + first 10x10 cells from target sheet.
// ---------------------------------------------------------------------------

export async function previewXlsx(
  absPath: string,
  sheetName: string | undefined,
): Promise<FileContentResult> {
  const fileName = path.basename(absPath)
  const XLSX = await import('xlsx')
  const buf = await fs.readFile(absPath)
  const wb = XLSX.read(buf, { type: 'buffer' })

  type SheetMeta = { name: string; rowCount: number; colCount: number; range: string }
  const sheets: SheetMeta[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const ref = (sheet['!ref'] as string | undefined) ?? 'A1'
    let rowCount = 0
    let colCount = 0
    try {
      const decoded = XLSX.utils.decode_range(ref)
      rowCount = decoded.e.r - decoded.s.r + 1
      colCount = decoded.e.c - decoded.s.c + 1
    } catch {
      // leave zeros
    }
    sheets.push({ name, rowCount, colCount, range: ref })
  }

  const target = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0]
  const targetSheet = target ? wb.Sheets[target] : undefined

  const lines: string[] = [
    `# ${fileName}`,
    `- sheetCount: ${sheets.length}`,
  ]
  lines.push('')
  lines.push('## Sheets')
  for (const s of sheets) {
    lines.push(`- ${s.name} (${s.rowCount} rows × ${s.colCount} cols, range=${s.range})`)
  }

  if (targetSheet && target) {
    type CellValue = string | number | boolean | Date | null | undefined
    const rows = XLSX.utils.sheet_to_json<CellValue[]>(targetSheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as CellValue[][]
    const previewRows = rows.slice(0, 10).map((r) => r.slice(0, 10))
    lines.push('')
    lines.push(`## "${target}" — first 10 rows × 10 cols`)
    if (previewRows.length === 0) {
      lines.push('_(empty sheet)_')
    } else {
      lines.push(renderMdTable(previewRows))
    }
  }

  lines.push('')
  lines.push(
    'Use `DocPreview` with mode="full" (optionally sheetName=...) for the complete Markdown tables + extracted images.',
  )

  return {
    type: 'xlsx',
    fileName,
    content: lines.join('\n'),
    meta: {
      mode: 'preview',
      sheetCount: sheets.length,
      sheets,
      previewSheet: target ?? null,
    },
    images: [],
  }
}

function renderMdTable(rows: Array<Array<unknown>>): string {
  if (rows.length === 0) return ''
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0)
  if (colCount === 0) return ''
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString()
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    return String(v).replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|')
  }
  const norm = (row: Array<unknown>): string[] => {
    const out: string[] = []
    for (let i = 0; i < colCount; i++) out.push(fmt(row[i]))
    return out
  }
  const headerRaw = norm(rows[0] ?? [])
  const header = headerRaw.map((h, i) => (h.length > 0 ? h : `Col${i + 1}`))
  const sep = header.map(() => '---')
  const out: string[] = []
  out.push(`| ${header.join(' | ')} |`)
  out.push(`| ${sep.join(' | ')} |`)
  for (let i = 1; i < rows.length; i++) {
    out.push(`| ${norm(rows[i] ?? []).join(' | ')} |`)
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// PPTX preview — slide titles + first slide text blocks via fast-xml-parser.
// ---------------------------------------------------------------------------

export async function previewPptx(absPath: string): Promise<FileContentResult> {
  const fileName = path.basename(absPath)
  const entries = await listZipEntries(absPath)
  const { XMLParser } = await import('fast-xml-parser')
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  })

  // Find slide XMLs by lexicographic order (cheap fallback path from pptxExtractor).
  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort((a, b) => {
      const na = Number.parseInt(a.match(/slide(\d+)/)?.[1] ?? '0', 10)
      const nb = Number.parseInt(b.match(/slide(\d+)/)?.[1] ?? '0', 10)
      return na - nb
    })

  type SlideInfo = { index: number; title: string }
  const slides: SlideInfo[] = []
  let firstSlideBlocks: string[] = []

  for (let i = 0; i < slideEntries.length; i++) {
    const slideEntry = slideEntries[i]!
    let textRuns: string[] = []
    try {
      const xml = await readZipEntryText(absPath, slideEntry)
      const json = xmlParser.parse(xml)
      textRuns = []
      collectTextRuns(json, textRuns)
    } catch {
      textRuns = []
    }
    const nonEmpty = textRuns.map((t) => t.trim()).filter((t) => t.length > 0)
    const title = (nonEmpty[0] ?? '').slice(0, 120)
    slides.push({ index: i + 1, title })
    if (i === 0) firstSlideBlocks = nonEmpty.slice(0, 20)
  }

  const lines: string[] = [
    `# ${fileName}`,
    `- slideCount: ${slides.length}`,
  ]
  lines.push('')
  lines.push('## Slides')
  for (const s of slides) {
    lines.push(`- Slide ${s.index}: ${s.title || '(no title)'}`)
  }
  if (firstSlideBlocks.length > 0) {
    lines.push('')
    lines.push('## Slide 1 text blocks')
    for (const b of firstSlideBlocks) {
      lines.push(`- ${b.length > 200 ? `${b.slice(0, 200)}…` : b}`)
    }
  }
  lines.push('')
  lines.push(
    'Use `DocPreview` with mode="full" for all slide text + extracted images.',
  )

  return {
    type: 'pptx',
    fileName,
    content: lines.join('\n'),
    meta: {
      mode: 'preview',
      slideCount: slides.length,
      slides,
    },
    images: [],
  }
}

/** Recursively walk parsed OOXML JSON and collect <a:t> text values in order. */
function collectTextRuns(node: unknown, out: string[]): void {
  if (node === null || node === undefined) return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    for (const item of node) collectTextRuns(item, out)
    return
  }
  if (typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('@_')) continue
    if (key === 'a:t') {
      if (typeof value === 'string') out.push(value)
      else if (typeof value === 'number') out.push(String(value))
      else if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v === 'string') out.push(v)
          else if (typeof v === 'number') out.push(String(v))
          else if (v && typeof v === 'object') {
            const t = (v as Record<string, unknown>)['#text']
            if (typeof t === 'string') out.push(t)
            else if (typeof t === 'number') out.push(String(t))
          }
        }
      } else if (typeof value === 'object') {
        const t = (value as Record<string, unknown>)['#text']
        if (typeof t === 'string') out.push(t)
        else if (typeof t === 'number') out.push(String(t))
      }
      continue
    }
    collectTextRuns(value, out)
  }
}

// ---------------------------------------------------------------------------
// DocPreview tool — dispatcher for preview vs full modes.
// ---------------------------------------------------------------------------

export const docPreviewTool = tool({
  description: docPreviewToolDef.description,
  inputSchema: zodSchema(docPreviewToolDef.parameters),
  needsApproval: false,
  execute: async (
    { file_path: filePath, mode, pageRange, sheetName },
    { toolCallId }: { toolCallId: string },
  ): Promise<string> => {
    const rawProgress = createToolProgress(toolCallId, 'DocPreview')
    const watchdog = wrapProgressWithIdleWatchdog(rawProgress, DOC_PREVIEW_IDLE_TIMEOUT_MS)
    const progress = watchdog.progress
    const startedAt = Date.now()
    try {
      return await Promise.race([runExecute(), watchdog.idlePromise])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      progress.error(msg)
      throw e
    } finally {
      watchdog.stop()
    }

    async function runExecute(): Promise<string> {
      const { absPath } = resolveToolPath({ target: filePath })
      const stat = await fs.stat(absPath)
      if (!stat.isFile()) {
        throw new Error('Path is not a file. DocPreview targets .pdf/.docx/.xlsx/.pptx.')
      }
      const kind = classifyDocKind(absPath)
      const mimeType = DOC_MIME_BY_KIND[kind]
      const effectiveMode: 'preview' | 'full' = mode ?? 'preview'
      const fileName = path.basename(absPath)

      progress.start(
        `DocPreview ${fileName} (${kind}, mode=${effectiveMode})`,
        { kind, mode: effectiveMode, bytes: stat.size },
      )

      let result: FileContentResult
      if (effectiveMode === 'preview') {
        switch (kind) {
          case 'pdf':
            progress.delta('Reading PDF structure + first-page snippet...\n')
            result = await previewPdf(absPath, pageRange)
            break
          case 'docx':
            progress.delta('Parsing DOCX structure (headings + first paragraphs)...\n')
            result = await previewDocx(absPath)
            break
          case 'xlsx':
            progress.delta('Listing sheets and reading preview grid...\n')
            result = await previewXlsx(absPath, sheetName)
            break
          case 'pptx':
            progress.delta('Walking slides and reading titles...\n')
            result = await previewPptx(absPath)
            break
        }
      } else {
        // full mode — needs session asset dir.
        const sessionId = getSessionId()
        if (!sessionId) {
          throw new Error(
            'DocPreview mode="full" requires an active chat session to write extracted assets.',
          )
        }
        const { assetDirAbsPath, assetRelPrefix } = await resolveAssetDir(sessionId, filePath)
        switch (kind) {
          case 'pdf':
            progress.delta('Running full PDF extraction with unpdf + image pipeline...\n')
            {
              const pdf = await extractPdfContent(
                absPath,
                pageRange,
                assetDirAbsPath,
                assetRelPrefix,
              )
              result = {
                type: 'pdf',
                fileName,
                content: pdf.content,
                meta: {
                  mode: 'full',
                  pageCount: pdf.pageCount,
                  characterCount: pdf.characterCount,
                  imageCount: pdf.images.length,
                },
                images: pdf.images.map((img) => ({
                  index: img.index,
                  url: img.url,
                  width: img.width,
                  height: img.height,
                  page: img.page,
                })),
                assetDir: pdf.assetDir,
                truncated: pdf.truncated,
              }
            }
            break
          case 'docx':
            progress.delta('Running full DOCX extraction via mammoth + turndown...\n')
            result = await extractDocxContent(absPath, assetDirAbsPath, assetRelPrefix)
            result.meta = { ...result.meta, mode: 'full' }
            break
          case 'xlsx':
            progress.delta('Running full XLSX extraction via SheetJS...\n')
            result = await extractXlsxContent(absPath, assetDirAbsPath, assetRelPrefix, { sheetName })
            result.meta = { ...result.meta, mode: 'full' }
            break
          case 'pptx':
            progress.delta('Running full PPTX extraction via fast-xml-parser...\n')
            result = await extractPptxContent(absPath, assetDirAbsPath, assetRelPrefix)
            result.meta = { ...result.meta, mode: 'full' }
            break
        }

        if (result!.assetDir) {
          ;(result!.meta as Record<string, unknown>).extractedTo = {
            absPath: assetDirAbsPath,
            templatePath: `\${CURRENT_CHAT_DIR}/${result!.assetDir}`,
          }
        }
      }

      ;(result!.meta as Record<string, unknown>).sourcePath = absPath
      const mutateTool = MUTATE_TOOL_BY_KIND[kind]
      ;(result!.meta as Record<string, unknown>).mutateTool = mutateTool

      progress.done(`DocPreview ${kind} in ${Date.now() - startedAt}ms`, {
        imageCount: result!.images.length,
        truncated: result!.truncated ?? false,
      })

      return formatFileResult(result!, fileName, mimeType, stat.size, {
        readMode: 'derived',
        mutateTool,
        toolName: 'DocPreview',
      })
    }
  },
})
