/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/** A single edit operation for Office documents (DOCX/XLSX/PPTX). */
export type OfficeEdit =
  | { op: 'replace'; path: string; xpath: string; xml: string }
  | { op: 'insert'; path: string; xpath: string; position: 'before' | 'after'; xml: string }
  | { op: 'remove'; path: string; xpath: string }
  | { op: 'write'; path: string; source: string }
  | { op: 'delete'; path: string }

/** DOCX read-structure result. */
export type DocxStructure = {
  paragraphs: {
    index: number
    text: string
    style?: string
    level?: number
    bold?: boolean
    italic?: boolean
    hasImage?: boolean
  }[]
  tables: {
    index: number
    rows: number
    cols: number
    preview: string[][]
  }[]
  images: {
    paragraphIndex: number
    fileName: string
    altText?: string
  }[]
  headers: string[]
  footers: string[]
  totalParagraphs: number
  truncated: boolean
}

/** XLSX read-structure result. */
export type XlsxStructure = {
  sheets: {
    name: string
    index: number
    rowCount: number
    colCount: number
    range: string
  }[]
  cells?: {
    ref: string
    value: string | number | null
    type: string
    formula?: string
  }[]
  charts: number
  pivotTables: number
}

/** PPTX read-structure result. */
export type PptxStructure = {
  slides: {
    index: number
    layout?: string
    title?: string
    textBlocks: string[]
    images: string[]
  }[]
  slideCount: number
  masters: number
}

/** PDF read-structure result. */
export type PdfStructure = {
  pageCount: number
  fileSize: number
  hasForm: boolean
  formFieldCount: number
  metadata: {
    title?: string
    author?: string
    subject?: string
    creator?: string
    producer?: string
    creationDate?: string
    modificationDate?: string
  }
}

/** One extracted image reference in PDF content result. */
export type PdfContentImage = {
  page: number
  index: number
  /** Relative path from the session asset root, e.g. "report_asset/p1-img0.png". */
  url: string
  width: number
  height: number
}

/** PDF content extraction result (text + inline image references). */
export type PdfContentResult = {
  /** Plain text without image references (backward-compatible). */
  text: string
  /** Markdown with inline image references interleaved by reading order. */
  content: string
  pageCount: number
  truncated: boolean
  characterCount: number
  images: PdfContentImage[]
  /** Relative asset dir name under the session asset root, e.g. "report_asset". */
  assetDir: string
}

/** PDF form field descriptor. */
export type PdfFormField = {
  name: string
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'option-list' | 'button' | 'unknown'
  value?: string
  options?: string[]
}

// ---------------------------------------------------------------------------
// PdfInspect — detailed read result types
// ---------------------------------------------------------------------------

/** Rect tuple: [x0, y0, x1, y1] in PDF points, origin at bottom-left. */
export type PdfRect = [number, number, number, number]

/**
 * textType:
 *  - 'extractable' — real text stream, unpdf/pypdf can read it
 *  - 'scanned'      — essentially no text; pages are images. Route to OCR.
 *  - 'cid-encoded'  — has text items but they decode to (cid:N); extraction unreliable. Treat like scanned.
 *  - 'empty'        — no text and no images; rare, probably malformed.
 */
export type PdfTextType = 'extractable' | 'scanned' | 'cid-encoded' | 'empty'

export type PdfSuggestedNext =
  | { tool: 'PdfInspect'; action: 'text'; reason: string }
  | { tool: 'PdfInspect'; action: 'render'; reason: string }
  | { tool: 'PdfInspect'; action: 'form-fields'; reason: string }
  | { tool: 'CloudImageUnderstand'; reason: string; precedingAction?: 'render' }
  | { tool: 'PdfMutate'; action: 'decrypt'; reason: string }

export type PdfSummaryResult = {
  fileName: string
  pageCount: number
  fileSize: number
  isEncrypted: boolean
  /** true iff isEncrypted && password parameter was missing. */
  needsPassword: boolean
  textType: PdfTextType
  /** Total text char count across sampled pages (post-sanitize). */
  sampledTextChars: number
  /** Pages actually sampled (1-based). */
  sampledPages: number[]
  /** Pages with embedded raster images in the sampled range. */
  sampledPagesWithImages: number[]
  hasForm: boolean
  formFieldCount: number
  hasAnnotations: boolean
  annotationCount: number
  metadata: {
    title?: string
    author?: string
    subject?: string
    creator?: string
    producer?: string
    creationDate?: string
    modificationDate?: string
  }
  /** Short actionable hint for the model's next step. */
  suggestedNextTool: PdfSuggestedNext
}

export type PdfTextItem = {
  page: number
  str: string
  /** x, y in PDF points, origin at bottom-left (y of the item baseline). */
  x: number
  y: number
  width: number
  height: number
}

export type PdfTextResult = {
  text: string
  /** Only present when withCoords=true. */
  items?: PdfTextItem[]
  pageCount: number
  pageRange: { start: number; end: number }
  truncated: boolean
  characterCount: number
}

/** Detailed AcroForm field descriptor (superset of PdfFormField). */
export type PdfFormFieldDetailed = {
  name: string
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'option-list' | 'button' | 'unknown'
  /** 1-based page number where the widget lives (first widget if multi). */
  page?: number
  /** Widget rectangle in PDF coordinates. */
  rect?: PdfRect
  /** Current value (all types). */
  value?: string
  /** For checkbox: exact string to set to CHECK (from widget /AP dictionary). */
  checkedValue?: string
  /** For checkbox: exact string to set to UNCHECK (usually "Off"). */
  uncheckedValue?: string
  /** For radio group: each option with its widget rect and the value that selects it. */
  radioOptions?: Array<{ value: string; rect?: PdfRect }>
  /** For dropdown / option-list: display-text → select-value pairs. */
  choiceOptions?: Array<{ value: string; displayText: string }>
  required?: boolean
  readOnly?: boolean
}

export type PdfFormFieldsResult = {
  fields: PdfFormFieldDetailed[]
  /** Optional per-page PNG renders (when withRender=true). */
  renders?: PdfPageRender[]
}

/**
 * Non-AcroForm structural clues — text labels + horizontal lines + small
 * square rectangles that are likely checkboxes. Feed into PdfMutate(add-text)
 * to fill a scanned / static form visually.
 */
export type PdfFormStructureResult = {
  /** Text elements with exact coordinates. */
  labels: Array<{
    page: number
    /** [x0, y0, x1, y1] in PDF coords (bottom-left origin). */
    rect: PdfRect
    text: string
  }>
  /** Horizontal line segments that typically mark row boundaries or entry underlines. */
  lines: Array<{
    page: number
    x0: number
    y0: number
    x1: number
    y1: number
  }>
  /** Small square rectangles that look like checkboxes. */
  checkboxes: Array<{
    page: number
    rect: PdfRect
    center: { x: number; y: number }
  }>
  /** Inferred row boundary Y values per page, sorted top-down. */
  rowBoundaries: Array<{ page: number; ys: number[] }>
  renders?: PdfPageRender[]
}

export type PdfImagesResult = {
  images: Array<{
    page: number
    indexInPage: number
    width: number
    height: number
    /** Only present when extractImages=true. Relative to session asset root. */
    url?: string
  }>
  /** Present when extractImages=true. */
  assetDir?: string
}

export type PdfAnnotation = {
  page: number
  subtype: string
  rect?: PdfRect
  /** Content text (for Text / FreeText annotations). */
  contents?: string
  /** Title / author. */
  title?: string
  /** Quadpoints for Highlight/Underline annotations. */
  quadPoints?: number[]
  /** Target URL for Link annotations. */
  url?: string
}

export type PdfAnnotationsResult = {
  annotations: PdfAnnotation[]
}

export type PdfPageRender = {
  page: number
  /** Relative URL from the session asset root. */
  url: string
  width: number
  height: number
}

export type PdfRenderResult = {
  pages: PdfPageRender[]
  assetDir: string
}

export type PdfTablesResult = {
  tables: Array<{
    page: number
    rect?: PdfRect
    rows: string[][]
  }>
  /** Flag indicating current implementation is a simple heuristic. */
  heuristic: 'simple-grid' | 'not-implemented'
  renders?: PdfPageRender[]
}

/** PDF content item for creating PDFs. */
export type PdfContentItem =
  | { type: 'heading'; text: string; level?: number }
  | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean; fontSize?: number }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'numbered-list'; items: string[] }
  | { type: 'page-break' }

/** PDF text overlay for add-text action. */
export type PdfTextOverlay = {
  page: number
  x: number
  y: number
  text: string
  fontSize?: number
  color?: string
  /** Optional background rectangle drawn behind the text (for redaction/masking). */
  background?: {
    color: string
    padding?: number
    width?: number
    height?: number
  }
}

// ---------------------------------------------------------------------------
// Unified Read tool types — shared across PDF / DOCX / XLSX / PPTX / media
// extractors. Each extractor produces a FileContentResult which the Read tool
// formats into an XML-tagged response for the model.
// ---------------------------------------------------------------------------

/**
 * One extracted image reference in a unified Read result.
 * At most one of {page, slide, sheet, paragraph} is set depending on source format.
 */
export type FileContentImage = {
  /** Monotonic per-file image index starting at 0. */
  index: number
  /** Relative path from the session asset root, e.g. "{basename}_asset/p1-img0.png". */
  url: string
  width: number
  height: number
  /** PDF origin — 1-based page number. */
  page?: number
  /** PPTX origin — 1-based slide number. */
  slide?: number
  /** XLSX origin — sheet name. */
  sheet?: string
  /** DOCX origin — 0-based paragraph index within the document body. */
  paragraph?: number
}

/** Discriminator for the kind of file that was read. */
export type FileContentType =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'archive'
  | 'unknown'

/**
 * Unified extractor result. The Read tool's dispatcher calls per-format
 * extractors (extractPdfContent / extractDocxContent / ...) which all return
 * this shape, then Read wraps it in an XML-tagged string for the model.
 */
export type FileContentResult = {
  type: FileContentType
  fileName: string
  /** Markdown body with inline image refs (`![alt](assetDir/filename.png)`). */
  content: string
  /** Format-specific metadata: pageCount, sheetCount, slideCount, duration, etc. */
  meta: Record<string, unknown>
  images: FileContentImage[]
  /** Relative asset dir under the session asset root, e.g. "{basename}_asset". */
  assetDir?: string
  /** True if content or images were clipped due to size limits. */
  truncated?: boolean
  /**
   * When a file can't be parsed (scanned PDF with no text, image-only PPTX,
   * unknown binary…), the extractor copies it to the session asset dir and
   * sets this to the relative path. `content` stays empty in that case.
   */
  fallbackPath?: string
}
