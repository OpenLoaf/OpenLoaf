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
 * PDF Inspect Engine — read-only analysis used by the PdfInspect tool.
 *
 * All helpers here *honor encryption*. Pass `password` explicitly; otherwise
 * the helpers throw a typed error the caller can surface as
 * `{ isEncrypted: true, needsPassword: true }` back to the model.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFButton,
  PDFName,
  PDFArray,
  PDFDict,
  PDFNumber,
  PDFString,
  PDFHexString,
  PDFRef,
  type PDFPage,
} from 'pdf-lib'
import type {
  PdfRect,
  PdfTextType,
  PdfSummaryResult,
  PdfTextResult,
  PdfTextItem,
  PdfFormFieldDetailed,
  PdfFormFieldsResult,
  PdfFormStructureResult,
  PdfImagesResult,
  PdfAnnotation,
  PdfAnnotationsResult,
  PdfPageRender,
  PdfRenderResult,
  PdfTablesResult,
  PdfSuggestedNext,
} from './types'

const MAX_TEXT_LENGTH = 200_000
const MAX_TEXT_ITEMS = 20_000

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/**
 * unpdf's bundled pdf.js (v5.6) calls `Promise.try` (ES2026). Older Node
 * runtimes ship without it and the dynamic import explodes. Inject an
 * idempotent polyfill before any `import('unpdf')`.
 */
function installPromiseTryPolyfill(): void {
  if (typeof (Promise as unknown as { try?: unknown }).try === 'function') return
  ;(Promise as unknown as { try: typeof Promise.resolve }).try = function <T>(
    fn: (...args: unknown[]) => T | PromiseLike<T>,
    ...args: unknown[]
  ): Promise<T> {
    return new Promise<T>((resolve) => resolve(fn(...args)))
  } as typeof Promise.resolve
}

export class PdfEncryptedError extends Error {
  readonly code = 'PDF_ENCRYPTED'
  constructor(message = 'PDF is encrypted. Provide the `password` argument to unlock it.') {
    super(message)
    this.name = 'PdfEncryptedError'
  }
}

/** Load an already-read buffer. Throws PdfEncryptedError if encrypted and no valid password. */
async function loadPdfLibDoc(buf: Buffer, password?: string): Promise<PDFDocument> {
  try {
    if (password) {
      // pdf-lib does not support decryption natively — use ignoreEncryption
      // for pdf-lib operations. unpdf handles the real decryption path.
      return await PDFDocument.load(buf, { ignoreEncryption: true, password } as never)
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

/** Detect encryption via raw bytes (faster than trying to load). */
async function isPdfFileEncrypted(buf: Buffer): Promise<boolean> {
  // PDFs embed an /Encrypt entry in the trailer when encrypted. Scan the last
  // ~8KB for the token — cheap and robust.
  const tail = buf.subarray(Math.max(0, buf.byteLength - 8192))
  const s = tail.toString('latin1')
  return /\/Encrypt\s/.test(s)
}

/** Parse a PDF page-range string like "3" or "5-12". */
function parsePageRange(range: string): { start: number; end: number } {
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

function clampRange(
  range: { start: number; end: number } | undefined,
  totalPages: number,
): { start: number; end: number } {
  if (!range) return { start: 1, end: totalPages }
  return { start: Math.max(1, range.start), end: Math.min(totalPages, range.end) }
}

async function openUnpdf(
  buf: Buffer,
  password?: string,
): Promise<{
  pdf: Awaited<ReturnType<typeof import('unpdf').getDocumentProxy>>
  OPS: Record<string, number>
  extractImages: typeof import('unpdf').extractImages
}> {
  installPromiseTryPolyfill()
  const { getDocumentProxy, getResolvedPDFJS, extractImages } = await import('unpdf')
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf), password ? { password } : undefined)
    const { OPS } = await getResolvedPDFJS()
    return { pdf, OPS, extractImages }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/password/i.test(msg) || /PasswordException/.test(msg)) {
      throw new PdfEncryptedError()
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Action: summary
// ---------------------------------------------------------------------------

const CID_PATTERN = /\(cid:\d+\)/g

export async function inspectSummary(
  absPath: string,
  options: { password?: string; sampleSize?: number } = {},
): Promise<PdfSummaryResult> {
  const fileName = path.basename(absPath)
  const buf = await fs.readFile(absPath)
  const encrypted = await isPdfFileEncrypted(buf)
  const needsPassword = encrypted && !options.password

  const metadataDefault: PdfSummaryResult['metadata'] = {}

  if (needsPassword) {
    return {
      fileName,
      pageCount: 0,
      fileSize: buf.length,
      isEncrypted: true,
      needsPassword: true,
      textType: 'empty',
      sampledTextChars: 0,
      sampledPages: [],
      sampledPagesWithImages: [],
      hasForm: false,
      formFieldCount: 0,
      hasAnnotations: false,
      annotationCount: 0,
      metadata: metadataDefault,
      suggestedNextTool: {
        tool: 'PdfMutate',
        action: 'decrypt',
        reason: 'PDF is encrypted. Call PdfInspect again with `password`, or call PdfMutate(decrypt) to produce an unlocked copy.',
      },
    }
  }

  const pdfLibDoc = await loadPdfLibDoc(buf, options.password)
  const pageCount = pdfLibDoc.getPageCount()
  const form = pdfLibDoc.getForm()
  const fields = form.getFields()

  const metadata: PdfSummaryResult['metadata'] = {
    title: pdfLibDoc.getTitle() ?? undefined,
    author: pdfLibDoc.getAuthor() ?? undefined,
    subject: pdfLibDoc.getSubject() ?? undefined,
    creator: pdfLibDoc.getCreator() ?? undefined,
    producer: pdfLibDoc.getProducer() ?? undefined,
    creationDate: pdfLibDoc.getCreationDate()?.toISOString() ?? undefined,
    modificationDate: pdfLibDoc.getModificationDate()?.toISOString() ?? undefined,
  }

  // Count annotations via pdf-lib (cheap walk).
  let annotationCount = 0
  for (const page of pdfLibDoc.getPages()) {
    const annots = page.node.lookup(PDFName.of('Annots'))
    if (annots instanceof PDFArray) annotationCount += annots.size()
  }

  // Sample first N pages for textType detection.
  const sampleSize = Math.max(1, Math.min(options.sampleSize ?? 3, pageCount))
  const { pdf, OPS } = await openUnpdf(buf, options.password)
  const sampledPages: number[] = []
  const sampledPagesWithImages: number[] = []
  let totalChars = 0
  let cidMatches = 0

  for (let p = 1; p <= sampleSize; p++) {
    sampledPages.push(p)
    const page = await pdf.getPage(p)
    const [textContent, opList] = await Promise.all([
      page.getTextContent(),
      page.getOperatorList(),
    ])
    let pageText = ''
    for (const raw of textContent.items) {
      const it = raw as { str?: string }
      if (typeof it.str === 'string') pageText += it.str
    }
    totalChars += pageText.length
    const cidHits = pageText.match(CID_PATTERN)?.length ?? 0
    cidMatches += cidHits

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i]
      if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
        sampledPagesWithImages.push(p)
        break
      }
    }
  }

  // Decide textType.
  const hasImages = sampledPagesWithImages.length > 0
  let textType: PdfTextType
  if (totalChars < 10 && hasImages) textType = 'scanned'
  else if (totalChars < 10 && !hasImages) textType = 'empty'
  else if (cidMatches > 0 && cidMatches * 6 > totalChars) textType = 'cid-encoded'
  else textType = 'extractable'

  // Suggested next tool.
  let suggestedNextTool: PdfSuggestedNext
  if (textType === 'scanned' || textType === 'cid-encoded') {
    suggestedNextTool = {
      tool: 'CloudImageUnderstand',
      reason:
        textType === 'scanned'
          ? 'PDF pages contain no extractable text stream. Call PdfInspect(render, pageRange=...) to produce PNGs, then feed each PNG into CloudImageUnderstand for OCR.'
          : 'Text items decode to (cid:N) glyph refs — extraction unreliable. Render pages and OCR them instead.',
      precedingAction: 'render',
    }
  } else if (fields.length > 0) {
    suggestedNextTool = {
      tool: 'PdfInspect',
      action: 'form-fields',
      reason: 'This PDF has AcroForm fields. Call PdfInspect(form-fields) to get the exact checkedValue / option values before PdfMutate(fill-form).',
    }
  } else {
    suggestedNextTool = {
      tool: 'PdfInspect',
      action: 'text',
      reason: 'Text is extractable. Call PdfInspect(text) with a pageRange for large PDFs.',
    }
  }

  return {
    fileName,
    pageCount,
    fileSize: buf.length,
    isEncrypted: encrypted,
    needsPassword: false,
    textType,
    sampledTextChars: totalChars,
    sampledPages,
    sampledPagesWithImages: Array.from(new Set(sampledPagesWithImages)),
    hasForm: fields.length > 0,
    formFieldCount: fields.length,
    hasAnnotations: annotationCount > 0,
    annotationCount,
    metadata,
    suggestedNextTool,
  }
}

// ---------------------------------------------------------------------------
// Action: text
// ---------------------------------------------------------------------------

export async function inspectText(
  absPath: string,
  options: { pageRange?: string; withCoords?: boolean; password?: string } = {},
): Promise<PdfTextResult> {
  const buf = await fs.readFile(absPath)
  const { pdf } = await openUnpdf(buf, options.password)
  const totalPages = pdf.numPages
  const range = clampRange(
    options.pageRange ? parsePageRange(options.pageRange) : undefined,
    totalPages,
  )

  const textParts: string[] = []
  const items: PdfTextItem[] = []
  let truncated = false

  outer: for (let p = range.start; p <= range.end; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    type Line = { y: number; cells: Array<{ str: string; x: number }> }
    const lines: Line[] = []
    for (const raw of tc.items) {
      const it = raw as {
        str?: string
        transform?: number[]
        width?: number
        height?: number
      }
      if (typeof it.str !== 'string' || !it.transform) continue
      const x = it.transform[4] ?? 0
      const y = it.transform[5] ?? 0
      let line = lines.find((l) => Math.abs(l.y - y) < 1.5)
      if (!line) {
        line = { y, cells: [] }
        lines.push(line)
      }
      line.cells.push({ str: it.str, x })

      if (options.withCoords && items.length < MAX_TEXT_ITEMS) {
        items.push({
          page: p,
          str: it.str,
          x,
          y,
          width: it.width ?? 0,
          height: it.height ?? 0,
        })
      }
    }
    for (const line of lines) line.cells.sort((a, b) => a.x - b.x)
    lines.sort((a, b) => b.y - a.y)

    let pageText = `\n--- Page ${p} ---\n`
    for (const line of lines) {
      pageText += `${line.cells.map((c) => c.str).join('')}\n`
    }
    if (textParts.join('').length + pageText.length > MAX_TEXT_LENGTH) {
      const remaining = MAX_TEXT_LENGTH - textParts.join('').length
      textParts.push(pageText.slice(0, Math.max(0, remaining)))
      truncated = true
      break outer
    }
    textParts.push(pageText)
  }

  const text = textParts.join('')
  return {
    text,
    items: options.withCoords ? items : undefined,
    pageCount: totalPages,
    pageRange: range,
    truncated,
    characterCount: text.length,
  }
}

// ---------------------------------------------------------------------------
// Action: form-fields (detailed)
// ---------------------------------------------------------------------------

/**
 * Extract AcroForm fields with page / rect / checkedValue / options.
 * Walks each field's widget annotations to pull out /AP appearance keys.
 */
export async function inspectFormFieldsDetailed(
  absPath: string,
  options: { password?: string } = {},
): Promise<PdfFormFieldsResult['fields']> {
  const buf = await fs.readFile(absPath)
  const pdfDoc = await loadPdfLibDoc(buf, options.password)
  const form = pdfDoc.getForm()
  const pages = pdfDoc.getPages()

  const pageByRef = new Map<string, number>()
  pages.forEach((page, idx) => {
    const ref = page.ref
    pageByRef.set(ref.tag, idx + 1) // 1-based
  })

  const out: PdfFormFieldDetailed[] = []

  for (const field of form.getFields()) {
    const name = field.getName()
    const acroField = field.acroField
    const widgets = acroField.getWidgets()
    const firstWidget = widgets[0]

    // Resolve which page hosts the first widget.
    let page: number | undefined
    let rect: PdfRect | undefined
    if (firstWidget) {
      // Widget's parent ref → page ref — pdf-lib doesn't expose this directly.
      // Cheapest reliable path: iterate pages and look up Annots.
      for (let i = 0; i < pages.length; i++) {
        const annots = pages[i]!.node.lookup(PDFName.of('Annots'))
        if (!(annots instanceof PDFArray)) continue
        for (let j = 0; j < annots.size(); j++) {
          const annotRef = annots.get(j)
          if (!(annotRef instanceof PDFRef)) continue
          const resolved = pdfDoc.context.lookup(annotRef)
          if (resolved === firstWidget.dict) {
            page = i + 1
            break
          }
        }
        if (page) break
      }
      const rectArr = firstWidget.getRectangle()
      rect = [rectArr.x, rectArr.y, rectArr.x + rectArr.width, rectArr.y + rectArr.height]
    }

    // Required / readonly flags from field flags (bit 1 = readonly, bit 2 = required).
    const flags = (acroField.getFlags?.() ?? 0) as number
    const readOnly = (flags & 0b01) !== 0
    const required = (flags & 0b10) !== 0

    if (field instanceof PDFTextField) {
      out.push({
        name,
        type: 'text',
        page,
        rect,
        value: field.getText() ?? undefined,
        readOnly,
        required,
      })
      continue
    }
    if (field instanceof PDFCheckBox) {
      // Checkbox: read /AP dictionary keys to find the "on" state name.
      let checkedValue: string | undefined
      const uncheckedValue = 'Off'
      if (firstWidget) {
        const ap = firstWidget.dict.lookup(PDFName.of('AP'))
        if (ap instanceof PDFDict) {
          const normal = ap.lookup(PDFName.of('N'))
          if (normal instanceof PDFDict) {
            for (const [key] of normal.entries()) {
              const k = key.asString()
              if (k !== '/Off') {
                checkedValue = k.startsWith('/') ? k.slice(1) : k
                break
              }
            }
          }
        }
      }
      out.push({
        name,
        type: 'checkbox',
        page,
        rect,
        value: field.isChecked() ? checkedValue ?? 'Yes' : uncheckedValue,
        checkedValue: checkedValue ?? 'Yes',
        uncheckedValue,
        readOnly,
        required,
      })
      continue
    }
    if (field instanceof PDFRadioGroup) {
      // Each widget corresponds to one radio option. The option's "value" is
      // the /AP /N dict key other than /Off.
      const radioOptions: Array<{ value: string; rect?: PdfRect }> = []
      for (const w of widgets) {
        let value: string | undefined
        const ap = w.dict.lookup(PDFName.of('AP'))
        if (ap instanceof PDFDict) {
          const normal = ap.lookup(PDFName.of('N'))
          if (normal instanceof PDFDict) {
            for (const [key] of normal.entries()) {
              const k = key.asString()
              if (k !== '/Off') {
                value = k.startsWith('/') ? k.slice(1) : k
                break
              }
            }
          }
        }
        if (!value) continue
        const r = w.getRectangle()
        radioOptions.push({
          value,
          rect: [r.x, r.y, r.x + r.width, r.y + r.height] as PdfRect,
        })
      }
      out.push({
        name,
        type: 'radio',
        page,
        rect,
        value: field.getSelected() ?? undefined,
        radioOptions,
        readOnly,
        required,
      })
      continue
    }
    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const rawOptions = field.getOptions()
      // pdf-lib exposes options as `string[]`. For Opt arrays of [value, display]
      // pairs, pdf-lib flattens to display text only. Best-effort.
      const choiceOptions = rawOptions.map((t) => ({ value: t, displayText: t }))
      const selected = field.getSelected()
      out.push({
        name,
        type: field instanceof PDFDropdown ? 'dropdown' : 'option-list',
        page,
        rect,
        value: selected.length > 0 ? (field instanceof PDFDropdown ? selected[0] : selected.join(', ')) : undefined,
        choiceOptions,
        readOnly,
        required,
      })
      continue
    }
    if (field instanceof PDFButton) {
      out.push({ name, type: 'button', page, rect, readOnly, required })
      continue
    }
    out.push({ name, type: 'unknown', page, rect })
  }

  return out
}

// ---------------------------------------------------------------------------
// Action: form-structure (non-AcroForm heuristics via geometry)
// ---------------------------------------------------------------------------

type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
function mulMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

/** Track the current transformation matrix (CTM) through an op list. */
function walkCTM(
  opList: { fnArray: number[]; argsArray: unknown[][] },
  OPS: Record<string, number>,
  handler: (fn: number, args: unknown[], ctm: Matrix) => void,
): void {
  const stack: Matrix[] = [[...IDENTITY] as Matrix]
  // Modern pdf.js collapses sequences of moveTo/lineTo/rectangle/curveTo into
  // a single `constructPath` op whose args are [subOps[], flatCoords[]].
  // We need to unroll these so downstream handlers see them as individual ops.
  const expand = (fn: number, args: unknown[], ctm: Matrix) => {
    if (fn === OPS.constructPath) {
      // pdf.js 5.x constructPath args format (observed):
      //   args[0] = initial op id (e.g. moveTo)
      //   args[1] = [{ "0": flag, "1": x, "2": y, "3": flag, "4": x, "5": y, ... }]
      //            OR a flat number[] in older versions.
      //   args[2] = minMax / bbox
      // flag 0 = moveTo, 1 = lineTo (observed empirically).
      const initialOp = args[0]
      const coordsWrap = args[1]
      // Extract the coord sequence.
      let coords: number[] | undefined
      if (Array.isArray(coordsWrap)) {
        if (coordsWrap.length > 0 && typeof coordsWrap[0] === 'number') {
          coords = coordsWrap as number[]
        } else if (coordsWrap.length > 0 && typeof coordsWrap[0] === 'object') {
          const first = coordsWrap[0] as Record<string, number>
          coords = []
          for (let ki = 0; ; ki++) {
            const v = first[String(ki)]
            if (typeof v !== 'number') break
            coords.push(v)
          }
        }
      }
      if (!coords || coords.length === 0) {
        handler(fn, args, ctm)
        return
      }
      // Triples of (flag, x, y); flag 0 = moveTo, 1 = lineTo.
      // We keep handler semantics: emit synthetic moveTo/lineTo ops.
      const moveToOp = (OPS.moveTo as number | undefined) ?? 0
      const lineToOp = (OPS.lineTo as number | undefined) ?? 0
      const emit = (opId: number, x: number, y: number) => handler(opId, [x, y], ctm)
      const at = (k: number): number => {
        const v = coords![k]
        return typeof v === 'number' ? v : 0
      }
      // The format stores a leading flag PER triple. But when the triple count
      // is not divisible by 3 we fall back to pairs — some variants omit flags.
      if (coords.length % 3 === 0) {
        for (let k = 0; k + 2 < coords.length; k += 3) {
          const flag = at(k)
          if (flag === 0) emit(moveToOp, at(k + 1), at(k + 2))
          else emit(lineToOp, at(k + 1), at(k + 2))
        }
      } else if (coords.length % 2 === 0 && coords.length >= 2) {
        // Pair-only form: first is an implicit move, rest are lines.
        emit(typeof initialOp === 'number' ? initialOp : moveToOp, at(0), at(1))
        for (let k = 2; k + 1 < coords.length; k += 2) {
          emit(lineToOp, at(k), at(k + 1))
        }
      }
    } else {
      handler(fn, args, ctm)
    }
  }
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]!
    const args = opList.argsArray[i] ?? []
    if (fn === OPS.save) {
      stack.push([...stack[stack.length - 1]!] as Matrix)
    } else if (fn === OPS.restore) {
      if (stack.length > 1) stack.pop()
    } else if (fn === OPS.transform) {
      stack[stack.length - 1] = mulMatrix(stack[stack.length - 1]!, args as Matrix)
    } else {
      expand(fn, args, stack[stack.length - 1]!)
    }
  }
}

export async function inspectFormStructure(
  absPath: string,
  options: { pageRange?: string; password?: string } = {},
): Promise<PdfFormStructureResult> {
  const buf = await fs.readFile(absPath)
  const { pdf, OPS } = await openUnpdf(buf, options.password)
  const totalPages = pdf.numPages
  const range = clampRange(
    options.pageRange ? parsePageRange(options.pageRange) : undefined,
    totalPages,
  )

  const labels: PdfFormStructureResult['labels'] = []
  const lines: PdfFormStructureResult['lines'] = []
  const checkboxes: PdfFormStructureResult['checkboxes'] = []
  const rowBoundaries: PdfFormStructureResult['rowBoundaries'] = []

  for (let p = range.start; p <= range.end; p++) {
    const page = await pdf.getPage(p)
    const [tc, opList] = await Promise.all([page.getTextContent(), page.getOperatorList()])

    // Labels
    for (const raw of tc.items) {
      const it = raw as {
        str?: string
        transform?: number[]
        width?: number
        height?: number
      }
      if (typeof it.str !== 'string' || !it.transform) continue
      const trimmed = it.str.trim()
      if (trimmed.length === 0) continue
      const x0 = it.transform[4] ?? 0
      const y0 = it.transform[5] ?? 0
      const w = it.width ?? 0
      const h = it.height ?? (it.transform[3] ?? 0)
      labels.push({
        page: p,
        rect: [x0, y0, x0 + w, y0 + Math.abs(h)],
        text: trimmed,
      })
    }

    // Geometry: horizontal lines + square checkboxes.
    // Approach: track moveTo/lineTo path vertices and closePath rectangles.
    let currentPath: Array<{ x: number; y: number }> = []
    const pageLines: Array<{ x0: number; y0: number; x1: number; y1: number }> = []
    const pageRects: Array<{ x: number; y: number; w: number; h: number }> = []

    walkCTM(opList, OPS, (fn, args, ctm) => {
      if (fn === OPS.moveTo) {
        const [x, y] = args as [number, number]
        const tx = ctm[0] * x + ctm[2] * y + ctm[4]
        const ty = ctm[1] * x + ctm[3] * y + ctm[5]
        currentPath = [{ x: tx, y: ty }]
      } else if (fn === OPS.lineTo) {
        const [x, y] = args as [number, number]
        const tx = ctm[0] * x + ctm[2] * y + ctm[4]
        const ty = ctm[1] * x + ctm[3] * y + ctm[5]
        const last = currentPath[currentPath.length - 1]
        if (last) {
          pageLines.push({ x0: last.x, y0: last.y, x1: tx, y1: ty })
        }
        currentPath.push({ x: tx, y: ty })
      } else if (fn === OPS.rectangle) {
        const [x, y, w, h] = args as [number, number, number, number]
        // Transform the four corners and take the axis-aligned bbox.
        const corners = [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ].map(([cx, cy]) => [
          ctm[0] * cx! + ctm[2] * cy! + ctm[4],
          ctm[1] * cx! + ctm[3] * cy! + ctm[5],
        ])
        const xs = corners.map((c) => c[0]!)
        const ys = corners.map((c) => c[1]!)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        pageRects.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY })
      }
    })

    // Classify:
    //  - horizontal line: |y0-y1| < 1 AND |x1-x0| >= 40
    //  - checkbox: rect where 7 ≤ min(w,h) ≤ 24 AND aspect ~ 1
    const horizLines = pageLines.filter(
      (ln) => Math.abs(ln.y0 - ln.y1) < 1 && Math.abs(ln.x1 - ln.x0) >= 40,
    )
    for (const ln of horizLines) {
      lines.push({
        page: p,
        x0: Math.min(ln.x0, ln.x1),
        y0: ln.y0,
        x1: Math.max(ln.x0, ln.x1),
        y1: ln.y1,
      })
    }
    for (const r of pageRects) {
      const side = Math.min(r.w, r.h)
      const aspect = r.w / Math.max(0.01, r.h)
      if (side >= 7 && side <= 24 && aspect >= 0.8 && aspect <= 1.25) {
        checkboxes.push({
          page: p,
          rect: [r.x, r.y, r.x + r.w, r.y + r.h],
          center: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
        })
      }
    }

    // Row boundaries: unique Y values of horizontal lines, sorted top-down (descending in PDF coords).
    const ys = Array.from(new Set(horizLines.map((ln) => Math.round(ln.y0 * 10) / 10))).sort(
      (a, b) => b - a,
    )
    if (ys.length > 0) rowBoundaries.push({ page: p, ys })
  }

  return { labels, lines, checkboxes, rowBoundaries }
}

// ---------------------------------------------------------------------------
// Action: images
// ---------------------------------------------------------------------------

export async function inspectImages(
  absPath: string,
  options: {
    pageRange?: string
    extract?: boolean
    password?: string
    assetDirAbsPath?: string
    assetRelPrefix?: string
  } = {},
): Promise<PdfImagesResult> {
  const buf = await fs.readFile(absPath)
  const { pdf, OPS, extractImages } = await openUnpdf(buf, options.password)
  const totalPages = pdf.numPages
  const range = clampRange(
    options.pageRange ? parsePageRange(options.pageRange) : undefined,
    totalPages,
  )

  const result: PdfImagesResult['images'] = []
  const doExtract = !!options.extract
  const sharp = doExtract ? (await import('sharp')).default : undefined
  if (doExtract) {
    if (!options.assetDirAbsPath || !options.assetRelPrefix) {
      throw new Error('extract=true requires assetDirAbsPath + assetRelPrefix.')
    }
    await fs.mkdir(options.assetDirAbsPath, { recursive: true })
  }

  for (let p = range.start; p <= range.end; p++) {
    const page = await pdf.getPage(p)
    const opList = await page.getOperatorList()
    const imageOps: Array<{ key: string }> = []
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i]
      if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
        imageOps.push({ key: (opList.argsArray[i] as unknown[])[0] as string })
      }
    }

    if (imageOps.length === 0) continue

    const pageImages = doExtract ? await extractImages(pdf, p) : []
    const byKey = new Map<string, (typeof pageImages)[number]>()
    for (const img of pageImages) byKey.set(img.key, img)

    for (let i = 0; i < imageOps.length; i++) {
      const op = imageOps[i]!
      const data = byKey.get(op.key)
      if (data) {
        let url: string | undefined
        if (doExtract && sharp && options.assetDirAbsPath && options.assetRelPrefix) {
          const fileName = `p${p}-img${i}.png`
          const bytes = Buffer.from(data.data.buffer, data.data.byteOffset, data.data.byteLength)
          const png = await sharp(bytes, {
            raw: { width: data.width, height: data.height, channels: data.channels },
          })
            .png()
            .toBuffer()
          await fs.writeFile(path.join(options.assetDirAbsPath, fileName), png)
          url = `${options.assetRelPrefix}/${fileName}`
        }
        result.push({
          page: p,
          indexInPage: i,
          width: data.width,
          height: data.height,
          url,
        })
      } else {
        // Metadata-only fallback: we at least know the image exists.
        result.push({ page: p, indexInPage: i, width: 0, height: 0 })
      }
    }
  }

  return {
    images: result,
    assetDir: doExtract ? options.assetRelPrefix : undefined,
  }
}

// ---------------------------------------------------------------------------
// Action: annotations
// ---------------------------------------------------------------------------

export async function inspectAnnotations(
  absPath: string,
  options: { pageRange?: string; password?: string } = {},
): Promise<PdfAnnotationsResult> {
  const buf = await fs.readFile(absPath)
  const { pdf } = await openUnpdf(buf, options.password)
  const totalPages = pdf.numPages
  const range = clampRange(
    options.pageRange ? parsePageRange(options.pageRange) : undefined,
    totalPages,
  )

  const out: PdfAnnotation[] = []
  for (let p = range.start; p <= range.end; p++) {
    const page = await pdf.getPage(p)
    const annots = (await page.getAnnotations()) as Array<Record<string, unknown>>
    for (const a of annots) {
      const subtype = String(a.subtype ?? 'Unknown')
      const rectArr = Array.isArray(a.rect) ? (a.rect as number[]) : undefined
      const rect: PdfRect | undefined =
        rectArr && rectArr.length === 4
          ? [rectArr[0]!, rectArr[1]!, rectArr[2]!, rectArr[3]!]
          : undefined
      out.push({
        page: p,
        subtype,
        rect,
        contents: typeof a.contents === 'string' ? a.contents : undefined,
        title: typeof a.title === 'string' ? a.title : undefined,
        quadPoints: Array.isArray(a.quadPoints) ? (a.quadPoints as number[]) : undefined,
        url:
          typeof (a.url as unknown) === 'string'
            ? (a.url as string)
            : typeof ((a as Record<string, unknown>).unsafeUrl as unknown) === 'string'
              ? ((a as Record<string, unknown>).unsafeUrl as string)
              : undefined,
      })
    }
  }
  return { annotations: out }
}

// ---------------------------------------------------------------------------
// Action: render (multi-page PNG rendering)
// ---------------------------------------------------------------------------

export async function renderPdfPages(
  absPath: string,
  pageRange: string,
  options: {
    scale?: number
    password?: string
    assetDirAbsPath: string
    assetRelPrefix: string
  },
): Promise<PdfRenderResult> {
  const { scale = 2, password, assetDirAbsPath, assetRelPrefix } = options
  const range = parsePageRange(pageRange)

  const buf = await fs.readFile(absPath)
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  const sharp = (await import('sharp')).default
  const lib = await PDFiumLibrary.init()
  const loadOptions = password ? { password } : undefined
  const doc = await lib.loadDocument(new Uint8Array(buf), loadOptions as never)
  try {
    const pageCount = doc.getPageCount()
    const effective = { start: Math.max(1, range.start), end: Math.min(pageCount, range.end) }
    await fs.mkdir(assetDirAbsPath, { recursive: true })
    const pages: PdfPageRender[] = []

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
      await fs.writeFile(path.join(assetDirAbsPath, fileName), png)
      pages.push({
        page: p,
        url: `${assetRelPrefix}/${fileName}`,
        width,
        height,
      })
    }
    return { pages, assetDir: assetRelPrefix }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/password/i.test(msg)) throw new PdfEncryptedError()
    throw err
  } finally {
    doc.destroy()
    lib.destroy()
  }
}

// ---------------------------------------------------------------------------
// Action: tables (simple-grid heuristic)
//
// Strategy:
//  1. Walk every page's operator list, capturing horizontal + vertical line
//     segments (both from moveTo/lineTo pairs and from rectangle primitives).
//  2. Cluster y values of horizontal lines and x values of verticals with a
//     small tolerance → produces the grid's row/column boundaries.
//  3. A table = ≥ 2 horizontals × ≥ 2 verticals that share bounds. Each cell
//     is the rectangle between adjacent boundary lines.
//  4. Distribute text items into cells by their midpoint and return rows.
// ---------------------------------------------------------------------------

const TABLE_LINE_TOLERANCE = 1.5

function cluster1D(values: number[], tolerance: number): number[] {
  if (values.length === 0) return []
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = [sorted[0]!]
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i]! - out[out.length - 1]!) > tolerance) {
      out.push(sorted[i]!)
    }
  }
  return out
}

export async function inspectTables(
  absPath: string,
  options: { pageRange?: string; password?: string } = {},
): Promise<PdfTablesResult> {
  const buf = await fs.readFile(absPath)
  const { pdf, OPS } = await openUnpdf(buf, options.password)
  const totalPages = pdf.numPages
  const range = clampRange(
    options.pageRange ? parsePageRange(options.pageRange) : undefined,
    totalPages,
  )

  const tables: PdfTablesResult['tables'] = []

  for (let p = range.start; p <= range.end; p++) {
    const page = await pdf.getPage(p)
    const [tc, opList] = await Promise.all([
      page.getTextContent(),
      page.getOperatorList(),
    ])

    // 1. Collect transformed line segments.
    type Line = { x0: number; y0: number; x1: number; y1: number }
    const lines: Line[] = []
    let currentPath: Array<{ x: number; y: number }> = []

    walkCTM(opList, OPS, (fn, args, ctm) => {
      if (fn === OPS.moveTo) {
        const [x, y] = args as [number, number]
        currentPath = [
          { x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] },
        ]
      } else if (fn === OPS.lineTo) {
        const [x, y] = args as [number, number]
        const tx = ctm[0] * x + ctm[2] * y + ctm[4]
        const ty = ctm[1] * x + ctm[3] * y + ctm[5]
        const last = currentPath[currentPath.length - 1]
        if (last) lines.push({ x0: last.x, y0: last.y, x1: tx, y1: ty })
        currentPath.push({ x: tx, y: ty })
      } else if (fn === OPS.rectangle) {
        // Rectangle → 4 edges.
        const [x, y, w, h] = args as [number, number, number, number]
        const cx = [x, x + w, x + w, x].map(
          (vx, i) => ctm[0] * vx + ctm[2] * [y, y, y + h, y + h][i]! + ctm[4],
        )
        const cy = [y, y, y + h, y + h].map(
          (vy, i) => ctm[1] * [x, x + w, x + w, x][i]! + ctm[3] * vy + ctm[5],
        )
        // Build the 4 sides: (0,1), (1,2), (2,3), (3,0)
        const pushSide = (i: number, j: number) => {
          lines.push({ x0: cx[i]!, y0: cy[i]!, x1: cx[j]!, y1: cy[j]! })
        }
        pushSide(0, 1)
        pushSide(1, 2)
        pushSide(2, 3)
        pushSide(3, 0)
      }
    })

    // 2. Split into horizontal vs vertical.
    const hLines = lines.filter(
      (ln) => Math.abs(ln.y0 - ln.y1) < TABLE_LINE_TOLERANCE && Math.abs(ln.x1 - ln.x0) > 5,
    )
    const vLines = lines.filter(
      (ln) => Math.abs(ln.x0 - ln.x1) < TABLE_LINE_TOLERANCE && Math.abs(ln.y1 - ln.y0) > 5,
    )

    if (hLines.length < 2 || vLines.length < 2) continue

    // 3. Cluster positions to get unique grid boundaries.
    const ys = cluster1D(hLines.map((l) => (l.y0 + l.y1) / 2), TABLE_LINE_TOLERANCE)
    const xs = cluster1D(vLines.map((l) => (l.x0 + l.x1) / 2), TABLE_LINE_TOLERANCE)

    if (ys.length < 2 || xs.length < 2) continue

    // Sort boundaries: xs ascending (left → right), ys descending (top → bottom).
    xs.sort((a, b) => a - b)
    ys.sort((a, b) => b - a)

    const rowCount = ys.length - 1
    const colCount = xs.length - 1

    // 4. Allocate cells grid.
    const cells: string[][] = Array.from({ length: rowCount }, () =>
      Array.from({ length: colCount }, () => ''),
    )

    // 5. Distribute text items to cells by midpoint.
    for (const raw of tc.items) {
      const it = raw as { str?: string; transform?: number[]; width?: number }
      if (typeof it.str !== 'string' || !it.transform) continue
      const str = it.str
      if (str.trim().length === 0) continue
      const x = (it.transform[4] ?? 0) + (it.width ?? 0) / 2
      const y = it.transform[5] ?? 0

      // Find row (ys top-down).
      let r = -1
      for (let i = 0; i < rowCount; i++) {
        if (y <= ys[i]! && y >= ys[i + 1]!) {
          r = i
          break
        }
      }
      // Find col.
      let c = -1
      for (let i = 0; i < colCount; i++) {
        if (x >= xs[i]! && x <= xs[i + 1]!) {
          c = i
          break
        }
      }
      if (r < 0 || c < 0) continue
      cells[r]![c] = cells[r]![c] ? `${cells[r]![c]}${str}` : str
    }

    // 6. Emit table.
    const tableRect: PdfRect = [xs[0]!, ys[ys.length - 1]!, xs[xs.length - 1]!, ys[0]!]
    tables.push({
      page: p,
      rect: tableRect,
      rows: cells,
    })
  }

  return { tables, heuristic: 'simple-grid' }
}

// Re-export the internals pdfTools can re-use (e.g. parsePageRange).
export { parsePageRange as parsePageRangePublic }
export type { PDFPage, PDFName, PDFString, PDFHexString, PDFNumber }
