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
 * PDF Engine — 封装 pdf-lib + @hyzyla/pdfium，提供 PDF 读写能力。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFButton,
} from 'pdf-lib'
import type {
  PdfStructure,
  PdfTextResult,
  PdfFormField,
  PdfContentItem,
  PdfTextOverlay,
} from './types'

const MAX_TEXT_LENGTH = 200_000

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/** Parse PDF structure: page count, metadata, form info. */
export async function parsePdfStructure(absPath: string): Promise<PdfStructure> {
  const buf = await fs.readFile(absPath)
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
  const form = pdfDoc.getForm()
  const fields = form.getFields()

  return {
    pageCount: pdfDoc.getPageCount(),
    fileSize: buf.length,
    hasForm: fields.length > 0,
    formFieldCount: fields.length,
    metadata: {
      title: pdfDoc.getTitle() ?? undefined,
      author: pdfDoc.getAuthor() ?? undefined,
      subject: pdfDoc.getSubject() ?? undefined,
      creator: pdfDoc.getCreator() ?? undefined,
      producer: pdfDoc.getProducer() ?? undefined,
      creationDate: pdfDoc.getCreationDate()?.toISOString() ?? undefined,
      modificationDate: pdfDoc.getModificationDate()?.toISOString() ?? undefined,
    },
  }
}

/** Extract text from PDF, optionally filtering by page range. */
export async function extractPdfText(
  absPath: string,
  pageRange?: string,
): Promise<PdfTextResult> {
  const buf = await fs.readFile(absPath)
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  const lib = await PDFiumLibrary.init()
  const doc = await lib.loadDocument(new Uint8Array(buf))
  try {
    const totalPages = doc.getPageCount()

    if (pageRange) {
      const { start, end } = parsePageRange(pageRange)
      const pageTexts: string[] = []
      for (let i = start; i <= Math.min(end, totalPages); i++) {
        const page = doc.getPage(i - 1)
        pageTexts.push(page.getText())
      }
      const text = pageTexts.join('\n\n--- Page Break ---\n\n')
      const truncated = text.length > MAX_TEXT_LENGTH
      return {
        text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
        pageCount: totalPages,
        truncated,
        characterCount: text.length,
      }
    }

    const pageTexts: string[] = []
    for (let i = 0; i < totalPages; i++) {
      const page = doc.getPage(i)
      pageTexts.push(page.getText())
    }
    const text = pageTexts.join('\n\n--- Page Break ---\n\n')
    const truncated = text.length > MAX_TEXT_LENGTH
    return {
      text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
      pageCount: totalPages,
      truncated,
      characterCount: text.length,
    }
  } finally {
    doc.destroy()
    lib.destroy()
  }
}

/** Render PDF page(s) to PNG screenshot(s) via PDFium WASM. */
export async function renderPageScreenshot(
  absPath: string,
  page: number,
  scale?: number,
): Promise<{ data: Buffer; width: number; height: number; pageNumber: number; pageCount: number }> {
  const buf = await fs.readFile(absPath)
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  const sharp = (await import('sharp')).default
  const lib = await PDFiumLibrary.init()
  const doc = await lib.loadDocument(new Uint8Array(buf))
  try {
    const pageCount = doc.getPageCount()
    if (page < 1 || page > pageCount) {
      throw new Error(`Page ${page} out of range (1-${pageCount}).`)
    }
    const pdfPage = doc.getPage(page - 1) // 0-based index
    const rendered = await pdfPage.render({ scale: scale ?? 2, render: 'bitmap' })
    const { width, height, data: bgraData } = rendered
    // PDFium outputs BGRA, convert to PNG via sharp
    const pngBuffer = await sharp(Buffer.from(bgraData), {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer()
    return {
      data: pngBuffer,
      width,
      height,
      pageNumber: page,
      pageCount,
    }
  } finally {
    doc.destroy()
    lib.destroy()
  }
}

/** Extract form fields from PDF. */
export async function extractPdfFormFields(absPath: string): Promise<PdfFormField[]> {
  const buf = await fs.readFile(absPath)
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
  const form = pdfDoc.getForm()
  const fields = form.getFields()

  return fields.map((field) => {
    const name = field.getName()

    if (field instanceof PDFTextField) {
      return { name, type: 'text' as const, value: field.getText() ?? undefined }
    }
    if (field instanceof PDFCheckBox) {
      return { name, type: 'checkbox' as const, value: field.isChecked() ? 'true' : 'false' }
    }
    if (field instanceof PDFRadioGroup) {
      return {
        name,
        type: 'radio' as const,
        value: field.getSelected() ?? undefined,
        options: field.getOptions(),
      }
    }
    if (field instanceof PDFDropdown) {
      const selected = field.getSelected()
      return {
        name,
        type: 'dropdown' as const,
        value: selected.length > 0 ? selected[0] : undefined,
        options: field.getOptions(),
      }
    }
    if (field instanceof PDFOptionList) {
      const selected = field.getSelected()
      return {
        name,
        type: 'option-list' as const,
        value: selected.length > 0 ? selected.join(', ') : undefined,
        options: field.getOptions(),
      }
    }
    if (field instanceof PDFButton) {
      return { name, type: 'button' as const }
    }
    return { name, type: 'unknown' as const }
  })
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/** Create a new PDF from structured content. */
export async function createPdf(
  absPath: string,
  content: PdfContentItem[],
): Promise<{ pageCount: number; elementCount: number }> {
  // Check for non-ASCII content (CJK limitation)
  for (const item of content) {
    if ('text' in item && hasNonLatinChars(item.text)) {
      throw new Error(
        'PDF 创建目前使用标准字体，不支持中日韩（CJK）等非拉丁字符。请使用英文内容，或改用 Word (word-mutate) 创建文档。',
      )
    }
    if ('items' in item) {
      for (const text of item.items) {
        if (hasNonLatinChars(text)) {
          throw new Error(
            'PDF 创建目前使用标准字体，不支持中日韩（CJK）等非拉丁字符。请使用英文内容，或改用 Word (word-mutate) 创建文档。',
          )
        }
      }
    }
    if ('headers' in item) {
      for (const h of item.headers) {
        if (hasNonLatinChars(h)) {
          throw new Error(
            'PDF 创建目前使用标准字体，不支持中日韩（CJK）等非拉丁字符。请使用英文内容，或改用 Word (word-mutate) 创建文档。',
          )
        }
      }
      for (const row of item.rows) {
        for (const cell of row) {
          if (hasNonLatinChars(cell)) {
            throw new Error(
              'PDF 创建目前使用标准字体，不支持中日韩（CJK）等非拉丁字符。请使用英文内容，或改用 Word (word-mutate) 创建文档。',
            )
          }
        }
      }
    }
  }

  const pdfDoc = await PDFDocument.create()
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  const PAGE_WIDTH = 595.28 // A4
  const PAGE_HEIGHT = 841.89
  const MARGIN = 50
  const LINE_HEIGHT_FACTOR = 1.4
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN
  let elementCount = 0

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
  }

  function drawText(text: string, options: {
    font: typeof fontRegular
    fontSize: number
    x?: number
    maxWidth?: number
  }) {
    const { font, fontSize, x = MARGIN, maxWidth = CONTENT_WIDTH } = options
    const lineHeight = fontSize * LINE_HEIGHT_FACTOR
    const words = text.split(' ')
    let line = ''

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      const testWidth = font.widthOfTextAtSize(testLine, fontSize)
      if (testWidth > maxWidth && line) {
        ensureSpace(lineHeight)
        page.drawText(line, { x, y, size: fontSize, font, color: rgb(0, 0, 0) })
        y -= lineHeight
        line = word
      } else {
        line = testLine
      }
    }
    if (line) {
      ensureSpace(lineHeight)
      page.drawText(line, { x, y, size: fontSize, font, color: rgb(0, 0, 0) })
      y -= lineHeight
    }
  }

  for (const item of content) {
    elementCount++
    switch (item.type) {
      case 'heading': {
        const level = Math.min(Math.max(item.level ?? 1, 1), 6)
        const fontSize = Math.max(24 - (level - 1) * 3, 12)
        y -= 8 // spacing before heading
        ensureSpace(fontSize * LINE_HEIGHT_FACTOR)
        drawText(item.text, { font: fontBold, fontSize })
        y -= 4 // spacing after heading
        break
      }
      case 'paragraph': {
        const fontSize = item.fontSize ?? 12
        const font = item.bold ? fontBold : item.italic ? fontItalic : fontRegular
        ensureSpace(fontSize * LINE_HEIGHT_FACTOR)
        drawText(item.text, { font, fontSize })
        y -= 6 // paragraph spacing
        break
      }
      case 'table': {
        const { headers, rows } = item
        const colCount = headers.length
        const colWidth = CONTENT_WIDTH / colCount
        const cellPadding = 4
        const fontSize = 10
        const lineHeight = fontSize * LINE_HEIGHT_FACTOR

        // Header row
        ensureSpace(lineHeight + cellPadding * 2)
        for (let i = 0; i < colCount; i++) {
          const cellX = MARGIN + i * colWidth + cellPadding
          page.drawText(headers[i] ?? '', {
            x: cellX,
            y: y - cellPadding,
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
          })
        }
        y -= lineHeight + cellPadding * 2

        // Data rows
        for (const row of rows) {
          ensureSpace(lineHeight + cellPadding * 2)
          for (let i = 0; i < colCount; i++) {
            const cellX = MARGIN + i * colWidth + cellPadding
            page.drawText(row[i] ?? '', {
              x: cellX,
              y: y - cellPadding,
              size: fontSize,
              font: fontRegular,
              color: rgb(0, 0, 0),
            })
          }
          y -= lineHeight + cellPadding * 2
        }
        y -= 6
        break
      }
      case 'bullet-list': {
        const fontSize = 12
        const lineHeight = fontSize * LINE_HEIGHT_FACTOR
        for (const text of item.items) {
          ensureSpace(lineHeight)
          drawText(`\u2022 ${text}`, { font: fontRegular, fontSize, x: MARGIN + 15, maxWidth: CONTENT_WIDTH - 15 })
        }
        y -= 6
        break
      }
      case 'numbered-list': {
        const fontSize = 12
        const lineHeight = fontSize * LINE_HEIGHT_FACTOR
        for (let i = 0; i < item.items.length; i++) {
          ensureSpace(lineHeight)
          drawText(`${i + 1}. ${item.items[i]}`, {
            font: fontRegular,
            fontSize,
            x: MARGIN + 15,
            maxWidth: CONTENT_WIDTH - 15,
          })
        }
        y -= 6
        break
      }
      case 'page-break': {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
        break
      }
    }
  }

  await fs.mkdir(path.dirname(absPath), { recursive: true })
  const pdfBytes = await pdfDoc.save()
  await fs.writeFile(absPath, pdfBytes)

  return { pageCount: pdfDoc.getPageCount(), elementCount }
}

/** Fill form fields in an existing PDF. */
export async function fillPdfForm(
  absPath: string,
  fields: Record<string, string>,
): Promise<{ filledCount: number; skippedFields: string[] }> {
  const buf = await fs.readFile(absPath)
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
  const form = pdfDoc.getForm()

  let filledCount = 0
  const skippedFields: string[] = []

  for (const [name, value] of Object.entries(fields)) {
    try {
      const field = form.getField(name)
      if (field instanceof PDFTextField) {
        field.setText(value)
        filledCount++
      } else if (field instanceof PDFCheckBox) {
        if (value === 'true' || value === '1' || value === 'yes') {
          field.check()
        } else {
          field.uncheck()
        }
        filledCount++
      } else if (field instanceof PDFDropdown) {
        field.select(value)
        filledCount++
      } else if (field instanceof PDFRadioGroup) {
        field.select(value)
        filledCount++
      } else if (field instanceof PDFOptionList) {
        field.select(value)
        filledCount++
      } else {
        skippedFields.push(name)
      }
    } catch {
      skippedFields.push(name)
    }
  }

  const pdfBytes = await pdfDoc.save()
  await fs.writeFile(absPath, pdfBytes)

  return { filledCount, skippedFields }
}

/** Merge multiple PDFs into one. */
export async function mergePdfs(
  outputPath: string,
  sourcePaths: string[],
): Promise<{ pageCount: number; sourceCount: number }> {
  const mergedDoc = await PDFDocument.create()

  for (const srcPath of sourcePaths) {
    const buf = await fs.readFile(srcPath)
    const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
    const pages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices())
    for (const page of pages) {
      mergedDoc.addPage(page)
    }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const pdfBytes = await mergedDoc.save()
  await fs.writeFile(outputPath, pdfBytes)

  return { pageCount: mergedDoc.getPageCount(), sourceCount: sourcePaths.length }
}

/** Add text overlays to an existing PDF. */
export async function addTextOverlays(
  absPath: string,
  overlays: PdfTextOverlay[],
): Promise<{ overlayCount: number }> {
  const buf = await fs.readFile(absPath)
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const pageCount = pdfDoc.getPageCount()

  let overlayCount = 0
  for (const overlay of overlays) {
    if (overlay.page < 1 || overlay.page > pageCount) {
      throw new Error(`Invalid page number ${overlay.page}. PDF has ${pageCount} pages.`)
    }
    const page = pdfDoc.getPage(overlay.page - 1)
    const fontSize = overlay.fontSize ?? 12
    const color = overlay.color ? parseHexColor(overlay.color) : rgb(0, 0, 0)

    // Draw background rectangle first (for redaction/masking)
    if (overlay.background) {
      const bg = overlay.background
      const pad = bg.padding ?? 2
      const textWidth = font.widthOfTextAtSize(overlay.text, fontSize)
      const rectW = bg.width ?? textWidth + pad * 2
      const rectH = bg.height ?? fontSize + pad * 2
      page.drawRectangle({
        x: overlay.x - pad,
        y: overlay.y - pad,
        width: rectW,
        height: rectH,
        color: parseHexColor(bg.color),
      })
    }

    page.drawText(overlay.text, {
      x: overlay.x,
      y: overlay.y,
      size: fontSize,
      font,
      color,
    })
    overlayCount++
  }

  const pdfBytes = await pdfDoc.save()
  await fs.writeFile(absPath, pdfBytes)

  return { overlayCount }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePageRange(range: string): { start: number; end: number } {
  const parts = range.split('-').map((s) => s.trim())
  if (parts.length === 1) {
    const page = Number.parseInt(parts[0]!, 10)
    if (Number.isNaN(page) || page < 1) throw new Error(`Invalid page range: "${range}"`)
    return { start: page, end: page }
  }
  if (parts.length === 2) {
    const start = Number.parseInt(parts[0]!, 10)
    const end = Number.parseInt(parts[1]!, 10)
    if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start) {
      throw new Error(`Invalid page range: "${range}"`)
    }
    return { start, end }
  }
  throw new Error(`Invalid page range: "${range}"`)
}


function parseHexColor(hex: string): ReturnType<typeof rgb> {
  const clean = hex.replace('#', '')
  const r = Number.parseInt(clean.substring(0, 2), 16) / 255
  const g = Number.parseInt(clean.substring(2, 4), 16) / 255
  const b = Number.parseInt(clean.substring(4, 6), 16) / 255
  return rgb(r, g, b)
}

function hasNonLatinChars(text: string): boolean {
  // Detect CJK and other non-Latin characters that StandardFonts cannot render
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: intentional CJK detection
  return /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f]/.test(text)
}
