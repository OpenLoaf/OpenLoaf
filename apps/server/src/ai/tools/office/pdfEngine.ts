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
 * PDF read helpers used by DocPreview.
 * Write operations were removed — all PDF creation / editing now goes through
 * `JsSandbox` with the preinstalled `pdf-lib` / `pdfkit` packages.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type {
  PdfStructure,
  PdfContentResult,
  PdfContentImage,
} from './types'

const MAX_TEXT_LENGTH = 200_000
const MAX_CONTENT_LENGTH = 400_000

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
 * Uses unpdf (bundled PDF.js) to parse text items, walk the operator list to
 * locate paintImageXObject ops, extract image pixels, encode to PNG and merge
 * by Y coordinate so the resulting `content` string preserves reading order
 * with images inlined.
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
        imageOps.push({
          key: args[0] as string,
          topY: top[5] + height,
          width,
          height,
        })
      }
    }

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

function parsePageRange(range: string): { start: number; end: number } {
  const m = range.match(/^(\d+)(?:-(\d+))?$/)
  if (!m) throw new Error(`Invalid pageRange: "${range}"`)
  const start = Number(m[1])
  const end = m[2] ? Number(m[2]) : start
  if (start < 1 || end < start) throw new Error(`Invalid pageRange: "${range}"`)
  return { start, end }
}
