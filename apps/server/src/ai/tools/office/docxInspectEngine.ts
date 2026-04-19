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
 * DOCX Inspect Engine — read-only analysis used by the WordInspect tool.
 *
 * The 9 actions (summary / outline / text / tables / images / comments /
 * tracked-changes / xml / render) map 1:1 to the exported inspect* helpers
 * below. Phase 1 implements them; Phase 0 only exposes the type surface.
 *
 * Note: `inspectText` is a thin wrapper around the shared
 * `docxExtractor.extractDocxContent` — no parallel mammoth/turndown
 * pipeline. DocPreview, the fileTools Read dispatcher, and WordInspect
 * all consume the same extraction source of truth.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'
import {
  listZipEntries,
  readZipEntryBuffer,
  readZipEntryText,
} from './streamingZip'
import { extractDocxContent } from './docxExtractor'

// ---------------------------------------------------------------------------
// Shared shapes surfaced to wordTools.ts
// ---------------------------------------------------------------------------

export type DocxSummary = {
  pageCount: number
  paragraphCount: number
  wordCount: number
  headingCount: number
  hasTrackedChanges: boolean
  hasComments: boolean
  isProtected: boolean
  availableStyles: Array<{
    id: string
    name: string
    basedOn?: string
    type: 'paragraph' | 'character'
  }>
  suggestedNextTool?: { tool: string; action: string; reason?: string }
  metadata?: {
    title?: string
    author?: string
    created?: string
    modified?: string
  }
}

export type DocxOutlineNode = {
  level: number
  text: string
  paraId?: string
  children: DocxOutlineNode[]
}

export type DocxTrackedChange = {
  id: string
  author: string
  date: string
  type: 'insert' | 'delete' | 'replace' | 'formatChange'
  runText?: string
  paraIndex?: number
}

export type DocxComment = {
  id: string
  author: string
  date: string
  text: string
  parentId?: string
  anchorText?: string
}

export type DocxTableCell = {
  text: string
  rowSpan?: number
  colSpan?: number
}

export type DocxTable = {
  rows: DocxTableCell[][]
}

export type DocxImage = {
  name: string
  url?: string
  width?: number
  height?: number
}

export type DocxRenderPage = {
  page: number
  url: string
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class DocxProtectedError extends Error {
  constructor(public filePath: string) {
    super(`DOCX is write-protected: ${filePath}`)
    this.name = 'DocxProtectedError'
  }
}

export class DocxPageRangeTooLargeError extends Error {
  constructor(
    public pageRange: string,
    public limit: number,
  ) {
    super(`PAGE_RANGE_TOO_LARGE: pageRange "${pageRange}" exceeds the per-call limit of ${limit} pages`)
    this.name = 'DocxPageRangeTooLargeError'
  }
}

export class DocxLibreOfficeUnavailableError extends Error {
  readonly code = 'LIBREOFFICE_UNAVAILABLE'
  constructor(message = 'LibreOffice (soffice) is not available on this host. Install LibreOffice to enable DOCX rendering.') {
    super(message)
    this.name = 'DocxLibreOfficeUnavailableError'
  }
}

// ---------------------------------------------------------------------------
// Shared XML / ZIP helpers
// ---------------------------------------------------------------------------

const PAGE_RANGE_LIMIT = 20

type ParsedRange = { start: number; end: number }

function parsePageRange(range: string): ParsedRange {
  const parts = range.split('-').map((s) => s.trim())
  if (parts.length === 1) {
    const p = Number.parseInt(parts[0]!, 10)
    if (Number.isNaN(p) || p < 1) throw new Error(`Invalid page range: "${range}"`)
    return { start: p, end: p }
  }
  if (parts.length === 2) {
    const s = Number.parseInt(parts[0]!, 10)
    const e = Number.parseInt(parts[1]!, 10)
    if (Number.isNaN(s) || Number.isNaN(e) || s < 1 || e < s) {
      throw new Error(`Invalid page range: "${range}"`)
    }
    return { start: s, end: e }
  }
  throw new Error(`Invalid page range: "${range}"`)
}

function rangeSpan(range: ParsedRange): number {
  return range.end - range.start + 1
}

/** Decode XML entities in extracted text. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&') // must be last
}

async function safeListEntries(absPath: string): Promise<string[]> {
  try {
    return await listZipEntries(absPath)
  } catch {
    return []
  }
}

async function readTextIfExists(absPath: string, entry: string): Promise<string | undefined> {
  try {
    return await readZipEntryText(absPath, entry)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// XML text extractors (string-based, no DOM parse)
// ---------------------------------------------------------------------------

/**
 * Collect the concatenated visible run text from a document.xml body (or a
 * subtree). Walks `<w:t>` elements in document order. Skips `<w:delText>` so
 * deletion tracked changes don't inflate the word count.
 */
function extractRunText(xml: string): string {
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let out = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    out += decodeXmlEntities(m[1] ?? '')
  }
  return out
}

function countMatches(xml: string, re: RegExp): number {
  const matches = xml.match(re)
  return matches ? matches.length : 0
}

/**
 * CJK-aware word count. Counts each CJK ideograph (U+4E00-U+9FFF and the
 * common extensions) as one "word" and counts whitespace-separated runs of
 * non-CJK characters as one word each. Mirrors the way Microsoft Word
 * itself reports word counts for mixed Chinese / English documents.
 */
function countWordsCJKAware(text: string): number {
  if (!text) return 0
  // Match CJK characters (Unified + Compatibility + Extensions A-B-D + Hangul + Kana).
  const cjkRe = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g
  const cjkCount = (text.match(cjkRe) ?? []).length
  // Strip CJK characters and count remaining whitespace-separated tokens.
  const nonCjk = text.replace(cjkRe, ' ')
  const nonCjkCount = nonCjk
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0).length
  return cjkCount + nonCjkCount
}

// ---------------------------------------------------------------------------
// Action: summary
// ---------------------------------------------------------------------------

type StyleEntry = {
  id: string
  name: string
  basedOn?: string
  type: 'paragraph' | 'character'
}

function parseStyles(stylesXml: string): StyleEntry[] {
  const out: StyleEntry[] = []
  const re = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stylesXml)) !== null) {
    const attrs = m[1] ?? ''
    const body = m[2] ?? ''
    const typeMatch = attrs.match(/w:type="([^"]+)"/)
    const idMatch = attrs.match(/w:styleId="([^"]+)"/)
    if (!typeMatch || !idMatch) continue
    const type = typeMatch[1]
    if (type !== 'paragraph' && type !== 'character') continue
    const nameMatch = body.match(/<w:name\s+w:val="([^"]+)"/)
    const basedOnMatch = body.match(/<w:basedOn\s+w:val="([^"]+)"/)
    out.push({
      id: idMatch[1]!,
      name: nameMatch ? nameMatch[1]! : idMatch[1]!,
      basedOn: basedOnMatch ? basedOnMatch[1]! : undefined,
      type,
    })
  }
  return out
}

function estimatePageCount(documentXml: string, appXml: string | undefined): number {
  if (appXml) {
    const m = appXml.match(/<Pages>(\d+)<\/Pages>/)
    if (m) {
      const n = Number.parseInt(m[1]!, 10)
      if (!Number.isNaN(n) && n >= 1) return n
    }
  }
  // Fallback: count w:br type="page" + estimated pages from paragraph count.
  const hardBreaks = countMatches(documentXml, /<w:br\s+[^>]*w:type="page"\s*\/>/g)
  const paragraphs = countMatches(documentXml, /<w:p(?:\s[^>]*)?>/g)
  const estimatedFromParagraphs = Math.max(1, Math.ceil(paragraphs / 35))
  return Math.max(1, estimatedFromParagraphs + hardBreaks)
}

function parseMetadata(coreXml?: string): DocxSummary['metadata'] {
  if (!coreXml) return {}
  const pick = (tag: string): string | undefined => {
    const m = coreXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
    return m ? decodeXmlEntities(m[1] ?? '') : undefined
  }
  return {
    title: pick('dc:title'),
    author: pick('dc:creator'),
    created: pick('dcterms:created'),
    modified: pick('dcterms:modified'),
  }
}

export async function inspectSummary(
  absPath: string,
  _opts?: { sampleSize?: number; withRender?: boolean },
): Promise<DocxSummary> {
  const entries = await safeListEntries(absPath)
  const documentXml = (await readTextIfExists(absPath, 'word/document.xml')) ?? ''
  const stylesXml = (await readTextIfExists(absPath, 'word/styles.xml')) ?? ''
  const appXml = await readTextIfExists(absPath, 'docProps/app.xml')
  const coreXml = await readTextIfExists(absPath, 'docProps/core.xml')

  const paragraphCount = countMatches(documentXml, /<w:p(?:\s[^>]*)?>/g)
  const bodyText = extractRunText(documentXml)
  const wordCount = countWordsCJKAware(bodyText)

  // Headings are paragraphs with pStyle referencing a Heading style.
  const headingCount = countMatches(
    documentXml,
    /<w:pStyle\s+w:val="(?:[hH]eading\d|Title|Subtitle)"/g,
  )

  const hasTrackedChanges =
    /<w:ins\b/.test(documentXml) || /<w:del\b/.test(documentXml)

  const hasComments = entries.includes('word/comments.xml')

  // Protection: settings.xml with documentProtection edit="readOnly" or similar.
  const settingsXml = (await readTextIfExists(absPath, 'word/settings.xml')) ?? ''
  const isProtected = /<w:documentProtection\b[^>]*w:edit="(?:readOnly|forms|comments|trackedChanges)"/.test(
    settingsXml,
  )

  const availableStyles = parseStyles(stylesXml)
  const metadata = parseMetadata(coreXml)
  const pageCount = estimatePageCount(documentXml, appXml)

  // Suggested next tool: prefer tracked-changes if present, else comments, else xml.
  let suggestedNextTool: DocxSummary['suggestedNextTool']
  if (hasTrackedChanges) {
    suggestedNextTool = {
      tool: 'WordInspect',
      action: 'tracked-changes',
      reason: 'Document contains tracked changes; inspect them before any edit.',
    }
  } else if (hasComments) {
    suggestedNextTool = {
      tool: 'WordInspect',
      action: 'comments',
      reason: 'Document contains comments; review them for pending discussion threads.',
    }
  } else {
    suggestedNextTool = {
      tool: 'WordInspect',
      action: 'outline',
      reason: 'No tracked changes / comments. Outline is the fastest way to plan edits.',
    }
  }

  return {
    pageCount,
    paragraphCount,
    wordCount,
    headingCount,
    hasTrackedChanges,
    hasComments,
    isProtected,
    availableStyles,
    suggestedNextTool,
    metadata,
  }
}

// ---------------------------------------------------------------------------
// Action: outline
// ---------------------------------------------------------------------------

export async function inspectOutline(absPath: string): Promise<DocxOutlineNode[]> {
  const documentXml = (await readTextIfExists(absPath, 'word/document.xml')) ?? ''

  // Walk <w:p> elements. For each paragraph, look for pStyle HeadingN and
  // capture the concatenated run text. Build a tree by stacking the last
  // node per level.
  const paragraphRe = /<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g
  const flat: Array<{ level: number; text: string; paraId?: string }> = []
  let pm: RegExpExecArray | null
  while ((pm = paragraphRe.exec(documentXml)) !== null) {
    const attrs = pm[1] ?? ''
    const body = pm[2] ?? ''
    const styleMatch = body.match(/<w:pStyle\s+w:val="([^"]+)"/)
    if (!styleMatch) continue
    const styleId = styleMatch[1]!
    const levelMatch = styleId.match(/^[hH]eading(\d+)$/)
    if (!levelMatch) continue
    const level = Number.parseInt(levelMatch[1]!, 10)
    if (!Number.isFinite(level) || level < 1 || level > 9) continue
    const text = extractRunText(body).trim()
    const paraIdMatch = attrs.match(/w14:paraId="([^"]+)"/)
    flat.push({ level, text, paraId: paraIdMatch ? paraIdMatch[1] : undefined })
  }

  // Build tree: maintain a stack of last-seen nodes per level.
  const roots: DocxOutlineNode[] = []
  const stack: DocxOutlineNode[] = []
  for (const item of flat) {
    const node: DocxOutlineNode = {
      level: item.level,
      text: item.text,
      paraId: item.paraId,
      children: [],
    }
    while (stack.length > 0 && stack[stack.length - 1]!.level >= item.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1]!.children.push(node)
    }
    stack.push(node)
  }
  return roots
}

// ---------------------------------------------------------------------------
// Action: text — thin wrapper over docxExtractor
// ---------------------------------------------------------------------------

export async function inspectText(
  absPath: string,
  opts: {
    pageRange?: string
    withCoords?: boolean
    assetDirAbsPath?: string
    assetRelPrefix?: string
  } = {},
): Promise<{ text: string; pages?: Array<{ page: number; text: string }>; assetDir?: string }> {
  // Guard: enforce 20-page per-call limit BEFORE any IO so the error is cheap.
  if (opts.pageRange) {
    const parsed = parsePageRange(opts.pageRange)
    if (rangeSpan(parsed) > PAGE_RANGE_LIMIT) {
      throw new DocxPageRangeTooLargeError(opts.pageRange, PAGE_RANGE_LIMIT)
    }
  }

  // Reuse docxExtractor (shared extraction source of truth). If no session
  // asset dir was supplied, write to a temp dir inside os.tmpdir() so the
  // extractor's convertImage callback has a place to land images — callers
  // that don't care about assets just discard the directory.
  const assetDirAbsPath =
    opts.assetDirAbsPath ??
    (await fs.mkdtemp(path.join(os.tmpdir(), 'docx-inspect-text-')))
  const assetRelPrefix = opts.assetRelPrefix ?? path.basename(assetDirAbsPath)

  const result = await extractDocxContent(absPath, assetDirAbsPath, assetRelPrefix)
  // The extractor returns markdown; WordInspect(text) expects plain text-ish
  // content, which is what the markdown is (images are refs, not bytes). We
  // surface it as the `text` field directly.
  return {
    text: result.content ?? '',
    assetDir: result.assetDir,
  }
}

// ---------------------------------------------------------------------------
// Action: tables
// ---------------------------------------------------------------------------

/**
 * Parse all `<w:tbl>` elements from document.xml. Respects vertical merges
 * (w:vMerge) and horizontal merges (w:gridSpan).
 */
export async function inspectTables(
  absPath: string,
  _opts?: { pageRange?: string },
): Promise<DocxTable[]> {
  const documentXml = (await readTextIfExists(absPath, 'word/document.xml')) ?? ''

  const tables: DocxTable[] = []
  const tblRe = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g
  let tm: RegExpExecArray | null
  while ((tm = tblRe.exec(documentXml)) !== null) {
    const tblBody = tm[1] ?? ''
    const rows: DocxTableCell[][] = []
    const trRe = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g
    let trM: RegExpExecArray | null
    while ((trM = trRe.exec(tblBody)) !== null) {
      const trBody = trM[1] ?? ''
      const cells: DocxTableCell[] = []
      const tcRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g
      let tcM: RegExpExecArray | null
      while ((tcM = tcRe.exec(trBody)) !== null) {
        const tcBody = tcM[1] ?? ''
        // Extract tcPr if present.
        const tcPrMatch = tcBody.match(/<w:tcPr\b[^>]*>([\s\S]*?)<\/w:tcPr>/)
        const tcPr = tcPrMatch ? tcPrMatch[1]! : ''
        // gridSpan → colSpan.
        const gridSpanMatch = tcPr.match(/<w:gridSpan\s+w:val="(\d+)"/)
        const colSpan = gridSpanMatch
          ? Number.parseInt(gridSpanMatch[1]!, 10)
          : undefined
        // vMerge attribute: restart, continue (default when val missing → continue).
        const vMergeTag = tcPr.match(/<w:vMerge(?:\s+w:val="([^"]+)")?\s*\/>/)
        let vMergeKind: 'restart' | 'continue' | undefined
        if (vMergeTag) {
          vMergeKind = vMergeTag[1] === 'restart' ? 'restart' : 'continue'
        }
        // Cell text: extract run text from tc body (excluding tcPr noise).
        const tcBodyNoPr = tcBody.replace(/<w:tcPr\b[^>]*>[\s\S]*?<\/w:tcPr>/, '')
        const text = extractRunText(tcBodyNoPr)
        const cell: DocxTableCell = { text }
        if (colSpan && colSpan > 1) cell.colSpan = colSpan
        // Mark vMerge kind on the cell temporarily via a non-public field —
        // we'll compute final rowSpan below in a second pass, then strip.
        ;(cell as unknown as { __vMerge?: 'restart' | 'continue' }).__vMerge = vMergeKind
        cells.push(cell)
      }
      rows.push(cells)
    }

    // Second pass: compute rowSpan for each vMerge restart cell by scanning
    // subsequent rows' same column index for `continue` cells.
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!
      for (let c = 0; c < row.length; c++) {
        const cell = row[c]! as DocxTableCell & { __vMerge?: 'restart' | 'continue' }
        if (cell.__vMerge !== 'restart') continue
        let span = 1
        for (let rr = r + 1; rr < rows.length; rr++) {
          const nextCell = rows[rr]![c] as
            | (DocxTableCell & { __vMerge?: 'restart' | 'continue' })
            | undefined
          if (!nextCell || nextCell.__vMerge !== 'continue') break
          span++
        }
        if (span > 1) cell.rowSpan = span
      }
    }

    // Strip the __vMerge helper before returning.
    for (const row of rows) {
      for (const cell of row) {
        delete (cell as { __vMerge?: unknown }).__vMerge
      }
    }

    tables.push({ rows })
  }

  return tables
}

// ---------------------------------------------------------------------------
// Action: images
// ---------------------------------------------------------------------------

/**
 * List embedded media (word/media/*). When extractImages=true, write copies
 * into the session asset dir and return URLs + decoded width/height via sharp.
 */
export async function inspectImages(
  absPath: string,
  opts: {
    extractImages?: boolean
    assetDirAbsPath?: string
    assetRelPrefix?: string
  } = {},
): Promise<DocxImage[]> {
  const entries = await safeListEntries(absPath)
  const mediaEntries = entries.filter((e) => e.startsWith('word/media/'))
  if (mediaEntries.length === 0) return []

  const doExtract = !!opts.extractImages
  const sharp = doExtract ? (await import('sharp')).default : undefined
  if (doExtract) {
    if (!opts.assetDirAbsPath || !opts.assetRelPrefix) {
      throw new Error('extractImages=true requires assetDirAbsPath + assetRelPrefix.')
    }
    await fs.mkdir(opts.assetDirAbsPath, { recursive: true })
  }

  const out: DocxImage[] = []
  for (const entryPath of mediaEntries) {
    const fileName = path.basename(entryPath)
    const info: DocxImage = { name: fileName }
    try {
      const buf = await readZipEntryBuffer(absPath, entryPath)
      if (sharp) {
        try {
          const meta = await sharp(buf).metadata()
          info.width = meta.width ?? 0
          info.height = meta.height ?? 0
        } catch {
          info.width = 0
          info.height = 0
        }
        if (doExtract && opts.assetDirAbsPath && opts.assetRelPrefix) {
          const outPath = path.join(opts.assetDirAbsPath, fileName)
          await fs.writeFile(outPath, buf)
          info.url = `${opts.assetRelPrefix}/${fileName}`
        }
      } else {
        // Metadata-only: try sharp in a best-effort way.
        try {
          const sh = (await import('sharp')).default
          const meta = await sh(buf).metadata()
          info.width = meta.width ?? 0
          info.height = meta.height ?? 0
        } catch {
          info.width = 0
          info.height = 0
        }
      }
    } catch {
      info.width = 0
      info.height = 0
    }
    out.push(info)
  }
  return out
}

// ---------------------------------------------------------------------------
// Action: comments
// ---------------------------------------------------------------------------

export async function inspectComments(absPath: string): Promise<DocxComment[]> {
  const commentsXml = await readTextIfExists(absPath, 'word/comments.xml')
  if (!commentsXml) return []
  const commentsExtXml = await readTextIfExists(absPath, 'word/commentsExtended.xml')

  const commentRe = /<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g
  const out: DocxComment[] = []
  const paraIdToCommentId = new Map<string, string>()
  const commentIdToParaId = new Map<string, string>()

  let m: RegExpExecArray | null
  while ((m = commentRe.exec(commentsXml)) !== null) {
    const attrs = m[1] ?? ''
    const body = m[2] ?? ''
    const idMatch = attrs.match(/w:id="([^"]+)"/)
    const authorMatch = attrs.match(/w:author="([^"]+)"/)
    const dateMatch = attrs.match(/w:date="([^"]+)"/)
    if (!idMatch) continue
    const id = idMatch[1]!
    // Grab all paraIds within the comment body (w14:paraId on inner w:p).
    const paraIdMatch = body.match(/w14:paraId="([^"]+)"/)
    if (paraIdMatch) {
      paraIdToCommentId.set(paraIdMatch[1]!, id)
      commentIdToParaId.set(id, paraIdMatch[1]!)
    }
    out.push({
      id,
      author: authorMatch ? authorMatch[1]! : '',
      date: dateMatch ? dateMatch[1]! : '',
      text: extractRunText(body),
    })
  }

  // Link replies via commentsExtended: for each <w15:commentEx paraId="X"
  // paraIdParent="Y"/>, the comment owning paraId X is a reply to the comment
  // owning paraId Y.
  if (commentsExtXml) {
    const exRe = /<w15:commentEx\b([^>]*)\/>/g
    let em: RegExpExecArray | null
    while ((em = exRe.exec(commentsExtXml)) !== null) {
      const attrs = em[1] ?? ''
      const paraIdMatch = attrs.match(/w15:paraId="([^"]+)"/)
      const parentMatch = attrs.match(/w15:paraIdParent="([^"]+)"/)
      if (!paraIdMatch || !parentMatch) continue
      const childCommentId = paraIdToCommentId.get(paraIdMatch[1]!)
      const parentCommentId = paraIdToCommentId.get(parentMatch[1]!)
      if (!childCommentId || !parentCommentId) continue
      const child = out.find((c) => c.id === childCommentId)
      if (child) child.parentId = parentCommentId
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Action: tracked-changes
// ---------------------------------------------------------------------------

export async function inspectTrackedChanges(
  absPath: string,
): Promise<DocxTrackedChange[]> {
  const documentXml = (await readTextIfExists(absPath, 'word/document.xml')) ?? ''
  const out: DocxTrackedChange[] = []

  const collect = (
    tag: 'w:ins' | 'w:del',
    type: DocxTrackedChange['type'],
  ): void => {
    const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(documentXml)) !== null) {
      const attrs = m[1] ?? ''
      const body = m[2] ?? ''
      const idMatch = attrs.match(/w:id="([^"]+)"/)
      const authorMatch = attrs.match(/w:author="([^"]+)"/)
      const dateMatch = attrs.match(/w:date="([^"]+)"/)
      // For deletions the visible text lives in <w:delText>; for insertions
      // in <w:t>. Handle both so runText is always populated.
      let runText = ''
      const delTextRe = /<w:delText(?:\s[^>]*)?>([\s\S]*?)<\/w:delText>/g
      let dm: RegExpExecArray | null
      while ((dm = delTextRe.exec(body)) !== null) runText += decodeXmlEntities(dm[1] ?? '')
      if (runText.length === 0) runText = extractRunText(body)
      out.push({
        id: idMatch ? idMatch[1]! : '',
        author: authorMatch ? authorMatch[1]! : '',
        date: dateMatch ? dateMatch[1]! : '',
        type,
        runText: runText || undefined,
      })
    }
  }

  collect('w:ins', 'insert')
  collect('w:del', 'delete')

  return out
}

// ---------------------------------------------------------------------------
// Action: xml
// ---------------------------------------------------------------------------

export async function inspectXml(
  absPath: string,
  opts: { partName?: string } = {},
): Promise<{ partName: string; xml: string }> {
  let partName = opts.partName ?? 'word/document.xml'
  // Accept both "comments" and "word/comments.xml" style inputs; if the user
  // passes a bare name without extension, assume it's under word/.
  if (!partName.includes('/')) {
    partName = `word/${partName}${partName.endsWith('.xml') ? '' : '.xml'}`
  }
  const xml = await readZipEntryText(absPath, partName)
  return { partName, xml }
}

// ---------------------------------------------------------------------------
// Action: render — libreoffice headless → pdf-lib → sharp
// ---------------------------------------------------------------------------

/**
 * Cache the resolved soffice binary path. Probed once at first use to avoid
 * spawning `soffice --version` on every render call. `null` = probed and
 * unavailable; `string` = absolute path to a working soffice. Undefined =
 * not yet probed.
 */
let sofficeBinaryCache: string | null | undefined

/** Serialize render() calls so we never spawn concurrent soffice processes —
 * LibreOffice user-profile locks can collide under concurrent load. */
let sofficeQueue: Promise<unknown> = Promise.resolve()

const SOFFICE_FALLBACK_PATHS = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/local/bin/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/bin/soffice',
]

/**
 * Probe soffice availability. Tries `soffice` from PATH first; on failure
 * walks well-known macOS / Linux install dirs. Result is memoized for the
 * lifetime of the process. Call `resetSofficeCache()` from a test if you
 * need to re-probe.
 */
export function probeSofficeAvailable(): boolean {
  return resolveSofficeBinary() !== null
}

/** Resolve and cache the absolute soffice binary path (or null). */
export function resolveSofficeBinary(): string | null {
  if (sofficeBinaryCache !== undefined) return sofficeBinaryCache
  const candidates = ['soffice', ...SOFFICE_FALLBACK_PATHS]
  for (const candidate of candidates) {
    try {
      const r = spawnSync(candidate, ['--version'], { timeout: 3000 })
      if (r.status === 0) {
        sofficeBinaryCache = candidate
        return sofficeBinaryCache
      }
    } catch {
      // try next
    }
  }
  sofficeBinaryCache = null
  return null
}

export function resetSofficeCache(): void {
  sofficeBinaryCache = undefined
}

/** Run `soffice --headless --convert-to pdf <absPath> --outdir <dir>` with a
 * 30s default timeout. Serialized via sofficeQueue to avoid user-profile
 * lock collisions. */
async function sofficeConvertToPdf(
  docxAbsPath: string,
  outDir: string,
  timeoutMs = 30_000,
): Promise<string> {
  const task = async (): Promise<string> => {
    const binary = resolveSofficeBinary()
    if (!binary) throw new DocxLibreOfficeUnavailableError()
    await fs.mkdir(outDir, { recursive: true })
    // Use a per-run user profile so parallel Node processes (e.g. CI matrix)
    // never collide on the shared ~/.config/libreoffice lockfile.
    const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-profile-'))
    try {
      const userInstallArg = `-env:UserInstallation=file://${profileDir}`
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          binary,
          [
            userInstallArg,
            '--headless',
            '--norestore',
            '--nologo',
            '--nodefault',
            '--convert-to',
            'pdf',
            '--outdir',
            outDir,
            docxAbsPath,
          ],
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
      const baseName = path.basename(docxAbsPath, path.extname(docxAbsPath))
      const producedPdf = path.join(outDir, `${baseName}.pdf`)
      return producedPdf
    } finally {
      // Best-effort cleanup of the per-run profile dir.
      fs.rm(profileDir, { recursive: true, force: true }).catch(() => {})
    }
  }
  const prev = sofficeQueue
  const next = prev.then(task, task)
  sofficeQueue = next.catch(() => undefined)
  return next
}

export async function renderDocxPages(
  absPath: string,
  opts: {
    pageRange?: string
    scale?: number
    assetDirAbsPath: string
    assetRelPrefix: string
  },
): Promise<DocxRenderPage[]> {
  if (!probeSofficeAvailable()) {
    throw new DocxLibreOfficeUnavailableError()
  }
  const scale = opts.scale ?? 2
  const parsed = opts.pageRange ? parsePageRange(opts.pageRange) : undefined
  if (parsed && rangeSpan(parsed) > PAGE_RANGE_LIMIT) {
    throw new DocxPageRangeTooLargeError(opts.pageRange!, PAGE_RANGE_LIMIT)
  }

  await fs.mkdir(opts.assetDirAbsPath, { recursive: true })

  // 1. soffice convert → pdf into a temp dir.
  const tmpPdfDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-render-pdf-'))
  let pdfPath: string
  try {
    pdfPath = await sofficeConvertToPdf(absPath, tmpPdfDir)
  } catch (err) {
    await fs.rm(tmpPdfDir, { recursive: true, force: true }).catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`DOCX → PDF conversion failed: ${msg}`)
  }

  try {
    // 2. Use @hyzyla/pdfium (same as pdfInspectEngine.renderPdfPages) for
    // per-page bitmap rendering.
    const pdfBuf = await fs.readFile(pdfPath)
    const { PDFiumLibrary } = await import('@hyzyla/pdfium')
    const sharp = (await import('sharp')).default
    const lib = await PDFiumLibrary.init()
    const doc = await lib.loadDocument(new Uint8Array(pdfBuf))
    try {
      const pageCount = doc.getPageCount()
      const effective = parsed
        ? {
            start: Math.max(1, parsed.start),
            end: Math.min(pageCount, parsed.end),
          }
        : { start: 1, end: pageCount }

      const pages: DocxRenderPage[] = []
      for (let p = effective.start; p <= effective.end; p++) {
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
          page: p,
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
  } finally {
    await fs.rm(tmpPdfDir, { recursive: true, force: true }).catch(() => {})
  }
}
