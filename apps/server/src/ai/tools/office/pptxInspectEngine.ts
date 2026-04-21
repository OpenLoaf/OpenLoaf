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
 * PPTX Inspect Engine — read-only analysis used by the PptxInspect tool.
 *
 * 9 actions:
 *   summary / outline / text / notes / tables / shapes / images / xml / render
 *
 * All functions operate directly on the ZIP/OOXML package. No LibreOffice
 * dependency. The `render` action uses `node-pptx-png` (skia-canvas-based,
 * pure Node).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import {
  listZipEntries,
  readZipEntryBuffer,
  readZipEntryText,
} from './streamingZip'

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class PptxLegacyFormatError extends Error {
  readonly code = 'PPT_LEGACY_FORMAT'
  constructor(filePath: string) {
    super(
      `Legacy binary .ppt format is not supported: ${filePath}. Convert to .pptx first (e.g. via DocConvert or LibreOffice).`,
    )
    this.name = 'PptxLegacyFormatError'
  }
}

// ---------------------------------------------------------------------------
// Shared XML helpers
// ---------------------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

type Relationship = {
  id: string
  type: string
  target: string
}

/** Safely list ZIP entries; returns [] on error. */
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

/**
 * Resolve slide XML entry paths in presentation order.
 * Reads presentation.xml + its rels; falls back to lexicographic sort.
 */
async function resolveSlidePaths(absPath: string, entrySet: Set<string>): Promise<string[]> {
  const presPath = 'ppt/presentation.xml'
  const presRelsPath = 'ppt/_rels/presentation.xml.rels'

  if (!entrySet.has(presPath) || !entrySet.has(presRelsPath)) {
    return fallbackSlideOrder(entrySet)
  }

  let orderedIds: string[] = []
  try {
    const presText = await readZipEntryText(absPath, presPath)
    const presJson = xmlParser.parse(presText)
    const sldIdLst = presJson?.['p:presentation']?.['p:sldIdLst']
    const rawIds = ensureArray(sldIdLst?.['p:sldId'])
    orderedIds = rawIds
      .map((item: unknown) => {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          const id = obj['@_r:id'] ?? obj['@_R:id']
          return typeof id === 'string' ? id : ''
        }
        return ''
      })
      .filter((id: string) => id.length > 0)
  } catch {
    return fallbackSlideOrder(entrySet)
  }

  if (orderedIds.length === 0) return fallbackSlideOrder(entrySet)

  let rels: Relationship[]
  try {
    rels = await parseRelationships(absPath, presRelsPath)
  } catch {
    return fallbackSlideOrder(entrySet)
  }

  const relsById = new Map<string, Relationship>()
  for (const rel of rels) relsById.set(rel.id, rel)

  const paths: string[] = []
  for (const id of orderedIds) {
    const rel = relsById.get(id)
    if (!rel || !/\/slide$/.test(rel.type)) continue
    const resolved = resolveRelTarget(presPath, rel.target)
    if (entrySet.has(resolved)) paths.push(resolved)
  }

  return paths.length > 0 ? paths : fallbackSlideOrder(entrySet)
}

function fallbackSlideOrder(entrySet: Set<string>): string[] {
  return [...entrySet]
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort((a, b) => {
      const na = Number.parseInt(a.match(/slide(\d+)/)?.[1] ?? '0', 10)
      const nb = Number.parseInt(b.match(/slide(\d+)/)?.[1] ?? '0', 10)
      return na - nb
    })
}

async function parseRelationships(absPath: string, relsPath: string): Promise<Relationship[]> {
  const text = await readZipEntryText(absPath, relsPath)
  const json = xmlParser.parse(text)
  const rawList = ensureArray(json?.Relationships?.Relationship)
  const result: Relationship[] = []
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const id = typeof obj['@_Id'] === 'string' ? (obj['@_Id'] as string) : ''
    const type = typeof obj['@_Type'] === 'string' ? (obj['@_Type'] as string) : ''
    const target = typeof obj['@_Target'] === 'string' ? (obj['@_Target'] as string) : ''
    if (id && target) result.push({ id, type, target })
  }
  return result
}

function slideRelsEntryPath(slideEntry: string): string {
  const dir = path.posix.dirname(slideEntry)
  const base = path.posix.basename(slideEntry)
  return `${dir}/_rels/${base}.rels`
}

function resolveRelTarget(sourcePart: string, target: string): string {
  if (target.startsWith('/')) return target.replace(/^\/+/, '')
  const baseDir = path.posix.dirname(sourcePart)
  return path.posix.join(baseDir, target).replace(/^\/+/, '')
}

/**
 * Recursively walk a parsed OOXML JSON tree and collect every `<a:t>` text node.
 */
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
      pushTextValue(value, out)
      continue
    }
    collectTextRuns(value, out)
  }
}

function pushTextValue(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return
  if (typeof value === 'string') { out.push(value); return }
  if (typeof value === 'number') { out.push(String(value)); return }
  if (Array.isArray(value)) {
    for (const item of value) pushTextValue(item, out)
    return
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const text = obj['#text']
    if (typeof text === 'string') out.push(text)
    else if (typeof text === 'number') out.push(String(text))
  }
}

function ensureArray(val: unknown): unknown[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

/** Parse a slide range/list string like "1,3,5" or "2-8" → sorted 1-based numbers. */
function parseSlideNumbers(spec: string | undefined, total: number): number[] {
  if (!spec) return Array.from({ length: total }, (_, i) => i + 1)
  const nums = new Set<number>()
  for (const part of spec.split(',')) {
    const trimmed = part.trim()
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      const s = Number.parseInt(rangeMatch[1]!, 10)
      const e = Number.parseInt(rangeMatch[2]!, 10)
      for (let i = s; i <= e; i++) {
        if (i >= 1 && i <= total) nums.add(i)
      }
    } else {
      const n = Number.parseInt(trimmed, 10)
      if (!Number.isNaN(n) && n >= 1 && n <= total) nums.add(n)
    }
  }
  return [...nums].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// Action: summary
// ---------------------------------------------------------------------------

export type PptxSummary = {
  slideCount: number
  layoutCount: number
  masterCount: number
  hasNotes: boolean
  hasCharts: boolean
  hasSmartArt: boolean
  creator?: string
  lastModifiedBy?: string
  createdAt?: string
  modifiedAt?: string
  fileSize: number
  coverage: 'full' | 'partial'
  suggestedNextTool?: { tool: string; action: string; reason?: string }
}

export async function inspectSummary(absPath: string): Promise<PptxSummary> {
  const entries = await safeListEntries(absPath)
  const entrySet = new Set(entries)

  const slideCount = entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e)).length
  const layoutCount = entries.filter((e) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(e)).length
  const masterCount = entries.filter((e) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(e)).length
  const hasNotes = entries.some((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))

  // Check for charts and SmartArt by entry path
  const hasCharts = entries.some((e) => /^ppt\/charts\/chart\d+\.xml$/.test(e))
  const hasSmartArt = entries.some((e) => e.includes('diagrams/'))

  // Metadata from docProps/core.xml
  let creator: string | undefined
  let lastModifiedBy: string | undefined
  let createdAt: string | undefined
  let modifiedAt: string | undefined
  if (entrySet.has('docProps/core.xml')) {
    const coreXml = await readTextIfExists(absPath, 'docProps/core.xml') ?? ''
    const pickTag = (tag: string): string | undefined => {
      const m = coreXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
      return m ? m[1]?.trim() : undefined
    }
    creator = pickTag('dc:creator')
    lastModifiedBy = pickTag('cp:lastModifiedBy')
    createdAt = pickTag('dcterms:created')
    modifiedAt = pickTag('dcterms:modified')
  }

  const stat = await fs.stat(absPath)
  const fileSize = stat.size

  let suggestedNextTool: PptxSummary['suggestedNextTool']
  if (slideCount > 0) {
    suggestedNextTool = {
      tool: 'PptxInspect',
      action: 'outline',
      reason: 'Get per-slide titles to plan which slides to inspect in depth.',
    }
  }

  return {
    slideCount,
    layoutCount,
    masterCount,
    hasNotes,
    hasCharts,
    hasSmartArt,
    creator,
    lastModifiedBy,
    createdAt,
    modifiedAt,
    fileSize,
    coverage: 'full',
    suggestedNextTool,
  }
}

// ---------------------------------------------------------------------------
// Action: outline
// ---------------------------------------------------------------------------

export type PptxOutlineItem = {
  slideNumber: number
  title: string
}

export async function inspectOutline(absPath: string): Promise<PptxOutlineItem[]> {
  const entries = await safeListEntries(absPath)
  const entrySet = new Set(entries)
  const slidePaths = await resolveSlidePaths(absPath, entrySet)

  const outline: PptxOutlineItem[] = []
  for (let i = 0; i < slidePaths.length; i++) {
    const slideEntry = slidePaths[i]!
    const slideXmlText = await readTextIfExists(absPath, slideEntry) ?? ''
    const runs: string[] = []
    const slideJson = xmlParser.parse(slideXmlText)
    collectTextRuns(slideJson, runs)
    const nonEmpty = runs.map((t) => t.trim()).filter((t) => t.length > 0)
    // Heuristic title: first short-ish run
    const title = nonEmpty[0] ?? ''
    outline.push({ slideNumber: i + 1, title })
  }

  return outline
}

// ---------------------------------------------------------------------------
// Action: text
// ---------------------------------------------------------------------------

export type PptxTextItem = {
  text: string
  bbox?: { x: number; y: number; cx: number; cy: number }
}

export type PptxSlideText = {
  slideNumber: number
  text: string
  items?: PptxTextItem[]
}

export async function inspectText(
  absPath: string,
  opts: { slideNumbers?: string; withCoords?: boolean } = {},
): Promise<{ slides: PptxSlideText[]; coverage: string }> {
  const entries = await safeListEntries(absPath)
  const entrySet = new Set(entries)
  const slidePaths = await resolveSlidePaths(absPath, entrySet)
  const total = slidePaths.length

  const targetSlides = parseSlideNumbers(opts.slideNumbers, total)

  const slides: PptxSlideText[] = []
  for (const slideNumber of targetSlides) {
    const slideEntry = slidePaths[slideNumber - 1]
    if (!slideEntry) continue
    const slideXmlText = await readTextIfExists(absPath, slideEntry) ?? ''

    if (opts.withCoords) {
      // Parse shapes and collect text + bbox from sp:sp/p:sp elements
      const items: PptxTextItem[] = []
      const spRe = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g
      let spMatch: RegExpExecArray | null
      while ((spMatch = spRe.exec(slideXmlText)) !== null) {
        const spBody = spMatch[1] ?? ''
        // Extract bbox from spPr > a:xfrm
        let bbox: PptxTextItem['bbox'] | undefined
        const xfrmMatch = spBody.match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/)
        const xfrmInner = xfrmMatch?.[1]
        if (xfrmInner) {
          const offMatch = xfrmInner.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/)
          const extMatch = xfrmInner.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/)
          if (offMatch && extMatch) {
            bbox = {
              x: Number.parseInt(offMatch[1]!, 10),
              y: Number.parseInt(offMatch[2]!, 10),
              cx: Number.parseInt(extMatch[1]!, 10),
              cy: Number.parseInt(extMatch[2]!, 10),
            }
          }
        }
        const runs: string[] = []
        collectTextRuns(xmlParser.parse(spBody), runs)
        const text = runs.map((t) => t.trim()).filter((t) => t.length > 0).join(' ')
        if (text) items.push({ text, ...(bbox ? { bbox } : {}) })
      }
      const text = items.map((it) => it.text).join('\n')
      slides.push({ slideNumber, text, items })
    } else {
      const runs: string[] = []
      collectTextRuns(xmlParser.parse(slideXmlText), runs)
      const text = runs.map((t) => t.trim()).filter((t) => t.length > 0).join('\n')
      slides.push({ slideNumber, text })
    }
  }

  const coverage =
    targetSlides.length === total
      ? 'full'
      : `slides ${targetSlides[0]}–${targetSlides[targetSlides.length - 1]} of ${total}`

  return { slides, coverage }
}

// ---------------------------------------------------------------------------
// Action: notes
// ---------------------------------------------------------------------------

export type PptxNote = {
  slideNumber: number
  text: string
}

export async function inspectNotes(
  absPath: string,
  opts: { slideNumbers?: string } = {},
): Promise<PptxNote[]> {
  const entries = await safeListEntries(absPath)
  const entrySet = new Set(entries)
  const slidePaths = await resolveSlidePaths(absPath, entrySet)
  const total = slidePaths.length
  const targetSlides = parseSlideNumbers(opts.slideNumbers, total)

  const notes: PptxNote[] = []
  for (const slideNumber of targetSlides) {
    const slideEntry = slidePaths[slideNumber - 1]
    if (!slideEntry) continue

    // The notes slide is linked via the slide's rels file
    const slideRelsPath = slideRelsEntryPath(slideEntry)
    if (!entrySet.has(slideRelsPath)) continue

    const rels = await parseRelationships(absPath, slideRelsPath)
    const notesRel = rels.find((r) => /\/notesSlide$/.test(r.type))
    if (!notesRel) continue

    const notesEntry = resolveRelTarget(slideEntry, notesRel.target)
    if (!entrySet.has(notesEntry)) continue

    const notesXml = await readTextIfExists(absPath, notesEntry) ?? ''
    const runs: string[] = []
    collectTextRuns(xmlParser.parse(notesXml), runs)
    const text = runs.map((t) => t.trim()).filter((t) => t.length > 0).join('\n')
    if (text) notes.push({ slideNumber, text })
  }

  return notes
}

// ---------------------------------------------------------------------------
// Action: tables
// ---------------------------------------------------------------------------

export type PptxTable = {
  slideNumber: number
  rows: string[][]
}

export async function inspectTables(
  absPath: string,
  opts: { slideNumbers?: string } = {},
): Promise<{ tables: PptxTable[]; coverage: string }> {
  const entries = await safeListEntries(absPath)
  const entrySet = new Set(entries)
  const slidePaths = await resolveSlidePaths(absPath, entrySet)
  const total = slidePaths.length
  const targetSlides = parseSlideNumbers(opts.slideNumbers, total)

  const tables: PptxTable[] = []
  for (const slideNumber of targetSlides) {
    const slideEntry = slidePaths[slideNumber - 1]
    if (!slideEntry) continue
    const slideXml = await readTextIfExists(absPath, slideEntry) ?? ''

    // Extract a:tbl elements
    const tblRe = /<a:tbl\b[^>]*>([\s\S]*?)<\/a:tbl>/g
    let tblMatch: RegExpExecArray | null
    while ((tblMatch = tblRe.exec(slideXml)) !== null) {
      const tblBody = tblMatch[1] ?? ''
      const rows: string[][] = []
      const trRe = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g
      let trMatch: RegExpExecArray | null
      while ((trMatch = trRe.exec(tblBody)) !== null) {
        const trBody = trMatch[1] ?? ''
        const cells: string[] = []
        const tcRe = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g
        let tcMatch: RegExpExecArray | null
        while ((tcMatch = tcRe.exec(trBody)) !== null) {
          const tcBody = tcMatch[1] ?? ''
          const runs: string[] = []
          collectTextRuns(xmlParser.parse(tcBody), runs)
          cells.push(runs.map((t) => t.trim()).join(' '))
        }
        if (cells.length > 0) rows.push(cells)
      }
      if (rows.length > 0) tables.push({ slideNumber, rows })
    }
  }

  const coverage =
    targetSlides.length === total
      ? 'full'
      : `slides ${targetSlides[0]}–${targetSlides[targetSlides.length - 1]} of ${total}`

  return { tables, coverage }
}

// ---------------------------------------------------------------------------
// Action: shapes
// ---------------------------------------------------------------------------

export type PptxShape = {
  type: string
  name: string
  text?: string
  bbox?: { x: number; y: number; cx: number; cy: number }
}

export type PptxSlideShapes = {
  slideNumber: number
  shapes: PptxShape[]
}

export async function inspectShapes(
  absPath: string,
  opts: { slideNumbers?: string; withCoords?: boolean } = {},
): Promise<PptxSlideShapes[]> {
  const entries = await safeListEntries(absPath)
  const entrySet = new Set(entries)
  const slidePaths = await resolveSlidePaths(absPath, entrySet)
  const total = slidePaths.length
  const targetSlides = parseSlideNumbers(opts.slideNumbers, total)

  const result: PptxSlideShapes[] = []
  for (const slideNumber of targetSlides) {
    const slideEntry = slidePaths[slideNumber - 1]
    if (!slideEntry) continue
    const slideXml = await readTextIfExists(absPath, slideEntry) ?? ''

    const shapes: PptxShape[] = []

    // Shapes: p:sp (text shapes), p:pic (pictures), p:graphicFrame (charts/tables/diagrams)
    const extractShapes = (tagName: string, shapeType: string): void => {
      const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(slideXml)) !== null) {
        const body = m[1] ?? ''
        // Name from nvSpPr / nvPicPr / nvGraphicFramePr
        const nameMatch = body.match(/<p:c?(?:Nv|nv)(?:SpPr|PicPr|GraphicFramePr)[^>]*>[\s\S]*?<p:cNvPr[^>]*name="([^"]*)"/)
          ?? body.match(/name="([^"]*)"/)
        const name = nameMatch ? nameMatch[1]! : ''

        // Text from a:t runs
        const runs: string[] = []
        collectTextRuns(xmlParser.parse(body), runs)
        const text = runs.map((t) => t.trim()).filter((t) => t.length > 0).join(' ')

        // BBox from a:xfrm
        let bbox: PptxShape['bbox'] | undefined
        if (opts.withCoords !== false) {
          const xfrmMatch = body.match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/)
          const xfrmInner = xfrmMatch?.[1]
          if (xfrmInner) {
            const offMatch = xfrmInner.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/)
            const extMatch = xfrmInner.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/)
            if (offMatch && extMatch) {
              bbox = {
                x: Number.parseInt(offMatch[1]!, 10),
                y: Number.parseInt(offMatch[2]!, 10),
                cx: Number.parseInt(extMatch[1]!, 10),
                cy: Number.parseInt(extMatch[2]!, 10),
              }
            }
          }
        }

        const shape: PptxShape = { type: shapeType, name }
        if (text) shape.text = text
        if (bbox) shape.bbox = bbox
        shapes.push(shape)
      }
    }

    extractShapes('p:sp', 'shape')
    extractShapes('p:pic', 'picture')
    extractShapes('p:graphicFrame', 'graphicFrame')

    result.push({ slideNumber, shapes })
  }

  return result
}

// ---------------------------------------------------------------------------
// Action: images
// ---------------------------------------------------------------------------

export type PptxImage = {
  slideNumber: number
  path: string
  width: number
  height: number
  format: string
}

export async function inspectImages(
  absPath: string,
  opts: {
    slideNumbers?: string
    extractImages?: boolean
    assetDirAbsPath?: string
    assetRelPrefix?: string
  } = {},
): Promise<PptxImage[]> {
  const entries = await safeListEntries(absPath)
  const entrySet = new Set(entries)
  const slidePaths = await resolveSlidePaths(absPath, entrySet)
  const total = slidePaths.length
  const targetSlides = parseSlideNumbers(opts.slideNumbers, total)

  const doExtract = !!opts.extractImages
  if (doExtract) {
    if (!opts.assetDirAbsPath || !opts.assetRelPrefix) {
      throw new Error('extractImages=true requires assetDirAbsPath + assetRelPrefix.')
    }
    await fs.mkdir(opts.assetDirAbsPath, { recursive: true })
  }

  const sharp = doExtract ? (await import('sharp')).default : undefined
  const result: PptxImage[] = []

  for (const slideNumber of targetSlides) {
    const slideEntry = slidePaths[slideNumber - 1]
    if (!slideEntry) continue

    const slideRelsPath = slideRelsEntryPath(slideEntry)
    if (!entrySet.has(slideRelsPath)) continue

    const rels = await parseRelationships(absPath, slideRelsPath)
    const imageRels = rels.filter((r) => /\/image$/.test(r.type))

    let k = 0
    for (const rel of imageRels) {
      const mediaEntry = resolveRelTarget(slideEntry, rel.target)
      if (!entrySet.has(mediaEntry)) continue

      let mediaBuf: Buffer
      try {
        mediaBuf = await readZipEntryBuffer(absPath, mediaEntry)
      } catch {
        continue
      }

      const srcExt = path.extname(mediaEntry).toLowerCase() || '.png'
      const format = srcExt.replace('.', '')
      const fileBase = `slide${slideNumber}-img${k}${srcExt}`
      k++

      let width = 0
      let height = 0
      let outPath = mediaEntry

      if (sharp) {
        try {
          const meta = await sharp(mediaBuf).metadata()
          width = meta.width ?? 0
          height = meta.height ?? 0
        } catch {
          // EMF/WMF etc — leave dims at 0
        }
        if (doExtract && opts.assetDirAbsPath && opts.assetRelPrefix) {
          const absOut = path.join(opts.assetDirAbsPath, fileBase)
          await fs.writeFile(absOut, mediaBuf)
          outPath = `${opts.assetRelPrefix}/${fileBase}`
        }
      } else {
        // Metadata-only: still try sharp in best-effort mode
        try {
          const sh = (await import('sharp')).default
          const meta = await sh(mediaBuf).metadata()
          width = meta.width ?? 0
          height = meta.height ?? 0
        } catch {
          // ignore
        }
      }

      result.push({ slideNumber, path: outPath, width, height, format })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Action: xml
// ---------------------------------------------------------------------------

export async function inspectXml(
  absPath: string,
  opts: { partName?: string } = {},
): Promise<{ partName: string; xml?: string; parts?: string[] }> {
  if (!opts.partName) {
    // List all parts
    const entries = await safeListEntries(absPath)
    return { partName: '(all parts)', parts: entries }
  }

  const partName = opts.partName
  const xml = await readZipEntryText(absPath, partName)
  return { partName, xml }
}

// ---------------------------------------------------------------------------
// Action: render — node-pptx-png (skia-canvas based, no LibreOffice)
// ---------------------------------------------------------------------------

export type PptxRenderPage = {
  slideNumber: number
  imagePath: string
  width: number
  height: number
}

export async function renderPptxSlides(
  absPath: string,
  opts: {
    slideNumbers?: string
    scale?: number
    assetDirAbsPath: string
    assetRelPrefix: string
  },
): Promise<PptxRenderPage[]> {
  const { PptxImageRenderer } = await import('node-pptx-png-v2')

  const pptxBuf = await fs.readFile(absPath)

  // Determine target width: default 1280px * scale
  const scale = opts.scale ?? 1
  const targetWidth = Math.round(1280 * scale)

  const renderer = new PptxImageRenderer({ logLevel: 'warn' })

  // v2 的 renderer.getSlideCount() 内部漏写 await，finally 里 close() 会在
  // promise 解析前清空 zip，导致 "No PPTX file is open"。改用 renderPresentation
  // 一次性拿所有页，再按 slideNumbers 过滤。
  const all = await renderer.renderPresentation(pptxBuf, {
    width: targetWidth,
    format: 'png',
    logLevel: 'warn',
  })

  const totalSlides = all.totalSlides
  const targetSet = new Set(parseSlideNumbers(opts.slideNumbers, totalSlides))

  await fs.mkdir(opts.assetDirAbsPath, { recursive: true })

  const pages: PptxRenderPage[] = []
  for (const slide of all.slides) {
    if (!targetSet.has(slide.slideNumber)) continue
    if (!slide.success || !slide.imageData) continue

    const fileName = `slide${slide.slideNumber}-scale${scale}.png`
    const absOut = path.join(opts.assetDirAbsPath, fileName)
    await fs.writeFile(absOut, slide.imageData)

    pages.push({
      slideNumber: slide.slideNumber,
      imagePath: `${opts.assetRelPrefix}/${fileName}`,
      width: slide.width,
      height: slide.height,
    })
  }

  return pages
}
