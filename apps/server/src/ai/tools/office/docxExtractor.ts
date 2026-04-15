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
 * DOCX Extractor — 将 DOCX 转为带内联图片的 Markdown，供统一 Read 工具消费。
 *
 * 管道：
 *   1. mammoth.convertToHtml + imgElement 拦截器：把每张图写入 assetDir，返回
 *      `{ src, alt }`，让 mammoth 在 HTML 里直接占位。
 *   2. turndown 把 HTML 转成 Markdown（ATX 标题 + fenced 代码块）。
 *   3. sharp 读图片宽高；失败则 fallback 到 0/0。
 *   4. 无正文无图片时，把原文件拷到 assetDir/original.docx 作为 fallback。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FileContentImage, FileContentResult } from './types'

/**
 * Extract DOCX content into Markdown with inline image references.
 *
 * @param absPath          Absolute path to the source .docx file.
 * @param assetDirAbsPath  Absolute path of the asset output dir (created if missing).
 * @param assetRelPrefix   Relative prefix used in markdown image refs
 *                         (e.g. "report_asset" → `![](report_asset/img-0.png)`).
 */
export async function extractDocxContent(
  absPath: string,
  assetDirAbsPath: string,
  assetRelPrefix: string,
): Promise<FileContentResult> {
  await fs.mkdir(assetDirAbsPath, { recursive: true })

  const mammoth = (await import('mammoth')).default
  const turndownMod = await import('turndown')
  const TurndownService = (turndownMod as unknown as { default?: unknown }).default ?? turndownMod
  const sharp = (await import('sharp')).default

  const images: FileContentImage[] = []
  let imageCounter = 0

  const convertImage = mammoth.images.imgElement(async (image) => {
    const index = imageCounter++
    const buffer = await image.read()
    const contentType = image.contentType || ''
    const ext = detectImageExtension(buffer, contentType)
    const fileName = `img-${index}.${ext}`
    const outPath = path.join(assetDirAbsPath, fileName)
    await fs.writeFile(outPath, buffer)

    let width = 0
    let height = 0
    try {
      const meta = await sharp(buffer).metadata()
      width = meta.width ?? 0
      height = meta.height ?? 0
    } catch {
      // sharp can't decode (e.g. EMF/WMF vector formats) — keep 0/0.
    }

    const url = `${assetRelPrefix}/${fileName}`
    images.push({ index, url, width, height })
    return { src: url, alt: `image-${index}` }
  })

  const htmlResult = await mammoth.convertToHtml(
    { path: absPath },
    { convertImage },
  )
  const html = htmlResult.value

  // biome-ignore lint/suspicious/noExplicitAny: turndown ctor typed via runtime default
  const td = new (TurndownService as any)({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })
  const markdown: string = td.turndown(html)

  // Paragraph heuristic: count non-empty blocks separated by blank lines.
  const paragraphCount = markdown
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length

  const result: FileContentResult = {
    type: 'docx',
    fileName: path.basename(absPath),
    content: markdown,
    meta: {
      paragraphCount,
      imageCount: images.length,
    },
    images,
    assetDir: assetRelPrefix,
  }

  // Fallback for corrupt / image-only / password-protected / otherwise empty docs.
  if (markdown.trim().length === 0 && images.length === 0) {
    const fallbackName = 'original.docx'
    const fallbackAbs = path.join(assetDirAbsPath, fallbackName)
    await fs.copyFile(absPath, fallbackAbs)
    result.content = ''
    result.fallbackPath = `${assetRelPrefix}/${fallbackName}`
  }

  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect image extension from buffer magic bytes, falling back to content-type,
 * and finally to `bin` if both are inconclusive.
 */
function detectImageExtension(buffer: Buffer, contentType: string): string {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png'
  }
  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpg'
  }
  // GIF: 47 49 46 38 (GIF8)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'gif'
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp'
  }
  // BMP: 42 4D
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'bmp'
  }
  // TIFF: 49 49 2A 00 or 4D 4D 00 2A
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a))
  ) {
    return 'tiff'
  }
  // SVG: starts with "<?xml" or "<svg"
  if (buffer.length >= 5) {
    const head = buffer.subarray(0, 5).toString('utf8').toLowerCase()
    if (head.startsWith('<?xml') || head.startsWith('<svg')) {
      return 'svg'
    }
  }

  // Fall back to content-type.
  const ct = contentType.toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('bmp')) return 'bmp'
  if (ct.includes('tiff')) return 'tiff'
  if (ct.includes('svg')) return 'svg'
  if (ct.includes('emf')) return 'emf'
  if (ct.includes('wmf')) return 'wmf'

  return 'bin'
}
