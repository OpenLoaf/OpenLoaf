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
