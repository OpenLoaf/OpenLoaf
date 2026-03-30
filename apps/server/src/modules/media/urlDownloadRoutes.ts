/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createHash } from 'node:crypto'
import type { Hono } from 'hono'
import { resolveScopedPath } from '@openloaf/api'
import { resolveBoardDirFromDb } from '@openloaf/api/common/boardPaths'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { logger } from '@/common/logger'

const BOARD_ASSETS_DIR = 'asset'

/** 已知图片扩展名集合 */
const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'avif', 'tiff', 'tif', 'heic', 'heif',
])

/** Resolve the board asset directory from the request body. */
async function resolveAssetDir(body: {
  boardFolderUri?: string
  projectId?: string
  boardId?: string
}): Promise<string | null> {
  if (body.boardFolderUri) {
    const raw = body.boardFolderUri.trim()
    let boardDir: string
    if (raw.startsWith('file://')) {
      boardDir = fileURLToPath(raw)
    } else if (path.isAbsolute(raw)) {
      boardDir = path.resolve(raw)
    } else {
      boardDir = resolveScopedPath({
        projectId: body.projectId,
        target: raw,
      })
    }
    return path.join(boardDir, BOARD_ASSETS_DIR)
  }
  if (body.boardId) {
    const boardResult = await resolveBoardDirFromDb(body.boardId)
    if (!boardResult) return null
    return path.join(boardResult.absDir, BOARD_ASSETS_DIR)
  }
  return null
}

/** Generate a unique file name that doesn't collide with existing files. */
function getUniqueName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let counter = 1
  while (existingNames.has(`${base}_${counter}${ext}`)) counter++
  return `${base}_${counter}${ext}`
}

function nowTimestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
}

/** Sanitize a file name: timestamp + 16-char MD5 + original extension. */
function sanitizeFileName(raw: string): string {
  const ext = path.extname(raw)
  const base = path.basename(raw, ext)
  return `${nowTimestamp()}_${createHash('md5').update(base).digest('hex').slice(0, 16)}${ext}`
}

/** Register URL download routes under /media/url-download. */
export function registerUrlDownloadRoutes(app: Hono) {
  /**
   * Download a file from a URL and save to board assets.
   * Returns the relative path, filename, mime type, and image dimensions if applicable.
   */
  app.post('/media/url-download', async (c) => {
    try {
      const body = await c.req.json<{
        url?: string
        boardFolderUri?: string
        projectId?: string
        boardId?: string
      }>()

      const url = body.url?.trim()
      if (!url) {
        return c.json({ error: 'Missing url' }, 400)
      }

      const assetDir = await resolveAssetDir(body)
      if (!assetDir) {
        return c.json({ error: 'Missing boardFolderUri or boardId' }, 400)
      }

      // 下载远程文件
      const response = await fetch(url)
      if (!response.ok || !response.body) {
        return c.json({ error: `Download failed: ${response.status}` }, 502)
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const mimeType = contentType.split(';')[0].trim()

      // 从 URL 推断文件名
      let urlFileName = ''
      try {
        const pathname = new URL(url).pathname
        const segments = pathname.split('/')
        urlFileName = decodeURIComponent(segments[segments.length - 1] ?? '')
      } catch { /* ignore */ }
      const rawName = urlFileName || `download_${Date.now()}`
      const safeName = sanitizeFileName(rawName) || `download_${Date.now()}`

      // 确保目标目录存在
      await fs.mkdir(assetDir, { recursive: true })

      // 生成唯一文件名
      const existingEntries = await fs.readdir(assetDir).catch(() => [])
      const existingNames = new Set(existingEntries)
      const uniqueName = getUniqueName(safeName, existingNames)
      const filePath = path.join(assetDir, uniqueName)

      // 流式写入磁盘
      const stream = Readable.fromWeb(response.body as any)
      await pipeline(stream, createWriteStream(filePath))

      const relativePath = `${BOARD_ASSETS_DIR}/${uniqueName}`

      // 如果是图片，尝试获取尺寸
      const ext = path.extname(uniqueName).replace('.', '').toLowerCase()
      let width: number | undefined
      let height: number | undefined

      if (IMAGE_EXTS.has(ext) || mimeType.startsWith('image/')) {
        try {
          const sharp = (await import('sharp')).default
          const metadata = await sharp(filePath).metadata()
          width = metadata.width
          height = metadata.height
        } catch (err) {
          logger.warn({ err, filePath }, 'Failed to read image dimensions')
        }
      }

      return c.json({
        success: true,
        data: {
          relativePath,
          fileName: uniqueName,
          mimeType,
          width,
          height,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed'
      logger.error({ error }, 'url-download failed')
      return c.json({ error: message }, 500)
    }
  })
}
