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
 * PPTX content extractor — walks the ZIP package manually, parses each slide's
 * OOXML text runs, and writes embedded media to the session asset directory.
 * Emits a FileContentResult consumed by the unified Read tool.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import {
  listZipEntries,
  readZipEntryBuffer,
  readZipEntryText,
} from './streamingZip'
import type { FileContentImage, FileContentResult } from './types'

const MAX_CONTENT_LENGTH = 400_000

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

type Relationship = {
  id: string
  type: string
  target: string
}

/**
 * Extract PPTX text + images as a unified `FileContentResult`.
 *
 * @param absPath            Absolute path to the .pptx file.
 * @param assetDirAbsPath    Absolute target directory for extracted media.
 *                           Created if missing.
 * @param assetRelPrefix     Relative prefix used in markdown image refs
 *                           (e.g. "deck_asset").
 */
export async function extractPptxContent(
  absPath: string,
  assetDirAbsPath: string,
  assetRelPrefix: string,
): Promise<FileContentResult> {
  const fileName = path.basename(absPath)
  const entries = await listZipEntries(absPath)
  const entrySet = new Set(entries)

  // 1. Resolve slide order from presentation.xml + its rels.
  const slidePaths = await resolveSlidePaths(absPath, entrySet)

  await fs.mkdir(assetDirAbsPath, { recursive: true })

  const sharp = (await import('sharp')).default

  const contentParts: string[] = []
  const allImages: FileContentImage[] = []
  let monotonicImageIndex = 0
  let totalTextFound = 0
  let totalImagesFound = 0

  for (let i = 0; i < slidePaths.length; i++) {
    const slideNumber = i + 1 // 1-based for user-facing labels
    const slideEntry = slidePaths[i]!

    // 2a. Parse slide XML and collect all <a:t> text runs in document order.
    const slideXmlText = await readZipEntryText(absPath, slideEntry)
    const slideJson = xmlParser.parse(slideXmlText)
    const textRuns: string[] = []
    collectTextRuns(slideJson, textRuns)
    const nonEmptyRuns = textRuns.map((t) => t.trim()).filter((t) => t.length > 0)
    if (nonEmptyRuns.length > 0) totalTextFound++

    // 2b. Resolve this slide's rels → image targets.
    const slideRelsPath = slideRelsEntryPath(slideEntry)
    const slideRels = entrySet.has(slideRelsPath)
      ? await parseRelationships(absPath, slideRelsPath)
      : []
    const imageRels = slideRels.filter((rel) => /\/image$/.test(rel.type))

    // 3. For each image rel, read the media entry, persist, collect metadata.
    type SlideImageEntry = { index: number; url: string; width: number; height: number }
    const slideImageEntries: SlideImageEntry[] = []
    let kPerSlide = 0
    for (const rel of imageRels) {
      const mediaEntry = resolveRelTarget(slideEntry, rel.target)
      if (!entrySet.has(mediaEntry)) continue
      let mediaBuf: Buffer
      try {
        mediaBuf = await readZipEntryBuffer(absPath, mediaEntry)
      } catch {
        continue
      }
      // Use the original file extension; default to .png if missing.
      const srcExt = path.extname(mediaEntry).toLowerCase() || '.png'
      const k = kPerSlide++
      const fileBase = `slide${slideNumber}-img${k}${srcExt}`
      const outPath = path.join(assetDirAbsPath, fileBase)
      await fs.writeFile(outPath, mediaBuf)

      let width = 0
      let height = 0
      try {
        const meta = await sharp(mediaBuf).metadata()
        width = meta.width ?? 0
        height = meta.height ?? 0
      } catch {
        // Unsupported media format (e.g. EMF/WMF) — leave dims at 0.
      }

      const url = `${assetRelPrefix}/${fileBase}`
      const idx = monotonicImageIndex++
      slideImageEntries.push({ index: idx, url, width, height })
      allImages.push({
        index: idx,
        url,
        width,
        height,
        slide: slideNumber,
      })
    }
    if (slideImageEntries.length > 0) totalImagesFound++

    // 4. Assemble slide markdown: heading + optional title + body + images.
    const parts: string[] = [`## Slide ${slideNumber}`]
    let bodyRuns = nonEmptyRuns
    // Heuristic "title": first run if it's short-ish and not the whole content.
    const firstRun = nonEmptyRuns[0]
    if (firstRun && firstRun.length <= 120 && nonEmptyRuns.length > 1) {
      parts.push('')
      parts.push(`### ${firstRun}`)
      bodyRuns = nonEmptyRuns.slice(1)
    }
    if (bodyRuns.length > 0) {
      parts.push('')
      parts.push(bodyRuns.join('\n'))
    }
    if (slideImageEntries.length > 0) {
      parts.push('')
      for (const img of slideImageEntries) {
        parts.push(`![slide-${slideNumber}-image-${img.index}](${img.url})`)
      }
    }
    contentParts.push(parts.join('\n'))
  }

  let content = contentParts.join('\n\n')
  const truncated = content.length > MAX_CONTENT_LENGTH
  if (truncated) content = content.slice(0, MAX_CONTENT_LENGTH)

  // 5. Fallback: purely decorative / unparseable deck.
  if (totalTextFound === 0 && totalImagesFound === 0) {
    const fallbackName = 'original.pptx'
    const fallbackAbs = path.join(assetDirAbsPath, fallbackName)
    try {
      await fs.copyFile(absPath, fallbackAbs)
    } catch {
      // Best-effort fallback; still return the empty result below.
    }
    return {
      type: 'pptx',
      fileName,
      content: '',
      meta: {
        slideCount: slidePaths.length,
        imageCount: 0,
      },
      images: [],
      assetDir: assetRelPrefix,
      fallbackPath: `${assetRelPrefix}/${fallbackName}`,
    }
  }

  return {
    type: 'pptx',
    fileName,
    content,
    meta: {
      slideCount: slidePaths.length,
      imageCount: allImages.length,
    },
    images: allImages,
    assetDir: assetRelPrefix,
    truncated: truncated || undefined,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve slide XML entry paths in presentation order.
 *
 * presentation.xml has `<p:sldIdLst><p:sldId r:id="rIdN"/></p:sldIdLst>`.
 * Each rIdN maps to a slides/slideN.xml target via presentation.xml.rels.
 * We fall back to lexicographic sort if anything is missing.
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
      .filter((id) => id.length > 0)
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

/** Lexicographic slideN.xml fallback when presentation.xml lookup fails. */
function fallbackSlideOrder(entrySet: Set<string>): string[] {
  return [...entrySet]
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort((a, b) => {
      const na = Number.parseInt(a.match(/slide(\d+)/)?.[1] ?? '0', 10)
      const nb = Number.parseInt(b.match(/slide(\d+)/)?.[1] ?? '0', 10)
      return na - nb
    })
}

/** Parse a `_rels/*.rels` file into a flat array of Relationship records. */
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

/**
 * Derive `ppt/slides/_rels/slideN.xml.rels` from `ppt/slides/slideN.xml`.
 * Works by splitting the path and inserting `_rels/` before the filename.
 */
function slideRelsEntryPath(slideEntry: string): string {
  const dir = path.posix.dirname(slideEntry)
  const base = path.posix.basename(slideEntry)
  return `${dir}/_rels/${base}.rels`
}

/**
 * Resolve a Relationship `Target` (potentially containing `..`) against the
 * directory of the part that owns the rels file.
 *
 * The rels file for `ppt/slides/slideN.xml` lives at
 * `ppt/slides/_rels/slideN.xml.rels`, but relative targets inside it resolve
 * against the OWNING part's directory (`ppt/slides/`) — NOT the rels file.
 * That's why we pass the source part path here rather than the rels path.
 */
function resolveRelTarget(sourcePart: string, target: string): string {
  if (target.startsWith('/')) {
    // Absolute package path — strip leading slash.
    return target.replace(/^\/+/, '')
  }
  const baseDir = path.posix.dirname(sourcePart)
  const joined = path.posix.join(baseDir, target)
  // path.posix.join already collapses `..` segments.
  return joined.replace(/^\/+/, '')
}

/**
 * Recursively walk a parsed OOXML JSON tree and collect every `<a:t>` text
 * node value, in document order. Handles both single-object and array shapes
 * (fast-xml-parser collapses single children into non-arrays unless forced).
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
    if (key.startsWith('@_')) continue // skip attributes
    if (key === 'a:t') {
      pushTextValue(value, out)
      continue
    }
    collectTextRuns(value, out)
  }
}

/** Push a single `<a:t>` node's text into the output accumulator. */
function pushTextValue(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (typeof value === 'number') {
    out.push(String(value))
    return
  }
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
