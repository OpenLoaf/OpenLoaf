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
import { embedFonts, embedFont } from './pdfFonts'
import {
  PDFDocument,
  rgb,
  degrees,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFButton,
} from 'pdf-lib'
import { PdfEncryptedError } from './pdfInspectEngine'
import type {
  PdfStructure,
  PdfFormField,
  PdfContentItem,
  PdfTextOverlay,
  PdfContentResult,
  PdfContentImage,
} from './types'

const MAX_TEXT_LENGTH = 200_000
const MAX_CONTENT_LENGTH = 400_000

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

/**
 * Extract PDF text + embedded images with reading-order interleaving.
 *
 * Uses unpdf (bundled PDF.js) to:
 *   1. Parse text items with coordinates via getTextContent
 *   2. Track CTM stack through getOperatorList to locate paintImageXObject ops
 *   3. Pull raw image pixel data via extractImages and encode to PNG via sharp
 *
 * Text + image markdown references are then merged by page Y coordinate so the
 * resulting `content` string preserves reading order with images inlined.
 */
export async function extractPdfContent(
  absPath: string,
  pageRange: string | undefined,
  assetDirAbsPath: string,
  assetRelPrefix: string,
): Promise<PdfContentResult> {
  // unpdf's bundled PDF.js (v5.6) uses Promise.try (ES2026) — absent on Node <24.
  // Inject an idempotent polyfill so the dynamic import below doesn't blow up.
  if (typeof (Promise as unknown as { try?: unknown }).try !== 'function') {
    ;(Promise as unknown as { try: typeof Promise.resolve }).try = function <T>(
      fn: (...args: unknown[]) => T | PromiseLike<T>,
      ...args: unknown[]
    ): Promise<T> {
      return new Promise<T>((resolve) => resolve(fn(...args)))
    } as typeof Promise.resolve
  }
  const buf = await fs.readFile(absPath)
  const { getDocumentProxy, extractImages, getResolvedPDFJS } = await import('unpdf')
  const sharp = (await import('sharp')).default

  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const totalPages = pdf.numPages

  const { OPS } = await getResolvedPDFJS()

  const { start, end } = pageRange
    ? parsePageRange(pageRange)
    : { start: 1, end: totalPages }
  const effectiveEnd = Math.min(end, totalPages)

  await fs.mkdir(assetDirAbsPath, { recursive: true })

  const contentParts: string[] = []
  const textParts: string[] = []
  const allImages: PdfContentImage[] = []

  type Matrix = [number, number, number, number, number, number]
  const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
  function mul(a: Matrix, b: Matrix): Matrix {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ]
  }

  for (let p = start; p <= effectiveEnd; p++) {
    const page = await pdf.getPage(p)
    const [textContent, opList] = await Promise.all([
      page.getTextContent(),
      page.getOperatorList(),
    ])

    // 1. Walk op list, maintain CTM stack, collect image op positions
    type ImageOp = { key: string; topY: number; width: number; height: number }
    const imageOps: ImageOp[] = []
    const stack: Matrix[] = [[...IDENTITY] as Matrix]
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i]
      const args = opList.argsArray[i] as unknown[]
      if (fn === OPS.save) {
        stack.push([...stack[stack.length - 1]!] as Matrix)
      } else if (fn === OPS.restore) {
        if (stack.length > 1) stack.pop()
      } else if (fn === OPS.transform) {
        const top = stack[stack.length - 1]!
        stack[stack.length - 1] = mul(top, args as Matrix)
      } else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintImageXObjectRepeat
      ) {
        const top = stack[stack.length - 1]!
        const width = Math.abs(top[0])
        const height = Math.abs(top[3])
        // Image origin is at top[4], top[5]; with standard layout this is the
        // lower-left in PDF coords — top edge y = lowerLeftY + height.
        imageOps.push({
          key: args[0] as string,
          topY: top[5] + height,
          width,
          height,
        })
      }
    }

    // 2. Pull raw image data, encode and persist
    const pdfImages = await extractImages(pdf, p)
    const byKey = new Map<string, (typeof pdfImages)[number]>()
    for (const img of pdfImages) byKey.set(img.key, img)

    type PageImageEntry = {
      topY: number
      markdown: string
      url: string
      width: number
      height: number
    }
    const pageImageEntries: PageImageEntry[] = []
    let seenIndex = 0
    for (const op of imageOps) {
      const data = byKey.get(op.key)
      if (!data) continue
      const index = seenIndex++
      const fileName = `p${p}-img${index}.png`
      const bytes = Buffer.from(
        data.data.buffer,
        data.data.byteOffset,
        data.data.byteLength,
      )
      const png = await sharp(bytes, {
        raw: { width: data.width, height: data.height, channels: data.channels },
      })
        .png()
        .toBuffer()
      const outPath = path.join(assetDirAbsPath, fileName)
      await fs.writeFile(outPath, png)
      const url = `${assetRelPrefix}/${fileName}`
      pageImageEntries.push({
        topY: op.topY,
        markdown: `\n\n![page-${p}-image-${index}](${url})\n\n`,
        url,
        width: data.width,
        height: data.height,
      })
      allImages.push({
        page: p,
        index,
        url,
        width: data.width,
        height: data.height,
      })
    }
    pageImageEntries.sort((a, b) => b.topY - a.topY)

    // 3. Group text items into lines by y coordinate, sort lines top-to-bottom
    type Line = { y: number; cells: Array<{ str: string; x: number }> }
    const lines: Line[] = []
    for (const raw of textContent.items) {
      const it = raw as { str?: string; transform?: number[] }
      if (typeof it.str !== 'string' || !it.transform) continue
      const y = it.transform[5] ?? 0
      const x = it.transform[4] ?? 0
      let line = lines.find((l) => Math.abs(l.y - y) < 1.5)
      if (!line) {
        line = { y, cells: [] }
        lines.push(line)
      }
      line.cells.push({ str: it.str, x })
    }
    for (const line of lines) line.cells.sort((a, b) => a.x - b.x)
    lines.sort((a, b) => b.y - a.y)

    // 4. Interleave lines with images by Y coordinate
    let pageContent = `\n\n## Page ${p}\n\n`
    let pageText = ''
    let imgCursor = 0
    for (const line of lines) {
      while (
        imgCursor < pageImageEntries.length &&
        pageImageEntries[imgCursor]!.topY >= line.y
      ) {
        pageContent += pageImageEntries[imgCursor]!.markdown
        imgCursor++
      }
      const lineStr = line.cells.map((c) => c.str).join('')
      pageContent += `${lineStr}\n`
      pageText += `${lineStr}\n`
    }
    while (imgCursor < pageImageEntries.length) {
      pageContent += pageImageEntries[imgCursor]!.markdown
      imgCursor++
    }

    contentParts.push(pageContent)
    textParts.push(pageText)
  }

  let text = textParts.join('\n--- Page Break ---\n')
  let content = contentParts.join('')
  const textTruncated = text.length > MAX_TEXT_LENGTH
  const contentTruncated = content.length > MAX_CONTENT_LENGTH
  if (textTruncated) text = text.slice(0, MAX_TEXT_LENGTH)
  if (contentTruncated) content = content.slice(0, MAX_CONTENT_LENGTH)

  return {
    text,
    content,
    pageCount: totalPages,
    truncated: textTruncated || contentTruncated,
    characterCount: text.length,
    images: allImages,
    assetDir: assetRelPrefix,
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
  // Collect all text from content items to detect CJK
  const allTexts: string[] = []
  for (const item of content) {
    if ('text' in item) allTexts.push(item.text)
    if ('items' in item) allTexts.push(...item.items)
    if ('headers' in item) {
      allTexts.push(...item.headers)
      for (const row of item.rows) allTexts.push(...row)
    }
  }

  const pdfDoc = await PDFDocument.create()
  const fonts = await embedFonts(pdfDoc, allTexts)
  const fontRegular = fonts.regular
  const fontBold = fonts.bold
  const fontItalic = fonts.italic

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
  // Detect CJK in overlay texts and load appropriate font
  const allOverlayTexts = overlays.map(o => o.text)
  const font = await embedFont(pdfDoc, allOverlayTexts.join(''))
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

// ---------------------------------------------------------------------------
// Stage-2 write operations
// ---------------------------------------------------------------------------

/** Load a PDF honoring encryption. Throws PdfEncryptedError if locked and no valid password. */
async function loadPdfForMutation(absPath: string, password?: string): Promise<PDFDocument> {
  const buf = await fs.readFile(absPath)
  try {
    if (password) {
      return await PDFDocument.load(buf, { password, ignoreEncryption: false } as never)
    }
    return await PDFDocument.load(buf)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/encrypt/i.test(msg) || /password/i.test(msg)) {
      throw new PdfEncryptedError()
    }
    throw err
  }
}

/**
 * Parse a qpdf-style range string into concrete page numbers.
 *   "1,3-5,8,10-end" → [1,3,4,5,8,10,11,...,total]
 *   "end"            → [total]
 *   "1,end"          → [1, total]
 */
export function parseComplexPageRanges(input: string, totalPages: number): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  const push = (p: number) => {
    if (!seen.has(p)) {
      out.push(p)
      seen.add(p)
    }
  }
  const parseToken = (token: string): number => {
    if (token === 'end') return totalPages
    const n = Number.parseInt(token, 10)
    if (Number.isNaN(n) || n < 1 || n > totalPages) {
      throw new Error(`Invalid page "${token}" for a ${totalPages}-page PDF.`)
    }
    return n
  }
  for (const raw of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (raw.includes('-')) {
      const [aRaw, bRaw] = raw.split('-').map((s) => s.trim())
      const start = parseToken(aRaw!)
      const end = parseToken(bRaw!)
      if (end < start) {
        throw new Error(`Invalid range segment "${raw}": end < start.`)
      }
      for (let p = start; p <= end; p++) push(p)
    } else {
      push(parseToken(raw))
    }
  }
  return out
}

/** Rotate selected pages. Degrees must be a multiple of 90. */
export async function rotatePdfPages(
  absPath: string,
  rotations: Array<{ page: number; degrees: number }>,
  password?: string,
): Promise<{ rotatedCount: number; pageCount: number }> {
  const pdfDoc = await loadPdfForMutation(absPath, password)
  const pageCount = pdfDoc.getPageCount()
  for (const { page, degrees: deg } of rotations) {
    if (page < 1 || page > pageCount) {
      throw new Error(`Page ${page} out of range (1-${pageCount}).`)
    }
    const current = pdfDoc.getPage(page - 1).getRotation().angle
    pdfDoc.getPage(page - 1).setRotation(degrees((current + deg) % 360))
  }
  await fs.writeFile(absPath, await pdfDoc.save())
  return { rotatedCount: rotations.length, pageCount }
}

/** Set mediaBox on selected pages (visual crop; does not discard page content). */
export async function cropPdfPages(
  absPath: string,
  crops: Array<{ page: number; mediaBox: [number, number, number, number] }>,
  password?: string,
): Promise<{ croppedCount: number; pageCount: number }> {
  const pdfDoc = await loadPdfForMutation(absPath, password)
  const pageCount = pdfDoc.getPageCount()
  for (const { page, mediaBox } of crops) {
    if (page < 1 || page > pageCount) {
      throw new Error(`Page ${page} out of range (1-${pageCount}).`)
    }
    const [x, y, w, h] = mediaBox
    pdfDoc.getPage(page - 1).setMediaBox(x, y, w, h)
  }
  await fs.writeFile(absPath, await pdfDoc.save())
  return { croppedCount: crops.length, pageCount }
}

/** Split the PDF into groups of `groupSize` pages. */
export async function splitPdfByGroups(
  absPath: string,
  outputDir: string,
  groupSize: number,
  password?: string,
): Promise<{ parts: string[] }> {
  const pdfDoc = await loadPdfForMutation(absPath, password)
  const pageCount = pdfDoc.getPageCount()
  await fs.mkdir(outputDir, { recursive: true })
  const base = path.basename(absPath, path.extname(absPath))
  const parts: string[] = []
  let partIdx = 1
  for (let start = 0; start < pageCount; start += groupSize) {
    const end = Math.min(start + groupSize, pageCount)
    const partDoc = await PDFDocument.create()
    const indices = Array.from({ length: end - start }, (_, i) => start + i)
    const copied = await partDoc.copyPages(pdfDoc, indices)
    for (const p of copied) partDoc.addPage(p)
    const outPath = path.join(outputDir, `${base}-part${partIdx}.pdf`)
    await fs.writeFile(outPath, await partDoc.save())
    parts.push(outPath)
    partIdx++
  }
  return { parts }
}

/** Split the PDF at breakpoint pages (each breakpoint starts a NEW part). */
export async function splitPdfAtBreakpoints(
  absPath: string,
  outputDir: string,
  breakpoints: number[],
  password?: string,
): Promise<{ parts: string[] }> {
  const pdfDoc = await loadPdfForMutation(absPath, password)
  const pageCount = pdfDoc.getPageCount()
  await fs.mkdir(outputDir, { recursive: true })
  const base = path.basename(absPath, path.extname(absPath))
  // Build ranges: [1 .. bp[0]-1], [bp[0] .. bp[1]-1], ..., [bp[-1] .. pageCount]
  const sorted = Array.from(new Set(breakpoints))
    .filter((n) => n >= 2 && n <= pageCount)
    .sort((a, b) => a - b)
  const boundaries = [1, ...sorted, pageCount + 1]
  const parts: string[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i]!
    const to = boundaries[i + 1]! - 1
    if (from > to) continue
    const partDoc = await PDFDocument.create()
    const indices = Array.from({ length: to - from + 1 }, (_, k) => from - 1 + k)
    const copied = await partDoc.copyPages(pdfDoc, indices)
    for (const p of copied) partDoc.addPage(p)
    const outPath = path.join(outputDir, `${base}-part${i + 1}.pdf`)
    await fs.writeFile(outPath, await partDoc.save())
    parts.push(outPath)
  }
  return { parts }
}

/** Extract complex page ranges into a single output PDF. */
export async function extractPdfPages(
  absPath: string,
  outputPath: string,
  ranges: string,
  password?: string,
): Promise<{ pageCount: number; sourcePages: number[] }> {
  const pdfDoc = await loadPdfForMutation(absPath, password)
  const pageNums = parseComplexPageRanges(ranges, pdfDoc.getPageCount())
  const outDoc = await PDFDocument.create()
  const indices = pageNums.map((p) => p - 1)
  const copied = await outDoc.copyPages(pdfDoc, indices)
  for (const p of copied) outDoc.addPage(p)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, await outDoc.save())
  return { pageCount: outDoc.getPageCount(), sourcePages: pageNums }
}

/** Decrypt and re-save without password. */
export async function decryptPdf(
  absPath: string,
  outputPath: string,
  password: string,
): Promise<{ pageCount: number }> {
  const pdfDoc = await loadPdfForMutation(absPath, password)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  // pdf-lib's default save produces an unencrypted stream.
  await fs.writeFile(outputPath, await pdfDoc.save())
  return { pageCount: pdfDoc.getPageCount() }
}

/** Re-save with optional linearization (best-effort via object-stream toggle). */
export async function optimizePdf(
  absPath: string,
  outputPath: string,
  opts: { linearize?: boolean; password?: string } = {},
): Promise<{ beforeBytes: number; afterBytes: number }> {
  const stat = await fs.stat(absPath)
  const pdfDoc = await loadPdfForMutation(absPath, opts.password)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  // Linearize ≈ disable object streams (widely viewable, web-friendly).
  const bytes = await pdfDoc.save({ useObjectStreams: !opts.linearize })
  await fs.writeFile(outputPath, bytes)
  return { beforeBytes: stat.size, afterBytes: bytes.length }
}

/** Apply a semi-transparent text watermark to every (or a subset of) pages. */
export async function watermarkPdfWithText(
  absPath: string,
  opts: {
    text: string
    fontSize?: number
    color?: string
    opacity?: number
    angle?: number
    pageRange?: string
    password?: string
  },
): Promise<{ pagesWatermarked: number }> {
  const pdfDoc = await loadPdfForMutation(absPath, opts.password)
  const font = await embedFont(pdfDoc, opts.text)
  const fontSize = opts.fontSize ?? 48
  const color = opts.color ? parseHexColor(opts.color) : rgb(0.53, 0.53, 0.53)
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.3))
  const angle = opts.angle ?? -30
  const pageCount = pdfDoc.getPageCount()
  const { start, end } = opts.pageRange
    ? parsePageRange(opts.pageRange)
    : { start: 1, end: pageCount }
  const effectiveEnd = Math.min(end, pageCount)

  const textWidth = font.widthOfTextAtSize(opts.text, fontSize)

  for (let p = start; p <= effectiveEnd; p++) {
    const page = pdfDoc.getPage(p - 1)
    const { width, height } = page.getSize()
    const cx = width / 2
    const cy = height / 2
    page.drawText(opts.text, {
      x: cx - textWidth / 2,
      y: cy - fontSize / 2,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(angle),
    })
  }

  await fs.writeFile(absPath, await pdfDoc.save())
  return { pagesWatermarked: effectiveEnd - start + 1 }
}

/** Stamp another PDF's page on top of every target page. */
export async function watermarkPdfWithPdf(
  absPath: string,
  opts: {
    watermarkPdfPath: string
    watermarkPdfPage?: number
    opacity?: number
    pageRange?: string
    password?: string
  },
): Promise<{ pagesWatermarked: number }> {
  const pdfDoc = await loadPdfForMutation(absPath, opts.password)
  const wmBuf = await fs.readFile(opts.watermarkPdfPath)
  const wmDoc = await PDFDocument.load(wmBuf)
  const wmPageIdx = (opts.watermarkPdfPage ?? 1) - 1
  if (wmPageIdx < 0 || wmPageIdx >= wmDoc.getPageCount()) {
    throw new Error(`watermarkPdfPage ${opts.watermarkPdfPage} out of range for ${opts.watermarkPdfPath}.`)
  }
  const [embeddedWm] = await pdfDoc.embedPdf(wmDoc, [wmPageIdx])
  if (!embeddedWm) throw new Error('Failed to embed watermark PDF.')

  const pageCount = pdfDoc.getPageCount()
  const { start, end } = opts.pageRange
    ? parsePageRange(opts.pageRange)
    : { start: 1, end: pageCount }
  const effectiveEnd = Math.min(end, pageCount)
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.3))

  for (let p = start; p <= effectiveEnd; p++) {
    const page = pdfDoc.getPage(p - 1)
    const { width, height } = page.getSize()
    const w = embeddedWm.width
    const h = embeddedWm.height
    // Center the watermark, scale to fit 80% of the page width.
    const targetW = width * 0.8
    const scale = targetW / w
    const drawW = w * scale
    const drawH = h * scale
    page.drawPage(embeddedWm, {
      x: (width - drawW) / 2,
      y: (height - drawH) / 2,
      width: drawW,
      height: drawH,
      opacity,
    })
  }

  await fs.writeFile(absPath, await pdfDoc.save())
  return { pagesWatermarked: effectiveEnd - start + 1 }
}

// -------- fill-visual with bbox validation + coordinate conversion --------

type VisualFieldInput = {
  page: number
  entryBoundingBox: [number, number, number, number]
  text: string
  fontSize?: number
  color?: string
  coordSystem?: 'pdf' | 'image'
  imageWidth?: number
  imageHeight?: number
}

type ResolvedVisualField = {
  page: number
  pdfBBox: [number, number, number, number] // always PDF coords, bottom-left origin
  text: string
  fontSize: number
  color: string
}

/** Validate + auto-convert visual fields before drawing. */
function resolveVisualFields(
  fields: VisualFieldInput[],
  pageSizes: Map<number, { width: number; height: number }>,
): { resolved: ResolvedVisualField[]; errors: string[] } {
  const errors: string[] = []
  const resolved: ResolvedVisualField[] = []

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!
    const size = pageSizes.get(f.page)
    if (!size) {
      errors.push(`field ${i}: page ${f.page} does not exist in the document.`)
      continue
    }
    let pdfBBox: [number, number, number, number]
    if ((f.coordSystem ?? 'pdf') === 'image') {
      if (!f.imageWidth || !f.imageHeight) {
        errors.push(`field ${i}: coordSystem="image" requires imageWidth and imageHeight.`)
        continue
      }
      const sx = size.width / f.imageWidth
      const sy = size.height / f.imageHeight
      const [ix0, iy0, ix1, iy1] = f.entryBoundingBox
      // image: origin top-left, y down. Convert y by flipping.
      pdfBBox = [
        ix0 * sx,
        size.height - iy1 * sy, // lower-left y
        ix1 * sx,
        size.height - iy0 * sy, // upper-right y
      ]
    } else {
      pdfBBox = [...f.entryBoundingBox] as [number, number, number, number]
      // Normalize so x0<x1, y0<y1.
      if (pdfBBox[0] > pdfBBox[2]) [pdfBBox[0], pdfBBox[2]] = [pdfBBox[2], pdfBBox[0]]
      if (pdfBBox[1] > pdfBBox[3]) [pdfBBox[1], pdfBBox[3]] = [pdfBBox[3], pdfBBox[1]]
    }
    resolved.push({
      page: f.page,
      pdfBBox,
      text: f.text,
      fontSize: f.fontSize ?? 10,
      color: f.color ?? '#000000',
    })
  }

  // Overlap check (same-page pairs only).
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      if (resolved[i]!.page !== resolved[j]!.page) continue
      const a = resolved[i]!.pdfBBox
      const b = resolved[j]!.pdfBBox
      if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) {
        errors.push(`fields ${i} and ${j} bboxes overlap on page ${resolved[i]!.page}.`)
      }
    }
  }

  // Size sanity check: bbox must fit at least one line of text at the chosen size.
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i]!
    const bw = r.pdfBBox[2] - r.pdfBBox[0]
    const bh = r.pdfBBox[3] - r.pdfBBox[1]
    if (bh < r.fontSize) {
      errors.push(`field ${i}: bbox height ${bh.toFixed(1)} pt < fontSize ${r.fontSize}.`)
    }
    // Very rough advance-width estimate: most Latin glyphs are ~0.5×fontSize.
    const estTextWidth = r.text.length * r.fontSize * 0.5
    if (bw < estTextWidth * 0.35) {
      errors.push(`field ${i}: bbox width ${bw.toFixed(1)} pt likely too narrow for text "${r.text}" at fontSize ${r.fontSize}.`)
    }
  }

  return { resolved, errors }
}

/** Visual form fill: place text in entry boxes, PDF or image coords. */
export async function fillPdfVisual(
  absPath: string,
  fields: VisualFieldInput[],
  password?: string,
): Promise<{ filledCount: number; errors: string[] }> {
  const pdfDoc = await loadPdfForMutation(absPath, password)
  const pageSizes = new Map<number, { width: number; height: number }>()
  pdfDoc.getPages().forEach((page, idx) => {
    const { width, height } = page.getSize()
    pageSizes.set(idx + 1, { width, height })
  })

  const { resolved, errors } = resolveVisualFields(fields, pageSizes)
  if (errors.length > 0) {
    return { filledCount: 0, errors }
  }

  // CJK-aware font.
  const allText = resolved.map((r) => r.text).join('')
  const font = await embedFont(pdfDoc, allText)

  for (const r of resolved) {
    const page = pdfDoc.getPage(r.page - 1)
    // Draw at bbox bottom-left + small padding up so text sits inside.
    const x = r.pdfBBox[0] + 2
    const y = r.pdfBBox[1] + 2
    page.drawText(r.text, {
      x,
      y,
      size: r.fontSize,
      font,
      color: parseHexColor(r.color),
    })
  }

  await fs.writeFile(absPath, await pdfDoc.save())
  return { filledCount: resolved.length, errors: [] }
}


