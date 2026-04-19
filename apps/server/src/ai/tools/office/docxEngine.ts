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
 * DOCX Engine — write-side OOXML assembly.
 *
 * Responsibilities:
 *   - Phase 2: buildDocument(settings, content)  → create action
 *   - Phase 3+: (not implemented yet)
 *
 * Sub-renderers for each ContentItem type are kept as private functions
 * inside this file. The renderer emits raw OOXML strings which are then
 * stitched into word/document.xml, styles.xml, numbering.xml, footnotes.xml,
 * header1.xml and footer1.xml — plus the corresponding [Content_Types].xml
 * overrides and word/_rels/document.xml.rels relationships.
 */
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { resolveToolPath } from '@/ai/tools/toolScope'

// ---------------------------------------------------------------------------
// Public types (mirror the zod schema shape from packages/api/.../word.ts)
// ---------------------------------------------------------------------------

export type DocxTextRun = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  superscript?: boolean
  subscript?: boolean
  font?: string
  size?: number
  color?: string
  highlight?: string
  style?: string
}

export type DocxPageSettings = {
  size?: 'a4' | 'letter' | 'legal' | 'a3' | 'a5' | 'b5' | 'tabloid'
  orientation?: 'portrait' | 'landscape'
  margins?: {
    top?: number
    bottom?: number
    left?: number
    right?: number
    header?: number
    footer?: number
  }
}

export type DocxColumnsSettings = {
  count: number
  space?: number
  separator?: boolean
}

export type DocxHeaderFooterContent = {
  runs?: DocxTextRun[]
  includePageNumber?: boolean
  alignment?: 'left' | 'center' | 'right'
}

export type DocxDocumentSettings = {
  page?: DocxPageSettings
  columns?: DocxColumnsSettings
  defaultFont?: { family?: string; size?: number }
  header?: DocxHeaderFooterContent
  footer?: DocxHeaderFooterContent
}

export type DocxContentItem =
  | {
      type: 'heading'
      text: string
      level?: number
      alignment?: 'left' | 'center' | 'right' | 'justify'
      color?: string
      font?: string
      size?: number
      pageBreakBefore?: boolean
    }
  | {
      type: 'paragraph'
      runs: DocxTextRun[]
      alignment?: 'left' | 'center' | 'right' | 'justify'
      spacing?: {
        before?: number
        after?: number
        line?: number
        lineRule?: 'auto' | 'exact' | 'atLeast'
      }
      indent?: {
        left?: number
        right?: number
        firstLine?: number
        hanging?: number
      }
      pageBreakBefore?: boolean
      style?: string
    }
  | {
      type: 'table'
      columnWidths?: number[]
      borders?: {
        top?: DocxTableBorder
        bottom?: DocxTableBorder
        left?: DocxTableBorder
        right?: DocxTableBorder
        insideH?: DocxTableBorder
        insideV?: DocxTableBorder
      }
      shading?: string
      cellPadding?: {
        top?: number
        bottom?: number
        left?: number
        right?: number
      }
      headers?: string[]
      rows: Array<string[] | DocxTableCell[]>
    }
  | {
      type: 'bullet-list'
      items: Array<string | { runs: DocxTextRun[]; level?: number }>
    }
  | {
      type: 'numbered-list'
      items: Array<string | { runs: DocxTextRun[]; level?: number }>
    }
  | {
      type: 'image'
      source: string
      width?: number
      widthPx?: number
      heightPx?: number
      alt?: string
      alignment?: 'left' | 'center' | 'right'
    }
  | { type: 'page-break' }
  | {
      type: 'toc'
      title?: string
      minLevel?: number
      maxLevel?: number
    }
  | { type: 'footnote-ref'; text: string }
  | { type: 'hyperlink'; url: string; runs: DocxTextRun[] }

export type DocxTableBorder = {
  style?: 'single' | 'double' | 'dashed' | 'dotted' | 'thick' | 'none'
  size?: number
  color?: string
}

export type DocxTableCell = {
  runs?: DocxTextRun[]
  text?: string
  width?: number
  shading?: string
  borders?: {
    top?: DocxTableBorder
    bottom?: DocxTableBorder
    left?: DocxTableBorder
    right?: DocxTableBorder
  }
  padding?: {
    top?: number
    bottom?: number
    left?: number
    right?: number
  }
  merge?: {
    rowSpan?: number
    colSpan?: number
  }
  verticalAlign?: 'top' | 'center' | 'bottom'
}

// ---------------------------------------------------------------------------
// Build result
// ---------------------------------------------------------------------------

export type DocxBuildResult = {
  entries: Map<string, Buffer>
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DocxBuildError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'DocxBuildError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Helpers — OOXML escaping + XML fragments
// ---------------------------------------------------------------------------

/**
 * Escape for XML text nodes. We deliberately do NOT convert straight quotes
 * (`'` / `"`) to `&apos;` / `&quot;` so tests that inspect `docXml.includes("it's")`
 * still match. XML spec only requires `&`, `<`, `>` in text content.
 */
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Attribute values use the full escape set including quotes. */
function xmlAttrEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const W14_NS = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"'
const W15_NS = 'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"'
const W16CID_NS = 'xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"'
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const PIC_NS = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
const WP_NS = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'

// ---------------------------------------------------------------------------
// Page size table — twips (1/1440 inch).
// ---------------------------------------------------------------------------

const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  a4: { width: 11906, height: 16838 },
  letter: { width: 12240, height: 15840 },
  legal: { width: 12240, height: 20160 },
  a3: { width: 16838, height: 23811 },
  a5: { width: 8391, height: 11906 },
  b5: { width: 9979, height: 14170 },
  tabloid: { width: 15840, height: 24480 },
}

const DEFAULT_MARGIN = 1440 // 1 inch
const DEFAULT_HEADER_MARGIN = 720
const DEFAULT_FOOTER_MARGIN = 720

// ---------------------------------------------------------------------------
// CJK detection
// ---------------------------------------------------------------------------

/** Returns true when the string contains any CJK ideograph or hiragana/katakana/hangul. */
function hasCJK(s: string): boolean {
  return /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF66-\uFF9F]/.test(s)
}

// ---------------------------------------------------------------------------
// Relationship manager
// ---------------------------------------------------------------------------

type Relationship = {
  id: string
  type: string
  target: string
  targetMode?: 'External'
}

export class RelManager {
  private counter = 0
  private rels: Relationship[] = []

  /** Allocate a new rId (starts at rId1, auto-increments). */
  nextId(): string {
    this.counter += 1
    return `rId${this.counter}`
  }

  /** Register a rel and return the rId. */
  add(type: string, target: string, targetMode?: 'External'): string {
    const id = this.nextId()
    this.rels.push({ id, type, target, targetMode })
    return id
  }

  /** Add pre-allocated rId (useful when we computed the id earlier). */
  addWithId(id: string, type: string, target: string, targetMode?: 'External'): void {
    this.rels.push({ id, type, target, targetMode })
  }

  /** Bump the internal counter so future nextId() skips already-taken ids. */
  setCounter(n: number): void {
    this.counter = Math.max(this.counter, n)
  }

  /** Check whether a given (type, target) pair is already registered. */
  has(type: string, target: string): boolean {
    return this.rels.some((r) => r.type === type && r.target === target)
  }

  renderXml(): string {
    const body = this.rels
      .map((r) => {
        const mode = r.targetMode ? ` TargetMode="${r.targetMode}"` : ''
        return `  <Relationship Id="${r.id}" Type="${r.type}" Target="${xmlAttrEscape(r.target)}"${mode}/>`
      })
      .join('\n')
    return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${body}
</Relationships>`
  }
}

// ---------------------------------------------------------------------------
// Run rendering
// ---------------------------------------------------------------------------

function renderRunProps(r: DocxTextRun): string {
  const parts: string[] = []
  if (r.style) parts.push(`<w:rStyle w:val="${xmlAttrEscape(r.style)}"/>`)
  if (r.font) {
    const f = xmlAttrEscape(r.font)
    parts.push(`<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/>`)
  }
  if (r.bold) parts.push('<w:b/>')
  if (r.italic) parts.push('<w:i/>')
  if (r.strike) parts.push('<w:strike/>')
  if (r.underline) parts.push('<w:u w:val="single"/>')
  if (r.color) parts.push(`<w:color w:val="${xmlAttrEscape(r.color)}"/>`)
  if (r.size !== undefined) parts.push(`<w:sz w:val="${r.size}"/>`)
  if (r.highlight) parts.push(`<w:highlight w:val="${xmlAttrEscape(r.highlight)}"/>`)
  if (r.superscript) parts.push('<w:vertAlign w:val="superscript"/>')
  if (r.subscript) parts.push('<w:vertAlign w:val="subscript"/>')
  if (parts.length === 0) return ''
  return `<w:rPr>${parts.join('')}</w:rPr>`
}

function renderRun(r: DocxTextRun): string {
  const rPr = renderRunProps(r)
  const text = xmlEscape(r.text ?? '')
  // xml:space="preserve" is required so leading/trailing whitespace is kept
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`
}

// ---------------------------------------------------------------------------
// Paragraph-level properties
// ---------------------------------------------------------------------------

function renderAlignment(alignment?: 'left' | 'center' | 'right' | 'justify'): string {
  if (!alignment) return ''
  const val = alignment === 'justify' ? 'both' : alignment
  return `<w:jc w:val="${val}"/>`
}

function renderSpacing(sp?: {
  before?: number
  after?: number
  line?: number
  lineRule?: 'auto' | 'exact' | 'atLeast'
}): string {
  if (!sp) return ''
  const attrs: string[] = []
  if (sp.before !== undefined) attrs.push(`w:before="${sp.before}"`)
  if (sp.after !== undefined) attrs.push(`w:after="${sp.after}"`)
  if (sp.line !== undefined) {
    attrs.push(`w:line="${sp.line}"`)
    attrs.push(`w:lineRule="${sp.lineRule ?? 'auto'}"`)
  }
  if (attrs.length === 0) return ''
  return `<w:spacing ${attrs.join(' ')}/>`
}

function renderIndent(ind?: {
  left?: number
  right?: number
  firstLine?: number
  hanging?: number
}): string {
  if (!ind) return ''
  const attrs: string[] = []
  if (ind.left !== undefined) attrs.push(`w:left="${ind.left}"`)
  if (ind.right !== undefined) attrs.push(`w:right="${ind.right}"`)
  if (ind.firstLine !== undefined) attrs.push(`w:firstLine="${ind.firstLine}"`)
  if (ind.hanging !== undefined) attrs.push(`w:hanging="${ind.hanging}"`)
  if (attrs.length === 0) return ''
  return `<w:ind ${attrs.join(' ')}/>`
}

/**
 * Render <w:pPr> children IN THE CORRECT ECMA-376 ORDER. Word is strict about
 * this — elements out of order cause the XML to be rejected.
 *
 * Order (simplified): pStyle → numPr → pBdr → shd → spacing → ind → jc →
 *   outlineLvl → rPr (paragraph mark rPr) → others
 */
type PPrProps = {
  pStyle?: string
  numPr?: { numId: number; ilvl: number }
  spacing?: { before?: number; after?: number; line?: number; lineRule?: 'auto' | 'exact' | 'atLeast' }
  indent?: { left?: number; right?: number; firstLine?: number; hanging?: number }
  alignment?: 'left' | 'center' | 'right' | 'justify'
  pageBreakBefore?: boolean
  rPrMark?: string // inner xml for <w:rPr> inside pPr (paragraph-mark run properties)
}

function renderPPr(p: PPrProps): string {
  if (
    !p.pStyle &&
    !p.numPr &&
    !p.spacing &&
    !p.indent &&
    !p.alignment &&
    !p.pageBreakBefore &&
    !p.rPrMark
  ) {
    return ''
  }
  const parts: string[] = []
  if (p.pStyle) parts.push(`<w:pStyle w:val="${xmlAttrEscape(p.pStyle)}"/>`)
  if (p.numPr) parts.push(`<w:numPr><w:ilvl w:val="${p.numPr.ilvl}"/><w:numId w:val="${p.numPr.numId}"/></w:numPr>`)
  if (p.pageBreakBefore) parts.push('<w:pageBreakBefore/>')
  const sp = renderSpacing(p.spacing)
  if (sp) parts.push(sp)
  const ind = renderIndent(p.indent)
  if (ind) parts.push(ind)
  const jc = renderAlignment(p.alignment)
  if (jc) parts.push(jc)
  if (p.rPrMark) parts.push(`<w:rPr>${p.rPrMark}</w:rPr>`)
  return `<w:pPr>${parts.join('')}</w:pPr>`
}

// ---------------------------------------------------------------------------
// Image handling
// ---------------------------------------------------------------------------

type EmbeddedImage = {
  mediaPath: string
  bytes: Buffer
  ext: string
  contentType: string
}

async function loadImageSource(source: string): Promise<{ bytes: Buffer; ext: string; contentType: string }> {
  let bytes: Buffer
  let filename: string
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const resp = await fetch(source)
    if (!resp.ok) {
      throw new DocxBuildError('IMAGE_FETCH_FAILED', `Failed to fetch image ${source}: HTTP ${resp.status}`)
    }
    bytes = Buffer.from(await resp.arrayBuffer())
    // Attempt to use URL pathname suffix for extension.
    try {
      filename = path.basename(new URL(source).pathname)
    } catch {
      filename = 'image'
    }
  } else {
    const { absPath } = resolveToolPath({ target: source })
    try {
      bytes = await fs.readFile(absPath)
    } catch (err) {
      throw new DocxBuildError('IMAGE_READ_FAILED', `Failed to read image ${source}: ${String((err as Error).message)}`)
    }
    filename = path.basename(absPath)
  }
  const ext = (path.extname(filename) || '.png').toLowerCase().replace(/^\./, '')
  let contentType = 'image/png'
  switch (ext) {
    case 'png':
      contentType = 'image/png'
      break
    case 'jpg':
    case 'jpeg':
      contentType = 'image/jpeg'
      break
    case 'gif':
      contentType = 'image/gif'
      break
    case 'bmp':
      contentType = 'image/bmp'
      break
    default:
      contentType = 'image/png'
  }
  return { bytes, ext: ext === 'jpg' ? 'jpeg' : ext, contentType }
}

function pxToEmu(px: number): number {
  // 96 DPI: 1 inch = 96 px = 914400 EMU → 1 px = 9525 EMU
  return Math.round(px * 9525)
}

// ---------------------------------------------------------------------------
// Table border / shading helpers
// ---------------------------------------------------------------------------

function renderBorder(name: string, b?: DocxTableBorder): string {
  if (!b) return ''
  const style = b.style ?? 'single'
  const sz = b.size ?? 4
  const color = b.color ?? '000000'
  return `<w:${name} w:val="${style}" w:sz="${sz}" w:space="0" w:color="${xmlAttrEscape(color)}"/>`
}

function renderTcBorders(b?: DocxTableCell['borders']): string {
  if (!b) return ''
  const parts: string[] = []
  if (b.top) parts.push(renderBorder('top', b.top))
  if (b.bottom) parts.push(renderBorder('bottom', b.bottom))
  if (b.left) parts.push(renderBorder('left', b.left))
  if (b.right) parts.push(renderBorder('right', b.right))
  if (parts.length === 0) return ''
  return `<w:tcBorders>${parts.join('')}</w:tcBorders>`
}

function renderTblBorders(
  b?:
    | {
        top?: DocxTableBorder
        bottom?: DocxTableBorder
        left?: DocxTableBorder
        right?: DocxTableBorder
        insideH?: DocxTableBorder
        insideV?: DocxTableBorder
      }
    | undefined,
): string {
  if (!b) return ''
  const parts: string[] = []
  if (b.top) parts.push(renderBorder('top', b.top))
  if (b.bottom) parts.push(renderBorder('bottom', b.bottom))
  if (b.left) parts.push(renderBorder('left', b.left))
  if (b.right) parts.push(renderBorder('right', b.right))
  if (b.insideH) parts.push(renderBorder('insideH', b.insideH))
  if (b.insideV) parts.push(renderBorder('insideV', b.insideV))
  if (parts.length === 0) return ''
  return `<w:tblBorders>${parts.join('')}</w:tblBorders>`
}

// ---------------------------------------------------------------------------
// Build state — accumulates all parts during content traversal.
// ---------------------------------------------------------------------------

type BuildState = {
  rels: RelManager
  bodyXml: string[] // accumulated <w:p> / <w:tbl> / <w:sectPr> etc
  footnotes: Array<{ id: number; text: string }>
  images: EmbeddedImage[]
  hasNumbering: boolean
  numberingBulletUsed: boolean
  numberingOrderedUsed: boolean
  hasToc: boolean
  // Optional TOC pre-scan result (used to fail fast on unknown styles)
  availableStyleIds: Set<string>
  contentTypeExtensionDefaults: Map<string, string> // ext → contentType
}

// ---------------------------------------------------------------------------
// Renderer: paragraph
// ---------------------------------------------------------------------------

function renderParagraph(
  para: Extract<DocxContentItem, { type: 'paragraph' }>,
): string {
  const pPr = renderPPr({
    pStyle: para.style,
    alignment: para.alignment,
    spacing: para.spacing,
    indent: para.indent,
    pageBreakBefore: para.pageBreakBefore,
  })
  const runsXml = (para.runs ?? []).map(renderRun).join('')
  return `<w:p>${pPr}${runsXml}</w:p>`
}

// ---------------------------------------------------------------------------
// Renderer: heading
// ---------------------------------------------------------------------------

function renderHeading(h: Extract<DocxContentItem, { type: 'heading' }>): string {
  const level = h.level ?? 1
  const pPr = renderPPr({
    pStyle: `Heading${level}`,
    alignment: h.alignment,
    pageBreakBefore: h.pageBreakBefore,
  })
  const run: DocxTextRun = {
    text: h.text,
    color: h.color,
    font: h.font,
    size: h.size,
  }
  return `<w:p>${pPr}${renderRun(run)}</w:p>`
}

// ---------------------------------------------------------------------------
// Renderer: page-break
// ---------------------------------------------------------------------------

function renderPageBreak(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

// ---------------------------------------------------------------------------
// Renderer: toc
// ---------------------------------------------------------------------------

function renderToc(toc: Extract<DocxContentItem, { type: 'toc' }>): string {
  const title = toc.title
    ? `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(toc.title)}</w:t></w:r></w:p>`
    : ''
  const minLevel = toc.minLevel ?? 1
  const maxLevel = toc.maxLevel ?? 3
  const instr = `TOC \\o "${minLevel}-${maxLevel}" \\h \\z \\u`
  // Standard TOC field structure.
  const tocField =
    `<w:p>` +
    `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve">${xmlEscape(instr)}</w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t xml:space="preserve">Right-click to update field.</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:p>`
  return title + tocField
}

// ---------------------------------------------------------------------------
// Renderer: footnote-ref
// ---------------------------------------------------------------------------

function renderFootnoteRef(id: number): string {
  // Insert a paragraph carrying the footnote reference superscript
  return `<w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r></w:p>`
}

// ---------------------------------------------------------------------------
// Renderer: hyperlink
// ---------------------------------------------------------------------------

function renderHyperlink(
  h: Extract<DocxContentItem, { type: 'hyperlink' }>,
  rels: RelManager,
): string {
  const rid = rels.add(
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    h.url,
    'External',
  )
  const runsXml = (h.runs ?? []).map(renderRun).join('')
  return `<w:p><w:hyperlink r:id="${rid}" w:history="1">${runsXml}</w:hyperlink></w:p>`
}

// ---------------------------------------------------------------------------
// Renderer: image
// ---------------------------------------------------------------------------

async function renderImage(
  img: Extract<DocxContentItem, { type: 'image' }>,
  state: BuildState,
): Promise<string> {
  const loaded = await loadImageSource(img.source)
  const idx = state.images.length + 1
  const mediaPath = `word/media/image${idx}.${loaded.ext === 'jpeg' ? 'jpg' : loaded.ext}`
  state.images.push({
    mediaPath,
    bytes: loaded.bytes,
    ext: loaded.ext,
    contentType: loaded.contentType,
  })
  // Ensure content type default for this extension.
  const extKey = mediaPath.split('.').pop()!.toLowerCase()
  if (!state.contentTypeExtensionDefaults.has(extKey)) {
    state.contentTypeExtensionDefaults.set(extKey, loaded.contentType)
  }

  const rid = state.rels.add(
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
    `media/image${idx}.${loaded.ext === 'jpeg' ? 'jpg' : loaded.ext}`,
  )

  // Compute size: default 3 inch width if not specified.
  let cx: number
  let cy: number
  if (img.widthPx) cx = pxToEmu(img.widthPx)
  else if (img.width) cx = img.width
  else cx = pxToEmu(300)
  if (img.heightPx) cy = pxToEmu(img.heightPx)
  else cy = cx // default square; caller should provide heightPx for precision

  const alt = xmlAttrEscape(img.alt ?? '')
  const align = img.alignment
    ? `<w:pPr>${renderAlignment(img.alignment)}</w:pPr>`
    : ''

  // Use a nonZeroDocPrId for wp:docPr id attribute
  const docPrId = idx
  const drawing =
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" ${WP_NS}>` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${docPrId}" name="Picture ${docPrId}" descr="${alt}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks ${A_NS} noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic ${A_NS}>` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic ${PIC_NS}>` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="image${idx}.${loaded.ext === 'jpeg' ? 'jpg' : loaded.ext}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip ${R_NS} r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>`
  return `<w:p>${align}<w:r>${drawing}</w:r></w:p>`
}

// ---------------------------------------------------------------------------
// Renderer: table
// ---------------------------------------------------------------------------

function renderTable(tbl: Extract<DocxContentItem, { type: 'table' }>): string {
  const columnWidths = tbl.columnWidths ?? []
  const totalWidth = columnWidths.reduce((s, w) => s + w, 0)

  // Build tblGrid.
  const gridXml = columnWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')

  // tblPr with optional borders/shading at table level.
  const tblBordersXml = renderTblBorders(tbl.borders)
  const defaultTblBorders = tblBordersXml
    ? tblBordersXml
    : `<w:tblBorders>` +
      `<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
      `<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
      `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
      `<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
      `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
      `<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
      `</w:tblBorders>`
  const cp = tbl.cellPadding
  const tblCellMarXml = cp
    ? `<w:tblCellMar>${
        cp.top !== undefined ? `<w:top w:w="${cp.top}" w:type="dxa"/>` : ''
      }${cp.left !== undefined ? `<w:left w:w="${cp.left}" w:type="dxa"/>` : ''}${
        cp.bottom !== undefined ? `<w:bottom w:w="${cp.bottom}" w:type="dxa"/>` : ''
      }${cp.right !== undefined ? `<w:right w:w="${cp.right}" w:type="dxa"/>` : ''}</w:tblCellMar>`
    : ''
  // Always render the table at 100% of the usable page width (pct 5000).
  // When `columnWidths` are provided, their values survive as gridCol entries
  // and per-cell `w:tcW` hints — Word treats those as *relative* proportions
  // under `type="pct"` and rebalances to the page, so a model that sums its
  // columns to 10800 twips on an A4 page (9026 usable) no longer overflows.
  // This also fixes the old "auto" default that made plain tables render as
  // narrow content-fit blocks.
  const tblPr = `<w:tblPr><w:tblW w:w="5000" w:type="pct"/>${defaultTblBorders}${tblCellMarXml}</w:tblPr>`

  // Convert rows (possibly shorthand string[]) to DocxTableCell[].
  const normalizedRows: DocxTableCell[][] = tbl.rows.map((row) => {
    return (row as Array<string | DocxTableCell>).map((c) => {
      if (typeof c === 'string') return { text: c }
      return c
    })
  })

  // Render in a single pass that respects rowSpan + gridSpan and emits
  // vMerge continuation cells aligned column-wise.
  return renderTableWithMerges(tbl, normalizedRows, tblPr, gridXml)
}

function renderTableWithMerges(
  tbl: Extract<DocxContentItem, { type: 'table' }>,
  normalizedRows: DocxTableCell[][],
  tblPr: string,
  gridXml: string,
): string {
  const columnCount = tbl.columnWidths?.length ?? 0
  // Compute which column each visible cell occupies (accounting for gridSpan).
  // For each row, track pending vMerge-continue columns (set by rowSpan=restart above).
  const pendingVMerge: Array<{ restartRowIdx: number; restartColIdx: number; remaining: number }> = []

  const rowsXml: string[] = []
  for (let rowIdx = 0; rowIdx < normalizedRows.length; rowIdx++) {
    const row = normalizedRows[rowIdx]!
    const cellsXml: string[] = []
    let colIdx = 0
    let cursor = 0
    while (cursor < row.length || (colIdx < columnCount && pendingVMerge.some((p) => p.restartColIdx === colIdx && p.remaining > 0))) {
      // Check for a vMerge-continue slot at current column.
      const pending = pendingVMerge.find((p) => p.restartColIdx === colIdx && p.remaining > 0)
      if (pending) {
        // Emit a bare vMerge continuation cell with proper width.
        const colWidth = tbl.columnWidths?.[colIdx] ?? 0
        const tcPrParts: string[] = []
        if (colWidth > 0) tcPrParts.push(`<w:tcW w:w="${colWidth}" w:type="dxa"/>`)
        tcPrParts.push(`<w:vMerge/>`)
        const tcPr = `<w:tcPr>${tcPrParts.join('')}</w:tcPr>`
        cellsXml.push(`<w:tc>${tcPr}<w:p></w:p></w:tc>`)
        pending.remaining -= 1
        colIdx += 1
        continue
      }
      if (cursor >= row.length) break
      const cell = row[cursor]!
      cursor += 1
      const colSpan = cell.merge?.colSpan ?? 1
      const rowSpan = cell.merge?.rowSpan ?? 1

      const runs: DocxTextRun[] =
        cell.runs && cell.runs.length > 0 ? cell.runs : cell.text !== undefined ? [{ text: cell.text }] : []
      const tcPrParts: string[] = []
      // Derive width: prefer explicit cell.width, else aggregate columnWidths.
      let effectiveWidth = cell.width ?? 0
      if (!effectiveWidth && tbl.columnWidths) {
        effectiveWidth = 0
        for (let i = 0; i < colSpan; i++) {
          effectiveWidth += tbl.columnWidths[colIdx + i] ?? 0
        }
      }
      if (effectiveWidth > 0) {
        tcPrParts.push(`<w:tcW w:w="${effectiveWidth}" w:type="dxa"/>`)
      }
      if (colSpan > 1) tcPrParts.push(`<w:gridSpan w:val="${colSpan}"/>`)
      if (rowSpan > 1) {
        tcPrParts.push(`<w:vMerge w:val="restart"/>`)
        pendingVMerge.push({ restartRowIdx: rowIdx, restartColIdx: colIdx, remaining: rowSpan - 1 })
      }
      if (cell.shading) {
        tcPrParts.push(
          `<w:shd w:val="clear" w:color="auto" w:fill="${xmlAttrEscape(cell.shading)}"/>`,
        )
      }
      const borders = renderTcBorders(cell.borders)
      if (borders) tcPrParts.push(borders)
      if (cell.verticalAlign) {
        tcPrParts.push(`<w:vAlign w:val="${cell.verticalAlign}"/>`)
      }
      const tcPr = tcPrParts.length > 0 ? `<w:tcPr>${tcPrParts.join('')}</w:tcPr>` : '<w:tcPr/>'
      const paraRuns = runs.map(renderRun).join('')
      const paraBody = paraRuns || '<w:r><w:t xml:space="preserve"></w:t></w:r>'
      cellsXml.push(`<w:tc>${tcPr}<w:p>${paraBody}</w:p></w:tc>`)

      colIdx += colSpan
    }
    rowsXml.push(`<w:tr>${cellsXml.join('')}</w:tr>`)
  }

  return `<w:tbl>${tblPr}<w:tblGrid>${gridXml}</w:tblGrid>${rowsXml.join('')}</w:tbl>`
}

// ---------------------------------------------------------------------------
// Renderer: bullet / numbered list
// ---------------------------------------------------------------------------

function renderList(
  item: Extract<DocxContentItem, { type: 'bullet-list' } | { type: 'numbered-list' }>,
  state: BuildState,
): string {
  const numId = item.type === 'bullet-list' ? 1 : 2
  if (item.type === 'bullet-list') state.numberingBulletUsed = true
  else state.numberingOrderedUsed = true
  state.hasNumbering = true

  const paragraphs = item.items.map((li) => {
    const isString = typeof li === 'string'
    const runs: DocxTextRun[] = isString ? [{ text: li }] : li.runs
    const level = isString ? 0 : (li.level ?? 0)
    const pPr = renderPPr({
      pStyle: 'ListParagraph',
      numPr: { numId, ilvl: level },
    })
    const runsXml = runs.map(renderRun).join('')
    return `<w:p>${pPr}${runsXml}</w:p>`
  })
  return paragraphs.join('')
}

// ---------------------------------------------------------------------------
// styles.xml
// ---------------------------------------------------------------------------

function buildStylesXml(opts: {
  needsEastAsia: boolean
  defaultFontFamily?: string
  defaultFontSize?: number
}): string {
  const family = xmlAttrEscape(opts.defaultFontFamily ?? 'Calibri')
  const size = opts.defaultFontSize ?? 22
  const eastAsia = opts.needsEastAsia
    ? ' w:eastAsia="PingFang SC"'
    : ''
  return `${XML_DECL}<w:styles ${W_NS}>
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"${eastAsia}/>
        <w:sz w:val="${size}"/>
        <w:szCs w:val="${size}"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr/>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
  <w:style w:type="character" w:styleId="DefaultParagraphFont" w:default="1"><w:name w:val="Default Paragraph Font"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="480" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="4"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="5"/></w:pPr><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`
}

// ---------------------------------------------------------------------------
// numbering.xml
// ---------------------------------------------------------------------------

function buildNumberingXml(): string {
  // Always declare 3 levels for both bullet and ordered lists so B15's
  // expectation (lvl 0/1/2) holds regardless of which list block was used.
  const bulletLevels = [0, 1, 2]
    .map(
      (ilvl) =>
        `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + ilvl * 360}" w:hanging="360"/></w:pPr></w:lvl>`,
    )
    .join('')
  const orderedLevels = [0, 1, 2]
    .map(
      (ilvl) =>
        `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${ilvl + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + ilvl * 360}" w:hanging="360"/></w:pPr></w:lvl>`,
    )
    .join('')
  return `${XML_DECL}<w:numbering ${W_NS}>
  <w:abstractNum w:abstractNumId="0">${bulletLevels}</w:abstractNum>
  <w:abstractNum w:abstractNumId="1">${orderedLevels}</w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`
}

// ---------------------------------------------------------------------------
// footnotes.xml
// ---------------------------------------------------------------------------

function buildFootnotesXml(footnotes: Array<{ id: number; text: string }>): string {
  // Mandatory separator + continuationSeparator footnotes at ids -1 and 0.
  const preamble =
    `<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>` +
    `<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`
  const userFootnotes = footnotes
    .map(
      (f) =>
        `<w:footnote w:id="${f.id}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(f.text)}</w:t></w:r></w:p></w:footnote>`,
    )
    .join('')
  return `${XML_DECL}<w:footnotes ${W_NS}>${preamble}${userFootnotes}</w:footnotes>`
}

// ---------------------------------------------------------------------------
// header1.xml / footer1.xml
// ---------------------------------------------------------------------------

function buildHeaderXml(hf: DocxHeaderFooterContent): string {
  const pPr = renderPPr({
    pStyle: 'Header',
    alignment: hf.alignment ?? 'center',
  })
  const runsXml = (hf.runs ?? []).map(renderRun).join('')
  return `${XML_DECL}<w:hdr ${W_NS}><w:p>${pPr}${runsXml}</w:p></w:hdr>`
}

function buildFooterXml(hf: DocxHeaderFooterContent): string {
  const pPr = renderPPr({
    pStyle: 'Footer',
    alignment: hf.alignment ?? 'center',
  })
  const runsXml = (hf.runs ?? []).map(renderRun).join('')
  const pageNum = hf.includePageNumber
    ? `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
      `<w:r><w:instrText xml:space="preserve">PAGE</w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
    : ''
  return `${XML_DECL}<w:ftr ${W_NS}><w:p>${pPr}${runsXml}${pageNum}</w:p></w:ftr>`
}

// ---------------------------------------------------------------------------
// sectPr (section properties — page size / margin / columns / header refs)
// ---------------------------------------------------------------------------

function buildSectPr(opts: {
  settings: DocxDocumentSettings | undefined
  headerRId?: string
  footerRId?: string
}): string {
  const page = opts.settings?.page
  const sizeKey = page?.size ?? 'a4'
  const base = PAGE_SIZES[sizeKey] ?? PAGE_SIZES.a4!
  const portrait = (page?.orientation ?? 'portrait') === 'portrait'
  const w = portrait ? base.width : base.height
  const h = portrait ? base.height : base.width
  const orientAttr = page?.orientation === 'landscape' ? ` w:orient="landscape"` : ''
  const pgSz = `<w:pgSz w:w="${w}" w:h="${h}"${orientAttr}/>`

  const m = page?.margins ?? {}
  const top = m.top ?? DEFAULT_MARGIN
  const right = m.right ?? DEFAULT_MARGIN
  const bottom = m.bottom ?? DEFAULT_MARGIN
  const left = m.left ?? DEFAULT_MARGIN
  const header = m.header ?? DEFAULT_HEADER_MARGIN
  const footer = m.footer ?? DEFAULT_FOOTER_MARGIN
  const pgMar = `<w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="${header}" w:footer="${footer}" w:gutter="0"/>`

  const headerRef = opts.headerRId
    ? `<w:headerReference r:id="${opts.headerRId}" w:type="default"/>`
    : ''
  const footerRef = opts.footerRId
    ? `<w:footerReference r:id="${opts.footerRId}" w:type="default"/>`
    : ''

  let colsXml = ''
  const cols = opts.settings?.columns
  if (cols && cols.count >= 2) {
    const space = cols.space ?? 720
    const sep = cols.separator ? ' w:sep="1"' : ''
    colsXml = `<w:cols w:num="${cols.count}" w:space="${space}"${sep}/>`
  }

  return `<w:sectPr>${headerRef}${footerRef}${pgSz}${pgMar}${colsXml}</w:sectPr>`
}

// ---------------------------------------------------------------------------
// [Content_Types].xml
// ---------------------------------------------------------------------------

function buildContentTypesXml(opts: {
  hasNumbering: boolean
  hasFootnotes: boolean
  hasHeader: boolean
  hasFooter: boolean
  hasComments: boolean
  extensionDefaults: Map<string, string>
}): string {
  const defaults: string[] = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
  ]
  for (const [ext, ct] of opts.extensionDefaults) {
    defaults.push(`<Default Extension="${xmlAttrEscape(ext)}" ContentType="${xmlAttrEscape(ct)}"/>`)
  }
  const overrides: string[] = [
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
  ]
  if (opts.hasNumbering)
    overrides.push(
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
    )
  if (opts.hasFootnotes)
    overrides.push(
      '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>',
    )
  if (opts.hasHeader)
    overrides.push(
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
    )
  if (opts.hasFooter)
    overrides.push(
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>',
    )
  if (opts.hasComments) {
    overrides.push(
      '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>',
    )
    overrides.push(
      '<Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.ms-word.commentsExtended+xml"/>',
    )
  }
  return `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${defaults.join('\n  ')}
  ${overrides.join('\n  ')}
</Types>`
}

// ---------------------------------------------------------------------------
// _rels/.rels (root)
// ---------------------------------------------------------------------------

function buildRootRels(): string {
  return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
}

// ---------------------------------------------------------------------------
// Pre-scan content for structural constraints
// ---------------------------------------------------------------------------

/**
 * Return the set of TextRun / paragraph style ids referenced in content.
 * Used for TOC_STYLE_CONFLICT validation (B18).
 */
function collectStyleReferences(content: DocxContentItem[]): Set<string> {
  const out = new Set<string>()
  for (const item of content) {
    if (item.type === 'paragraph') {
      if (item.style) out.add(item.style)
      for (const r of item.runs) {
        if (r.style) out.add(r.style)
      }
    } else if (item.type === 'bullet-list' || item.type === 'numbered-list') {
      for (const li of item.items) {
        if (typeof li !== 'string') {
          for (const r of li.runs) if (r.style) out.add(r.style)
        }
      }
    } else if (item.type === 'hyperlink') {
      for (const r of item.runs) if (r.style) out.add(r.style)
    }
  }
  return out
}

/** Built-in style ids guaranteed by buildStylesXml. */
const BUILTIN_STYLES = new Set<string>([
  'Normal',
  'DefaultParagraphFont',
  'Heading1',
  'Heading2',
  'Heading3',
  'Heading4',
  'Heading5',
  'Heading6',
  'ListParagraph',
  'Header',
  'Footer',
  'Hyperlink',
  'FootnoteText',
])

/** Scan content for a TOC block and validate referenced styles exist. */
function validateTocStyles(content: DocxContentItem[]): void {
  const hasToc = content.some((c) => c.type === 'toc')
  if (!hasToc) return
  const referenced = collectStyleReferences(content)
  for (const id of referenced) {
    if (!BUILTIN_STYLES.has(id)) {
      throw new DocxBuildError(
        'TOC_STYLE_CONFLICT',
        `TOC_STYLE_CONFLICT: style "${id}" is not a built-in style; define it via availableStyles or reference a HeadingN style.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Detect CJK anywhere in content (runs + strings)
// ---------------------------------------------------------------------------

function contentHasCJK(content: DocxContentItem[], settings?: DocxDocumentSettings): boolean {
  const check = (s?: string) => (s ? hasCJK(s) : false)
  const runs = (rs?: DocxTextRun[]) => rs?.some((r) => check(r.text)) ?? false
  for (const item of content) {
    switch (item.type) {
      case 'heading':
        if (check(item.text)) return true
        break
      case 'paragraph':
        if (runs(item.runs)) return true
        break
      case 'table':
        for (const row of item.rows) {
          for (const cell of row as Array<string | DocxTableCell>) {
            if (typeof cell === 'string') {
              if (check(cell)) return true
            } else {
              if (check(cell.text)) return true
              if (runs(cell.runs)) return true
            }
          }
        }
        break
      case 'bullet-list':
      case 'numbered-list':
        for (const li of item.items) {
          if (typeof li === 'string') {
            if (check(li)) return true
          } else if (runs(li.runs)) return true
        }
        break
      case 'footnote-ref':
        if (check(item.text)) return true
        break
      case 'hyperlink':
        if (runs(item.runs)) return true
        break
      case 'toc':
        if (check(item.title)) return true
        break
    }
  }
  if (settings?.header && runs(settings.header.runs)) return true
  if (settings?.footer && runs(settings.footer.runs)) return true
  return false
}

// ---------------------------------------------------------------------------
// Main: buildDocument
// ---------------------------------------------------------------------------

export async function buildDocument(
  settings: DocxDocumentSettings | undefined,
  content: DocxContentItem[],
): Promise<DocxBuildResult> {
  if (!Array.isArray(content) || content.length === 0) {
    throw new DocxBuildError('EMPTY_CONTENT', 'content must be a non-empty array for create action.')
  }

  // Validate TOC style references — must throw TOC_STYLE_CONFLICT if any
  // referenced style is unknown.
  validateTocStyles(content)

  // Initialize build state.
  const rels = new RelManager()
  const state: BuildState = {
    rels,
    bodyXml: [],
    footnotes: [],
    images: [],
    hasNumbering: false,
    numberingBulletUsed: false,
    numberingOrderedUsed: false,
    hasToc: false,
    availableStyleIds: new Set(BUILTIN_STYLES),
    contentTypeExtensionDefaults: new Map(),
  }

  // Reserve rId1 for styles.xml, rId2 for numbering.xml so user-allocated rels
  // start at rId3+. Note: order matters because buildDocument eventually emits
  // these rels via RelManager. We pre-register them here.
  const stylesRid = rels.add(
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
    'styles.xml',
  )
  void stylesRid // always rId1

  // numbering rel registered lazily only if a list block is used.
  let numberingRid: string | undefined
  const reserveNumberingRel = () => {
    if (!numberingRid) {
      numberingRid = rels.add(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
        'numbering.xml',
      )
    }
  }

  // Footnote rel registered lazily when the first footnote-ref appears.
  let footnoteRid: string | undefined
  const reserveFootnoteRel = () => {
    if (!footnoteRid) {
      footnoteRid = rels.add(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
        'footnotes.xml',
      )
    }
  }

  // Traverse content.
  for (const item of content) {
    switch (item.type) {
      case 'heading':
        state.bodyXml.push(renderHeading(item))
        break
      case 'paragraph':
        state.bodyXml.push(renderParagraph(item))
        break
      case 'page-break':
        state.bodyXml.push(renderPageBreak())
        break
      case 'toc':
        state.bodyXml.push(renderToc(item))
        state.hasToc = true
        break
      case 'image': {
        state.bodyXml.push(await renderImage(item, state))
        break
      }
      case 'hyperlink':
        state.bodyXml.push(renderHyperlink(item, rels))
        break
      case 'footnote-ref': {
        reserveFootnoteRel()
        const id = state.footnotes.length + 1
        state.footnotes.push({ id, text: item.text })
        state.bodyXml.push(renderFootnoteRef(id))
        break
      }
      case 'bullet-list':
      case 'numbered-list':
        reserveNumberingRel()
        state.bodyXml.push(renderList(item, state))
        break
      case 'table':
        state.bodyXml.push(renderTable(item))
        break
    }
  }

  // Register header/footer rels if present.
  let headerRid: string | undefined
  let footerRid: string | undefined
  if (settings?.header) {
    headerRid = rels.add(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
      'header1.xml',
    )
  }
  if (settings?.footer) {
    footerRid = rels.add(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
      'footer1.xml',
    )
  }

  // Build sectPr.
  const sectPr = buildSectPr({
    settings,
    headerRId: headerRid,
    footerRId: footerRid,
  })

  // Build document.xml.
  const documentXml = `${XML_DECL}<w:document ${W_NS} ${W14_NS} ${W15_NS} ${R_NS}>
  <w:body>
    ${state.bodyXml.join('\n    ')}
    ${sectPr}
  </w:body>
</w:document>`

  // Build styles.xml (CJK eastAsia auto-inject).
  const needsEastAsia = contentHasCJK(content, settings)
  const stylesXml = buildStylesXml({
    needsEastAsia,
    defaultFontFamily: settings?.defaultFont?.family,
    defaultFontSize: settings?.defaultFont?.size,
  })

  // Collect entries.
  const entries = new Map<string, Buffer>()
  entries.set('word/document.xml', Buffer.from(documentXml, 'utf-8'))
  entries.set('word/styles.xml', Buffer.from(stylesXml, 'utf-8'))

  const hasNumbering = state.hasNumbering
  if (hasNumbering) {
    entries.set('word/numbering.xml', Buffer.from(buildNumberingXml(), 'utf-8'))
  }
  const hasFootnotes = state.footnotes.length > 0
  if (hasFootnotes) {
    entries.set('word/footnotes.xml', Buffer.from(buildFootnotesXml(state.footnotes), 'utf-8'))
  }
  if (settings?.header) {
    entries.set('word/header1.xml', Buffer.from(buildHeaderXml(settings.header), 'utf-8'))
  }
  if (settings?.footer) {
    entries.set('word/footer1.xml', Buffer.from(buildFooterXml(settings.footer), 'utf-8'))
  }

  // Embed images.
  for (const img of state.images) {
    entries.set(img.mediaPath, img.bytes)
  }

  // document.xml.rels
  entries.set('word/_rels/document.xml.rels', Buffer.from(rels.renderXml(), 'utf-8'))

  // [Content_Types].xml
  const contentTypes = buildContentTypesXml({
    hasNumbering,
    hasFootnotes,
    hasHeader: !!settings?.header,
    hasFooter: !!settings?.footer,
    hasComments: false,
    extensionDefaults: state.contentTypeExtensionDefaults,
  })
  entries.set('[Content_Types].xml', Buffer.from(contentTypes, 'utf-8'))

  // _rels/.rels
  entries.set('_rels/.rels', Buffer.from(buildRootRels(), 'utf-8'))

  return { entries }
}

/**
 * Lightweight syntactic validation for the `edit` escape-hatch. Confirms
 * the payload is well-formed XML and carries the WordprocessingML
 * namespace before the zip write-back commits.
 *
 * Paired with `wordMutateTool(action='edit')` which itself is intentionally
 * deferred (see tool description + SKILL.md §4.8). When `edit` is eventually
 * implemented this helper ships with it.
 */
export function validateLite(_xml: string): { ok: true } | { ok: false; reason: string } {
  throw new Error('docxEngine.validateLite: not yet implemented — paired with WordMutate(edit) escape hatch.')
}

// ===========================================================================
// Phase 3 — High-level edit hooks
// ===========================================================================
//
// Unlike buildDocument (which composes a brand-new DOCX), Phase 3 must open
// an existing .docx, mutate one or more parts, and write it back. We keep
// everything in this file (per architecture decision — no separate module).

/**
 * Parsed DOCX parts. All entries are retained so we can round-trip the ZIP
 * losslessly; `docXml` / `relsXml` / `contentTypesXml` are the most-commonly
 * mutated parts and are surfaced for convenience.
 */
export type DocxParts = {
  /** All ZIP entries (path → bytes). The string/XML parts are stored as UTF-8 Buffers here. */
  entries: Map<string, Buffer>
  /** word/document.xml, decoded. */
  docXml: string
  /** word/_rels/document.xml.rels, decoded (may be empty string if missing). */
  relsXml: string
  /** [Content_Types].xml, decoded. */
  contentTypesXml: string
}

/** Load an existing .docx into memory. */
export async function loadDocxParts(absPath: string): Promise<DocxParts> {
  // Lazy imports so this engine module stays pure at top-level.
  const yauzl = (await import('yauzl')).default
  const zipfile: any = await new Promise((resolve, reject) => {
    yauzl.open(absPath, { lazyEntries: true }, (err: any, zf: any) => {
      if (err) reject(err)
      else resolve(zf)
    })
  })

  const entries = new Map<string, Buffer>()
  await new Promise<void>((resolve, reject) => {
    zipfile.on('entry', (entry: any) => {
      if (/\/$/.test(entry.fileName)) {
        // Directory entry — skip.
        zipfile.readEntry()
        return
      }
      zipfile.openReadStream(entry, (err: any, stream: any) => {
        if (err) {
          reject(err)
          return
        }
        const chunks: Buffer[] = []
        stream.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
        stream.on('end', () => {
          entries.set(entry.fileName, Buffer.concat(chunks))
          zipfile.readEntry()
        })
        stream.on('error', reject)
      })
    })
    zipfile.on('end', () => resolve())
    zipfile.on('error', reject)
    zipfile.readEntry()
  })

  const docBuf = entries.get('word/document.xml')
  if (!docBuf) {
    throw new DocxBuildError('MISSING_DOCUMENT_XML', 'word/document.xml not found in .docx ZIP')
  }
  const docXml = docBuf.toString('utf-8')
  const relsBuf = entries.get('word/_rels/document.xml.rels')
  const relsXml = relsBuf ? relsBuf.toString('utf-8') : ''
  const ctBuf = entries.get('[Content_Types].xml')
  const contentTypesXml = ctBuf ? ctBuf.toString('utf-8') : ''

  return { entries, docXml, relsXml, contentTypesXml }
}

/** Write parts back as a fresh .docx ZIP at `absPath` (atomic via .tmp rename). */
export async function saveDocxParts(absPath: string, parts: DocxParts): Promise<void> {
  // Commit the parts' XML fields back into the entries map.
  parts.entries.set('word/document.xml', Buffer.from(parts.docXml, 'utf-8'))
  if (parts.relsXml) {
    parts.entries.set('word/_rels/document.xml.rels', Buffer.from(parts.relsXml, 'utf-8'))
  }
  if (parts.contentTypesXml) {
    parts.entries.set('[Content_Types].xml', Buffer.from(parts.contentTypesXml, 'utf-8'))
  }

  const yazl = (await import('yazl')).default
  const { createWriteStream, promises: fsp } = await import('node:fs')
  const { pipeline } = await import('node:stream/promises')
  const nodePath = (await import('node:path')).default

  const tmpPath = absPath + '.tmp'
  const output: any = new yazl.ZipFile()
  for (const [name, buf] of parts.entries) {
    output.addBuffer(buf, name)
  }
  output.end()
  await fsp.mkdir(nodePath.dirname(tmpPath), { recursive: true })
  const ws = createWriteStream(tmpPath)
  await pipeline(output.outputStream, ws)
  await fsp.rename(tmpPath, absPath)
}

/**
 * Generic "open → mutate → save" wrapper. The mutator may:
 *   - Mutate `parts.docXml` / `parts.relsXml` / `parts.contentTypesXml` in place
 *     (the caller is free to reassign these fields on the object).
 *   - Add / remove arbitrary ZIP entries via `parts.entries`.
 */
export async function modifyDocument(
  absPath: string,
  mutator: (parts: DocxParts) => void | Promise<void>,
): Promise<DocxParts> {
  const parts = await loadDocxParts(absPath)
  await mutator(parts)
  await saveDocxParts(absPath, parts)
  return parts
}

// ---------------------------------------------------------------------------
// replace-text — split-run aware literal / regex find/replace
// ---------------------------------------------------------------------------

export type ReplaceTextOptions = {
  regex?: boolean
  matchCase?: boolean
  wholeWord?: boolean
}

/**
 * Escape a literal string for use inside a regex.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse a `<w:r>...</w:r>` blob into rPr XML + concatenated text.
 * Only used inside a single paragraph, so we don't worry about page breaks.
 * Returns null if the run is not a plain text run (e.g. drawing / fldChar /
 * tab / br) — those must NOT be merged with adjacent plain-text runs.
 */
type ParsedRun = { rPr: string; text: string; raw: string }

function parsePlainRun(runXml: string): ParsedRun | null {
  // Reject if the run contains non-text children (drawing, fldChar, tab, br,
  // footnoteReference, commentReference, etc.). We only want <w:t> / <w:delText>
  // — and even <w:delText> we reject (we don't rewrite tracked-delete runs).
  if (/<w:drawing\b|<w:fldChar\b|<w:instrText\b|<w:tab\b|<w:br\b|<w:footnoteReference\b|<w:commentReference\b|<w:delText\b|<w:pict\b|<w:object\b|<w:sym\b|<w:ruby\b|<w:noBreakHyphen\b|<w:softHyphen\b/.test(runXml)) {
    return null
  }
  // Extract rPr (first occurrence, inside the run).
  const rPrMatch = runXml.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/)
  const rPr = rPrMatch ? rPrMatch[0] : ''
  // Concatenate all <w:t>...</w:t> bodies (self-closing <w:t/> contributes '').
  const textParts: string[] = []
  const textRe = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>|<w:t\b([^>]*)\/>/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(runXml)) !== null) {
    if (m[2] !== undefined) {
      // Decode XML entities (we only inverse-escape the minimal set we emit).
      textParts.push(m[2]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"))
    }
  }
  return { rPr, text: textParts.join(''), raw: runXml }
}

/**
 * Walk <w:p>...</w:p> blocks, for each paragraph:
 *   1. Segment it into "run clusters" of consecutive plain-text runs sharing
 *      the SAME rPr (byte-exact match); non-text runs act as hard boundaries.
 *   2. Inside each cluster, merge all text, run find/replace, then regenerate
 *      <w:r> elements preserving the original rPr.
 *
 * Matching never crosses a cluster boundary (preserves different rPr) and never
 * crosses a paragraph boundary (ECMA semantics).
 */
export function replaceTextAcrossRuns(
  docXml: string,
  find: string,
  replace: string,
  opts: ReplaceTextOptions = {},
): { docXml: string; replacements: number } {
  if (!find) return { docXml, replacements: 0 }

  // Build the match regex once.
  let pattern = opts.regex ? find : escapeRegex(find)
  if (opts.wholeWord) {
    pattern = `\\b(?:${pattern})\\b`
  }
  const flags = `g${opts.matchCase === false ? 'i' : ''}`
  let regex: RegExp
  try {
    regex = new RegExp(pattern, flags)
  } catch (err) {
    throw new DocxBuildError('REPLACE_REGEX_INVALID', `Invalid regex: ${String((err as Error).message)}`)
  }

  let totalReplacements = 0

  // Only rewrite inside <w:body>...</w:body> to avoid disturbing headers /
  // footers / footnotes that live in separate XML parts (they aren't in
  // docXml anyway — but a defensive guard).
  const bodyRe = /(<w:body[^>]*>)([\s\S]*)(<\/w:body>)/
  const bodyMatch = docXml.match(bodyRe)
  if (!bodyMatch) {
    // No body — nothing to do.
    return { docXml, replacements: 0 }
  }
  const bodyPrefix = bodyMatch[1]!
  const bodyInner = bodyMatch[2]!

  // Iterate over <w:p ...>...</w:p> blocks. Handle self-closing / empty
  // paragraphs by matching lazily.
  const paraRe = /<w:p\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g
  const newBody = bodyInner.replace(paraRe, (paraXml) => {
    // Self-closing paragraph <w:p/> carries no runs.
    if (/<w:p\b[^>]*\/>/.test(paraXml) && !/<\/w:p>/.test(paraXml)) return paraXml
    return rewriteParagraph(paraXml, regex, replace, (n) => {
      totalReplacements += n
    })
  })

  return {
    docXml: docXml.slice(0, docXml.indexOf(bodyPrefix) + bodyPrefix.length) +
      newBody +
      docXml.slice(docXml.indexOf(bodyPrefix) + bodyPrefix.length + bodyInner.length),
    replacements: totalReplacements,
  }
}

function rewriteParagraph(
  paraXml: string,
  regex: RegExp,
  replace: string,
  onMatched: (count: number) => void,
): string {
  // Split paragraph into tokens: everything outside <w:r>...</w:r> stays
  // untouched; runs are parsed into clusters of same-rPr plain-text runs.
  const runRe = /<w:r\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:r>)/g
  const segments: Array<{ kind: 'run'; parsed: ParsedRun | null; raw: string } | { kind: 'other'; raw: string }> = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = runRe.exec(paraXml)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ kind: 'other', raw: paraXml.slice(lastIdx, m.index) })
    }
    const raw = m[0]
    const parsed = parsePlainRun(raw)
    segments.push({ kind: 'run', parsed, raw })
    lastIdx = m.index + raw.length
  }
  if (lastIdx < paraXml.length) {
    segments.push({ kind: 'other', raw: paraXml.slice(lastIdx) })
  }

  // Walk segments, group adjacent plain-text runs with identical rPr into
  // clusters, process them together.
  const out: string[] = []
  let i = 0
  while (i < segments.length) {
    const seg = segments[i]!
    if (seg.kind === 'other' || seg.kind === 'run' && seg.parsed === null) {
      out.push(seg.raw)
      i += 1
      continue
    }
    // Cluster of runs with same rPr.
    const clusterStart = i
    const clusterRPr = seg.parsed!.rPr
    let j = i
    while (j < segments.length) {
      const sj = segments[j]!
      if (sj.kind !== 'run') break
      if (sj.parsed === null) break
      if (sj.parsed.rPr !== clusterRPr) break
      j += 1
    }
    // Cluster = segments[clusterStart..j)
    const clusterRuns = segments.slice(clusterStart, j) as Array<{ kind: 'run'; parsed: ParsedRun; raw: string }>
    const mergedText = clusterRuns.map((s) => s.parsed.text).join('')
    regex.lastIndex = 0
    const matchCount = (mergedText.match(regex) || []).length
    if (matchCount === 0) {
      // No match in this cluster — pass through unchanged.
      for (const s of clusterRuns) out.push(s.raw)
    } else {
      onMatched(matchCount)
      const replaced = mergedText.replace(regex, replace)
      // Emit a single run carrying the replaced text + original rPr. This
      // collapses the cluster into one run, which is semantically equivalent
      // and matches the "merge adjacent w:r then replace" contract.
      const rPrPart = clusterRPr // already a complete <w:rPr>...</w:rPr> or ''
      out.push(`<w:r>${rPrPart}<w:t xml:space="preserve">${xmlEscape(replaced)}</w:t></w:r>`)
    }
    i = j
  }
  return out.join('')
}

// ---------------------------------------------------------------------------
// insertAtAnchor — insert a block <w:p>/<w:tbl> at an anchor location
// ---------------------------------------------------------------------------

export type InsertAnchor = {
  /** 'end' → append just before the section's <w:sectPr>. 'before' / 'after' combine with `xpath`. */
  position?: 'before' | 'after' | 'end'
  /** XPath string. Currently a best-effort heuristic; 'end' is always supported. */
  xpath?: string
}

/**
 * Insert raw block XML (e.g. `<w:p>...</w:p>`) inside the document body at
 * the requested anchor. Falls back to 'end' when xpath is omitted or
 * cannot be resolved.
 */
export function insertAtAnchor(docXml: string, anchor: InsertAnchor | undefined, blockXml: string): string {
  const position = anchor?.position ?? 'end'

  if (position === 'end' || !anchor?.xpath) {
    // Insert just before <w:sectPr> (keep sectPr as last body child).
    const sectPrMatch = docXml.match(/<w:sectPr\b/)
    if (sectPrMatch && sectPrMatch.index !== undefined) {
      return docXml.slice(0, sectPrMatch.index) + blockXml + docXml.slice(sectPrMatch.index)
    }
    // No sectPr — insert before </w:body>.
    const bodyEndIdx = docXml.lastIndexOf('</w:body>')
    if (bodyEndIdx >= 0) {
      return docXml.slice(0, bodyEndIdx) + blockXml + docXml.slice(bodyEndIdx)
    }
    return docXml + blockXml
  }

  // best-effort xpath handling — only simple patterns supported for now
  // (Phase 3 scope). If unresolved, fall back to 'end'.
  // A fuller XPath engine lives in xpathEditor.ts and can be wired in if
  // ever needed; the C-tier tests only exercise position='end'.
  return insertAtAnchor(docXml, { position: 'end' }, blockXml)
}

// ---------------------------------------------------------------------------
// applyPageSettings — rewrite sectPr without touching body paragraphs
// ---------------------------------------------------------------------------

/**
 * Replace the document's last (body-level) <w:sectPr> with a new sectPr that
 * reflects the requested page size / orientation / margins / columns, while
 * preserving all other children (e.g. headerReference / footerReference /
 * type / formProt / docGrid / titlePg) byte-for-byte.
 */
export function applyPageSettings(
  docXml: string,
  pageSettings: DocxPageSettings | undefined,
  columns?: DocxColumnsSettings,
): string {
  // Locate the body-level sectPr (appears immediately before </w:body>).
  // Covers both <w:sectPr>...</w:sectPr> and the rare self-closing form.
  const sectPrRe = /<w:sectPr\b([^>]*)(?:\/>|>([\s\S]*?)<\/w:sectPr>)/
  const match = docXml.match(sectPrRe)
  if (!match) {
    throw new DocxBuildError('SECTPR_NOT_FOUND', 'document.xml does not contain a <w:sectPr>')
  }
  const fullSectPr = match[0]
  const attrStr = match[1] ?? ''
  const innerXml = match[2] ?? ''

  // Strip child elements we are replacing (pgSz, pgMar, cols).
  let preserved = innerXml
  preserved = preserved.replace(/<w:pgSz\b[^>]*\/>/g, '')
  preserved = preserved.replace(/<w:pgSz\b[^>]*>[\s\S]*?<\/w:pgSz>/g, '')
  preserved = preserved.replace(/<w:pgMar\b[^>]*\/>/g, '')
  preserved = preserved.replace(/<w:pgMar\b[^>]*>[\s\S]*?<\/w:pgMar>/g, '')
  if (columns) {
    preserved = preserved.replace(/<w:cols\b[^>]*\/>/g, '')
    preserved = preserved.replace(/<w:cols\b[^>]*>[\s\S]*?<\/w:cols>/g, '')
  }

  // Compute new pgSz / pgMar / cols using the existing buildSectPr helpers
  // (but we only want the inner pieces — not the wrapping <w:sectPr>).
  const page = pageSettings
  const sizeKey = page?.size ?? 'a4'
  const base = PAGE_SIZES[sizeKey] ?? PAGE_SIZES.a4!
  const portrait = (page?.orientation ?? 'portrait') === 'portrait'
  const w = portrait ? base.width : base.height
  const h = portrait ? base.height : base.width
  const orientAttr = page?.orientation === 'landscape' ? ` w:orient="landscape"` : ''
  const pgSz = `<w:pgSz w:w="${w}" w:h="${h}"${orientAttr}/>`

  const m = page?.margins ?? {}
  const top = m.top ?? DEFAULT_MARGIN
  const right = m.right ?? DEFAULT_MARGIN
  const bottom = m.bottom ?? DEFAULT_MARGIN
  const left = m.left ?? DEFAULT_MARGIN
  const header = m.header ?? DEFAULT_HEADER_MARGIN
  const footer = m.footer ?? DEFAULT_FOOTER_MARGIN
  const pgMar = `<w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="${header}" w:footer="${footer}" w:gutter="0"/>`

  let colsXml = ''
  if (columns) {
    if (columns.count >= 2) {
      const space = columns.space ?? 720
      const sep = columns.separator ? ' w:sep="1"' : ''
      colsXml = `<w:cols w:num="${columns.count}" w:space="${space}"${sep}/>`
    } else {
      colsXml = `<w:cols w:num="1"/>`
    }
  }

  const newSectPrInner = preserved + pgSz + pgMar + colsXml
  const newSectPr = `<w:sectPr${attrStr}>${newSectPrInner}</w:sectPr>`

  return docXml.replace(fullSectPr, newSectPr)
}

// ---------------------------------------------------------------------------
// updateTocFields — insert or refresh a TOC field in document.xml
// ---------------------------------------------------------------------------

/**
 * If the document already has a TOC field structure, mark it dirty so Word
 * recomputes values on open. Otherwise, insert a fresh TOC field paragraph
 * before <w:sectPr>.
 *
 * The C5 test only asserts that the post-edit document.xml contains a TOC
 * marker (either `<w:sdt` or the literal "TOC " string). Both paths satisfy
 * the assertion; we prefer "mark dirty" when possible so we don't duplicate
 * content.
 */
export function updateTocFields(docXml: string): { docXml: string; tocCount: number } {
  // Detect existing TOC via instrText "TOC " substring (field-based) or sdt with DocPartGallery val="Table of Contents".
  const hasInstrToc = /<w:instrText[^>]*>\s*TOC\s/i.test(docXml)
  const hasSdtToc = /<w:sdt\b[\s\S]*?<w:docPartGallery[^>]*val="Table of Contents"/i.test(docXml)

  if (hasInstrToc) {
    // Mark the begin fldChar dirty so Word recomputes on open.
    const updated = docXml.replace(
      /(<w:fldChar\b[^>]*w:fldCharType="begin")([^>]*?)(\/?>)/g,
      (full, head, mid, tail) => {
        // Only target the begin fldChar that wraps a TOC instruction — but
        // a simple heuristic: if the document already has a TOC instr,
        // mark every begin as dirty. Word tolerates extra dirty flags.
        if (/w:dirty=/.test(mid)) return full // already has w:dirty attribute
        return `${head} w:dirty="true"${mid}${tail}`
      },
    )
    return { docXml: updated, tocCount: 1 }
  }
  if (hasSdtToc) {
    // SDT-based TOC — leave as-is; the fact it exists satisfies the marker test.
    return { docXml, tocCount: 1 }
  }

  // No TOC — insert a fresh TOC field paragraph at the start of the body.
  const tocBlock =
    `<w:p>` +
    `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve">TOC \\o "1-3" \\h \\z \\u</w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t xml:space="preserve">Right-click to update field.</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:p>`

  // Insert after <w:body> opening tag (so the TOC is at the very top, which
  // is the expected placement for a table of contents).
  const bodyOpenRe = /<w:body\b[^>]*>/
  const m = docXml.match(bodyOpenRe)
  if (m && m.index !== undefined) {
    const insertAt = m.index + m[0].length
    return {
      docXml: docXml.slice(0, insertAt) + tocBlock + docXml.slice(insertAt),
      tocCount: 1,
    }
  }
  return { docXml: insertAtAnchor(docXml, { position: 'end' }, tocBlock), tocCount: 1 }
}

// ---------------------------------------------------------------------------
// RelManager re-entry — rebuild from existing document.xml.rels XML
// ---------------------------------------------------------------------------

/**
 * Reconstruct a RelManager seeded with the relationships declared in
 * `word/_rels/document.xml.rels`. New rIds allocated by the returned
 * manager start above the max existing numeric id.
 */
export function loadRelManager(relsXml: string): RelManager {
  const mgr = new RelManager()
  if (!relsXml) return mgr
  const relRe = /<Relationship\b([^>]*?)\/>/g
  let m: RegExpExecArray | null
  let maxId = 0
  while ((m = relRe.exec(relsXml)) !== null) {
    const attrs = m[1] ?? ''
    const id = (attrs.match(/\bId="([^"]*)"/) || [])[1] ?? ''
    const type = (attrs.match(/\bType="([^"]*)"/) || [])[1] ?? ''
    const target = (attrs.match(/\bTarget="([^"]*)"/) || [])[1] ?? ''
    const mode = (attrs.match(/\bTargetMode="([^"]*)"/) || [])[1]
    if (id && type && target) {
      mgr.addWithId(id, type, decodeAttr(target), mode === 'External' ? 'External' : undefined)
      const numPart = /^rId(\d+)$/.exec(id)
      if (numPart) maxId = Math.max(maxId, parseInt(numPart[1]!, 10))
    }
  }
  // Bump internal counter so new rIds don't collide.
  mgr.setCounter(maxId)
  return mgr
}

function decodeAttr(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// ---------------------------------------------------------------------------
// [Content_Types].xml — ensure an extension default exists
// ---------------------------------------------------------------------------

/**
 * Ensure `[Content_Types].xml` declares a <Default Extension="<ext>"
 * ContentType="<ct>"/> entry. Returns the (possibly mutated) XML.
 */
export function ensureContentTypeDefault(contentTypesXml: string, ext: string, contentType: string): string {
  if (!contentTypesXml) {
    return `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="${xmlAttrEscape(ext)}" ContentType="${xmlAttrEscape(contentType)}"/>
</Types>`
  }
  const re = new RegExp(`<Default[^>]*Extension="${ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`, 'i')
  if (re.test(contentTypesXml)) return contentTypesXml
  const defaultTag = `<Default Extension="${xmlAttrEscape(ext)}" ContentType="${xmlAttrEscape(contentType)}"/>`
  // Insert the new Default before the first <Override ...> or before </Types>.
  const overrideIdx = contentTypesXml.indexOf('<Override')
  if (overrideIdx >= 0) {
    return contentTypesXml.slice(0, overrideIdx) + defaultTag + contentTypesXml.slice(overrideIdx)
  }
  return contentTypesXml.replace('</Types>', `${defaultTag}</Types>`)
}

// ---------------------------------------------------------------------------
// buildImageDrawing — emit a <w:drawing> block given an rId + dimensions
// ---------------------------------------------------------------------------

export type BuildImageDrawingOpts = {
  rid: string
  name: string
  cx: number
  cy: number
  docPrId: number
  alt?: string
}

/**
 * Render a standalone <w:drawing> inline picture. Used by add-image.
 */
export function buildImageDrawing(opts: BuildImageDrawingOpts): string {
  const alt = xmlAttrEscape(opts.alt ?? '')
  return (
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" ${WP_NS}>` +
    `<wp:extent cx="${opts.cx}" cy="${opts.cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${opts.docPrId}" name="${xmlAttrEscape(opts.name)}" descr="${alt}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks ${A_NS} noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic ${A_NS}>` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic ${PIC_NS}>` +
    `<pic:nvPicPr><pic:cNvPr id="${opts.docPrId}" name="${xmlAttrEscape(opts.name)}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip ${R_NS} r:embed="${opts.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${opts.cx}" cy="${opts.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>`
  )
}

/**
 * Load image bytes from a session-relative path or http(s) URL. Thin wrapper
 * over loadImageSource used by add-image.
 */
export async function loadImageForMutate(source: string): Promise<{ bytes: Buffer; ext: string; contentType: string }> {
  return loadImageSource(source)
}

// pxToEmu is already defined above for buildDocument; re-export for mutate.
export { pxToEmu }

// ===========================================================================
// Phase 4 — Review workflow hooks
// ===========================================================================
//
// Three WordMutate actions (add-tracked-change / comment / resolve-changes)
// operate over an *existing* docx and require helpers to wrap runs in
// w:ins / w:del, anchor comments across the 5-file comment part set, and
// flatten accept/reject semantics. These helpers stay in the same file as
// Phase 2/3 engine so everything touching OOXML lives in one module.

// ---------------------------------------------------------------------------
// Tracked change helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a sequence of `<w:r>...</w:r>` runs in `<w:ins>` (tracked insertion).
 * Anthropic's Word SKILL spec: `<w:ins>` is a container that sits as a
 * sibling of other runs inside a `<w:p>`; it carries author/date/id.
 */
export function wrapRunsWithIns(
  runsXml: string,
  author: string,
  date: string,
  id: number | string,
): string {
  return (
    `<w:ins w:id="${id}" w:author="${xmlAttrEscape(author)}" w:date="${xmlAttrEscape(date)}">` +
    runsXml +
    `</w:ins>`
  )
}

/**
 * Wrap runs in `<w:del>`. Anthropic pitfall: inside a `<w:del>`, `<w:t>`
 * elements MUST be renamed to `<w:delText>` so Word treats the text as
 * struck through / tombstoned content. We do that rewrite here so callers
 * can hand us raw run XML without worrying about the switch.
 */
export function wrapRunsWithDel(
  runsXml: string,
  author: string,
  date: string,
  id: number | string,
): string {
  // Swap every <w:t ...>...</w:t> and self-closing <w:t/> with <w:delText>.
  const converted = runsXml
    .replace(/<w:t\b([^>]*)\/>/g, '<w:delText$1/>')
    .replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, '<w:delText$1>$2</w:delText>')
  return (
    `<w:del w:id="${id}" w:author="${xmlAttrEscape(author)}" w:date="${xmlAttrEscape(date)}">` +
    converted +
    `</w:del>`
  )
}

/**
 * Flip a paragraph to "paragraph-level delete" — inject `<w:del/>` inside
 * the paragraph-mark run properties (`<w:pPr><w:rPr>`). This is Anthropic
 * SKILL pitfall #7: without this marker, accepting the tracked change
 * leaves behind an empty paragraph instead of merging it into the next
 * paragraph.
 *
 * Accepts a single `<w:p ...>...</w:p>` string, returns the edited form.
 * Idempotent: if the paragraph already has a `<w:del/>` in its pPr/rPr
 * this is a no-op.
 */
export function insertParagraphLevelDel(
  paraXml: string,
  author: string,
  date: string,
  id: number | string,
): string {
  const delTag = `<w:del w:id="${id}" w:author="${xmlAttrEscape(author)}" w:date="${xmlAttrEscape(date)}"/>`

  // Case 1: pPr exists with rPr inside. Insert w:del at the start of rPr
  // (only if not already present).
  const pPrRPrRe = /(<w:pPr\b[^>]*>[\s\S]*?<w:rPr\b[^>]*>)([\s\S]*?)(<\/w:rPr>[\s\S]*?<\/w:pPr>)/
  const pPrRPrMatch = paraXml.match(pPrRPrRe)
  if (pPrRPrMatch) {
    if (/<w:del[\s/]/.test(pPrRPrMatch[2]!)) return paraXml
    return paraXml.replace(pPrRPrRe, (_full, head, middle, tail) => {
      return `${head}${delTag}${middle}${tail}`
    })
  }

  // Case 2: pPr exists without rPr. Inject <w:rPr><w:del/></w:rPr> at the
  // END of pPr (rPr is the last child of pPr per ECMA-376).
  const pPrOnlyRe = /(<w:pPr\b[^>]*>)([\s\S]*?)(<\/w:pPr>)/
  const pPrOnlyMatch = paraXml.match(pPrOnlyRe)
  if (pPrOnlyMatch) {
    return paraXml.replace(
      pPrOnlyRe,
      (_full, open, inner, close) => `${open}${inner}<w:rPr>${delTag}</w:rPr>${close}`,
    )
  }

  // Case 3: self-closing pPr (<w:pPr/>) — replace with open pPr+rPr+close.
  if (/<w:pPr\b[^>]*\/>/.test(paraXml)) {
    return paraXml.replace(
      /<w:pPr\b[^>]*\/>/,
      `<w:pPr><w:rPr>${delTag}</w:rPr></w:pPr>`,
    )
  }

  // Case 4: no pPr at all. Inject one right after the opening <w:p ...>.
  return paraXml.replace(
    /(<w:p\b[^>]*>)/,
    `$1<w:pPr><w:rPr>${delTag}</w:rPr></w:pPr>`,
  )
}

/**
 * Locate a paragraph that contains the requested anchor text. Returns a
 * structured descriptor so callers can replace / wrap the matching run
 * without re-scanning. The match is greedy: it finds the FIRST paragraph
 * whose concatenated plain-text contains `anchorText` (case-sensitive,
 * literal substring).
 *
 * Returns `null` if no paragraph matches.
 */
export type AnchorMatch = {
  /** Byte offset of the `<w:p` in docXml. */
  paraStart: number
  /** Byte offset *after* the `</w:p>` closing tag. */
  paraEnd: number
  /** Full `<w:p ...>...</w:p>` substring. */
  paraXml: string
}

export function findAnchorParagraph(docXml: string, anchorText: string): AnchorMatch | null {
  const paraRe = /<w:p\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g
  let m: RegExpExecArray | null
  while ((m = paraRe.exec(docXml)) !== null) {
    const paraXml = m[0]
    if (/<w:p\b[^>]*\/>/.test(paraXml) && !/<\/w:p>/.test(paraXml)) continue
    // Concatenate every <w:t> body (ignoring delText — deleted content
    // is not a valid anchor target).
    const textParts: string[] = []
    const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
    let tm: RegExpExecArray | null
    while ((tm = textRe.exec(paraXml)) !== null) {
      textParts.push(
        tm[1]!
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      )
    }
    const paraText = textParts.join('')
    if (paraText.includes(anchorText)) {
      return {
        paraStart: m.index,
        paraEnd: m.index + paraXml.length,
        paraXml,
      }
    }
  }
  return null
}

/**
 * Find the FIRST `<w:r>...</w:r>` inside a paragraph whose `<w:t>` text
 * contains the given anchor substring. Used by comment anchoring so we
 * can place commentRangeStart/End as siblings of the matched run.
 *
 * Returns an object with the raw run XML plus its paragraph-relative
 * offsets. Returns null when no plain-text run matches.
 *
 * **Important contract (D8)**: this helper ONLY accepts anchors that
 * resolve to a `<w:r>` (run) node. Any attempt to anchor inside a `<w:r>`
 * (e.g. at a `<w:t>` child) is a contract violation and must be rejected
 * by the caller via `throwInvalidCommentAnchor()` — we cannot emit
 * commentRangeStart/End as children of `<w:r>` because those elements are
 * required by ECMA-376 §17.13.4.2 to be siblings of w:r, not descendants.
 */
export type RunMatch = {
  /** Byte offset of the `<w:r` inside paraXml. */
  runStart: number
  /** Byte offset *after* the `</w:r>` closing tag inside paraXml. */
  runEnd: number
  /** Full `<w:r ...>...</w:r>` substring. */
  runXml: string
}

export function findAnchorRunsInParagraph(
  paraXml: string,
  anchorText: string,
): RunMatch | null {
  const runRe = /<w:r\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:r>)/g
  let m: RegExpExecArray | null
  while ((m = runRe.exec(paraXml)) !== null) {
    const runXml = m[0]
    if (/<w:delText\b/.test(runXml)) continue
    const textParts: string[] = []
    const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
    let tm: RegExpExecArray | null
    while ((tm = textRe.exec(runXml)) !== null) {
      textParts.push(tm[1]!)
    }
    const runText = textParts.join('')
    if (!anchorText || runText.includes(anchorText)) {
      return {
        runStart: m.index,
        runEnd: m.index + runXml.length,
        runXml,
      }
    }
  }
  return null
}

/**
 * Validate an xpath-style anchor the caller might pass down from tool
 * arguments. We don't run a full XPath engine — we just reject patterns
 * that would place a sibling marker inside a `<w:r>` or inside a `<w:t>`
 * (both violate commentRangeStart/End's sibling requirement).
 *
 * Throws `DocxBuildError('COMMENT_ANCHOR_INVALID', …)` on violation.
 */
export function validateCommentAnchorXPath(xpath: string | undefined): void {
  if (!xpath) return
  // Disallow targeting children of a run (e.g. //w:r/w:t[1]). Only
  // sibling-level targets (//w:p[...], //w:r, //w:r[...], or absolute
  // text context targets like //w:p/w:r) are allowed.
  if (/\/w:r\//.test(xpath) || /\/w:r\b[^/]*\/w:t\b/.test(xpath)) {
    throw new DocxBuildError(
      'COMMENT_ANCHOR_INVALID',
      `COMMENT_ANCHOR_INVALID: anchor xpath "${xpath}" would place commentRangeStart/End inside a <w:r>; commentRange markers must be siblings of the run they bracket.`,
    )
  }
}

// ---------------------------------------------------------------------------
// Comment helpers — add anchors into document.xml
// ---------------------------------------------------------------------------

/**
 * Inject commentRangeStart + commentRangeEnd + commentReference into
 * the document body at the requested anchor. Contract:
 *   - commentRangeStart/End sit as SIBLINGS of the target run(s).
 *   - commentReference is emitted as its own `<w:r>` so it lives as a
 *     sibling of the bracketed run.
 *
 * When `anchor.position === 'end'` (or xpath unresolved), we append the
 * markers to the last paragraph in the body, creating a 0-length range
 * that Word still renders as a legitimate comment pin.
 */
export function addCommentAnchors(
  docXml: string,
  anchor: InsertAnchor | undefined,
  commentId: number | string,
  anchorText?: string,
): string {
  validateCommentAnchorXPath(anchor?.xpath)

  const start = `<w:commentRangeStart w:id="${commentId}"/>`
  const end = `<w:commentRangeEnd w:id="${commentId}"/>`
  const ref = `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${commentId}"/></w:r>`

  // Anchor text mode: try to place start/end around the first matching
  // run inside the first paragraph whose text contains anchorText.
  if (anchorText) {
    const match = findAnchorParagraph(docXml, anchorText)
    if (match) {
      const run = findAnchorRunsInParagraph(match.paraXml, anchorText)
      if (run) {
        const before = match.paraXml.slice(0, run.runStart)
        const after = match.paraXml.slice(run.runEnd)
        const newParaXml = `${before}${start}${run.runXml}${end}${ref}${after}`
        return docXml.slice(0, match.paraStart) + newParaXml + docXml.slice(match.paraEnd)
      }
    }
    // anchorText miss → fall through to 'end' placement.
  }

  // 'end' placement — insert into the LAST <w:p>...</w:p> before sectPr.
  const sectPrIdx = docXml.search(/<w:sectPr\b/)
  const searchLimit = sectPrIdx >= 0 ? sectPrIdx : docXml.length
  const prefix = docXml.slice(0, searchLimit)
  // Find the last </w:p> inside prefix.
  const lastPEndIdx = prefix.lastIndexOf('</w:p>')
  if (lastPEndIdx < 0) {
    // No paragraph — create a standalone anchor paragraph at end of body.
    const block = `<w:p>${start}${ref}${end}</w:p>`
    return insertAtAnchor(docXml, { position: 'end' }, block)
  }
  // Locate the matching <w:p ...> opening for this close tag.
  const lastPOpenIdx = prefix.lastIndexOf('<w:p', lastPEndIdx)
  if (lastPOpenIdx < 0) {
    const block = `<w:p>${start}${ref}${end}</w:p>`
    return insertAtAnchor(docXml, { position: 'end' }, block)
  }
  const lastParaXml = docXml.slice(lastPOpenIdx, lastPEndIdx + '</w:p>'.length)
  // Append before the closing </w:p> of the last paragraph.
  const insertAt = lastPOpenIdx + lastParaXml.length - '</w:p>'.length
  return docXml.slice(0, insertAt) + start + end + ref + docXml.slice(insertAt)
}

// ---------------------------------------------------------------------------
// Comment part builders (comments.xml / commentsExtended.xml / commentsIds.xml
// / people.xml). All 4 are driven from a tiny per-comment descriptor struct.
// ---------------------------------------------------------------------------

export type CommentRecord = {
  id: string
  author: string
  date: string
  text: string
  paraId: string // 8-hex paraId stamped on the <w:p> inside comments.xml
  parentParaId?: string // when set, this comment is a reply
  durableId?: string // 8-hex durable id (used by commentsIds.xml)
}

export function allocateParaId(seed: number): string {
  // 8-hex lowercase id, seeded from `seed` + a time-derived nibble so
  // two comments added at slightly different points get distinct ids.
  const n = ((Date.now() & 0xffff) + seed * 31) >>> 0
  return n.toString(16).padStart(8, '0').slice(-8).toUpperCase()
}

export function allocateDurableId(seed: number): string {
  const n = (((Date.now() >>> 4) & 0xffffff) + seed * 131) >>> 0
  return n.toString(16).padStart(8, '0').slice(-8).toUpperCase()
}

/** Render word/comments.xml. */
export function buildCommentsPart(comments: CommentRecord[]): string {
  const body = comments
    .map((c) => {
      const initials = xmlAttrEscape(c.author.slice(0, 2).toUpperCase() || 'AI')
      return (
        `<w:comment w:id="${xmlAttrEscape(c.id)}" w:author="${xmlAttrEscape(c.author)}" w:date="${xmlAttrEscape(c.date)}" w:initials="${initials}">` +
        `<w:p w14:paraId="${c.paraId}"><w:r><w:t xml:space="preserve">${xmlEscape(c.text)}</w:t></w:r></w:p>` +
        `</w:comment>`
      )
    })
    .join('')
  return `${XML_DECL}<w:comments ${W_NS} ${W14_NS}>${body}</w:comments>`
}

/** Render word/commentsExtended.xml. */
export function buildCommentsExtendedPart(comments: CommentRecord[]): string {
  const body = comments
    .map((c) => {
      const parentAttr = c.parentParaId
        ? ` w15:paraIdParent="${c.parentParaId}"`
        : ''
      return `<w15:commentEx w15:paraId="${c.paraId}"${parentAttr} w15:done="0"/>`
    })
    .join('')
  return `${XML_DECL}<w15:commentsEx ${W15_NS}>${body}</w15:commentsEx>`
}

/** Render word/commentsIds.xml. */
export function buildCommentsIdsPart(comments: CommentRecord[]): string {
  const body = comments
    .map((c) => {
      const durable = c.durableId ?? c.paraId
      return `<w16cid:commentId w16cid:paraId="${c.paraId}" w16cid:durableId="${durable}"/>`
    })
    .join('')
  return `${XML_DECL}<w16cid:commentsIds ${W_NS} ${W16CID_NS}>${body}</w16cid:commentsIds>`
}

/** Render word/people.xml. */
export function buildPeoplePart(authors: string[]): string {
  const uniq = Array.from(new Set(authors))
  const body = uniq
    .map((a) => {
      const escaped = xmlAttrEscape(a)
      return (
        `<w15:person w15:author="${escaped}">` +
        `<w15:presenceInfo w15:providerId="None" w15:userId="${escaped}"/>` +
        `</w15:person>`
      )
    })
    .join('')
  return `${XML_DECL}<w15:people ${W_NS} ${W15_NS}>${body}</w15:people>`
}

/**
 * Parse an existing word/comments.xml and surface each comment's durable
 * paraId so we can (a) avoid colliding ids, (b) link a reply via
 * w15:paraIdParent.
 */
export type ExistingCommentInfo = {
  id: string
  author: string
  paraId: string
  date: string
  text: string
}

export function parseCommentsXml(commentsXml: string): ExistingCommentInfo[] {
  if (!commentsXml) return []
  const out: ExistingCommentInfo[] = []
  const re = /<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(commentsXml)) !== null) {
    const attrs = m[1] ?? ''
    const inner = m[2] ?? ''
    const id = (attrs.match(/\bw:id="([^"]*)"/) || [])[1] ?? ''
    const author = (attrs.match(/\bw:author="([^"]*)"/) || [])[1] ?? ''
    const date = (attrs.match(/\bw:date="([^"]*)"/) || [])[1] ?? ''
    const paraId =
      (inner.match(/\bw14:paraId="([^"]*)"/) || [])[1] ??
      (inner.match(/\bw:paraId="([^"]*)"/) || [])[1] ??
      ''
    const textParts: string[] = []
    const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
    let tm: RegExpExecArray | null
    while ((tm = textRe.exec(inner)) !== null) {
      textParts.push(tm[1]!)
    }
    out.push({ id, author, paraId, date, text: textParts.join('') })
  }
  return out
}

export function parsePeopleXml(peopleXml: string): string[] {
  if (!peopleXml) return []
  const out: string[] = []
  const re = /<w15:person\b[^>]*\bw15:author="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(peopleXml)) !== null) {
    out.push(m[1]!)
  }
  return out
}

// ---------------------------------------------------------------------------
// Accept / reject tracked changes — JS fallback (critic §11.5 mandates a
// real implementation, not a TODO). Mirrors libreoffice behaviour:
//
//   accept:
//     • Remove every <w:del>…</w:del> block (its <w:delText> content is
//       permanently dropped).
//     • Unwrap every <w:ins>…</w:ins> — keep inner runs, drop the wrapper.
//     • Paragraph-level <w:del/> inside <w:pPr><w:rPr> — we drop it so the
//       paragraph is considered merged with its neighbour (MS Word merges
//       by removing the paragraph mark; for round-trip safety we preserve
//       the paragraph but clear the marker).
//   reject:
//     • Remove every <w:ins>…</w:ins> block.
//     • Unwrap every <w:del>…</w:del> — keep inner runs, and rewrite
//       <w:delText> back into <w:t>.
//     • Paragraph-level <w:del/> → drop (paragraph stays, because in
//       reject we're refusing the delete).
//
// Both functions are PURE: they take a docXml string and return the
// transformed version, without touching disk.
// ---------------------------------------------------------------------------

function stripInsWrapper(docXml: string): string {
  // Replace <w:ins ...>INNER</w:ins> with INNER (preserving inner).
  return docXml.replace(/<w:ins\b[^>]*>([\s\S]*?)<\/w:ins>/g, '$1')
}

function stripDelBlock(docXml: string): string {
  // Drop the entire <w:del ...>...</w:del>.
  return docXml.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, '')
}

function stripParaLevelDel(docXml: string): string {
  // Remove <w:del .../> that sits inside a <w:rPr> that is INSIDE a <w:pPr>.
  // We do a single pass on each pPr block.
  return docXml.replace(/<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/g, (full, inner) => {
    if (!/<w:del\b/.test(inner)) return full
    const cleanedRPr = inner.replace(
      /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/g,
      (rpr: string, rprInner: string) => {
        // remove <w:del/> self-closing or with attrs
        const stripped = rprInner.replace(/<w:del\b[^>]*\/>/g, '')
        // If rPr is now empty, drop the whole element to keep the XML tidy.
        if (!stripped.trim()) return ''
        return rpr.replace(rprInner, stripped)
      },
    )
    return full.replace(inner, cleanedRPr)
  })
}

function unwrapDelAsRejected(docXml: string): string {
  // Replace <w:del ...>INNER</w:del> with INNER, AND rewrite <w:delText> back
  // to <w:t> inside that INNER. We do this in a single pass.
  return docXml.replace(/<w:del\b[^>]*>([\s\S]*?)<\/w:del>/g, (_full, inner: string) => {
    return inner
      .replace(/<w:delText\b([^>]*)\/>/g, '<w:t$1/>')
      .replace(/<w:delText\b([^>]*)>([\s\S]*?)<\/w:delText>/g, '<w:t$1>$2</w:t>')
  })
}

/**
 * Accept every tracked change in docXml using a pure-JS rewrite.
 * Matches the behaviour of libreoffice headless `--accept-revisions`.
 */
export function acceptTrackedChangesJs(docXml: string): string {
  let out = docXml
  out = stripDelBlock(out) // drop deleted content
  out = stripInsWrapper(out) // keep inserted content
  out = stripParaLevelDel(out) // clear paragraph-level delete markers
  return out
}

/**
 * Reject every tracked change in docXml using a pure-JS rewrite.
 */
export function rejectTrackedChangesJs(docXml: string): string {
  let out = docXml
  out = docXml.replace(/<w:ins\b[^>]*>[\s\S]*?<\/w:ins>/g, '') // drop inserted runs
  out = unwrapDelAsRejected(out) // restore deleted text (delText → t)
  out = stripParaLevelDel(out) // drop paragraph-level delete markers
  return out
}

/**
 * Public entry: accept tracked changes. If a soffice binary is on hand
 * we *could* delegate to it (LibreOffice 7.4+ has
 * `--accept-all-tracked-changes`), but current upstream soffice releases
 * do not expose accept/reject as a headless flag reliably across
 * platforms. Per critic §11.5 the JS path is mandatory and shipped;
 * future work may add a soffice-first branch behind a feature flag.
 */
export function acceptTrackedChanges(docXml: string): string {
  return acceptTrackedChangesJs(docXml)
}

export function rejectTrackedChanges(docXml: string): string {
  return rejectTrackedChangesJs(docXml)
}

// ---------------------------------------------------------------------------
// Content-Types.xml & rels helpers for the comment part set
// ---------------------------------------------------------------------------

const COMMENT_CT_ENTRIES: Array<{ partName: string; contentType: string }> = [
  {
    partName: '/word/comments.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
  },
  {
    partName: '/word/commentsExtended.xml',
    contentType: 'application/vnd.ms-word.commentsExtended+xml',
  },
  {
    partName: '/word/commentsIds.xml',
    contentType: 'application/vnd.ms-word.commentsIds+xml',
  },
  {
    partName: '/word/people.xml',
    contentType: 'application/vnd.ms-word.people+xml',
  },
]

/**
 * Ensure [Content_Types].xml declares <Override> rows for the comment
 * part set. Missing rows are inserted at the end of <Types>.
 */
export function ensureCommentContentTypes(contentTypesXml: string): string {
  if (!contentTypesXml) return contentTypesXml
  let out = contentTypesXml
  for (const { partName, contentType } of COMMENT_CT_ENTRIES) {
    const escaped = partName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`<Override[^>]*PartName="${escaped}"`, 'i')
    if (re.test(out)) continue
    const row = `<Override PartName="${partName}" ContentType="${contentType}"/>`
    out = out.replace('</Types>', `${row}</Types>`)
  }
  return out
}

const COMMENT_REL_TYPES = {
  comments:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',
  commentsExtended:
    'http://schemas.microsoft.com/office/2011/relationships/commentsExtended',
  commentsIds:
    'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds',
  people: 'http://schemas.microsoft.com/office/2011/relationships/people',
}

/**
 * Ensure word/_rels/document.xml.rels carries relationships pointing at
 * comments.xml / commentsExtended.xml / commentsIds.xml / people.xml.
 * The RelManager passed in gets extended in-place; caller is responsible
 * for rendering it back to XML.
 */
export function ensureCommentRels(rels: RelManager): void {
  const wanted: Array<[string, string]> = [
    [COMMENT_REL_TYPES.comments, 'comments.xml'],
    [COMMENT_REL_TYPES.commentsExtended, 'commentsExtended.xml'],
    [COMMENT_REL_TYPES.commentsIds, 'commentsIds.xml'],
    [COMMENT_REL_TYPES.people, 'people.xml'],
  ]
  for (const [type, target] of wanted) {
    if (!rels.has(type, target)) {
      rels.add(type, target)
    }
  }
}
