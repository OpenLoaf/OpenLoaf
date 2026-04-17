/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from 'node:fs'
import nodePath from 'node:path'
import { getSaasClient } from '@/modules/saas/client'
import { ensureServerAccessToken } from '@/modules/auth/tokenStore'
import { logger } from '@/common/logger'

export type UploadResult = {
  url: string
  mediaType: string
}

export type UploadOptions = {
  /** Override MIME (falls back to ext lookup). */
  mediaType?: string
  /** Override file name (defaults to basename(absPath)). */
  fileName?: string
  /** Optional progress callback for UX hints. */
  progress?: (message: string) => void
}

/**
 * Upload a local file to SaaS CDN. Returns null when not logged in or when
 * any step fails — callers are expected to fall back (e.g. to base64).
 *
 * Unlike the throw-based helper in cloudTools.ts, this variant is
 * side-effect-safe: it never throws for recoverable conditions (missing
 * token, network hiccup, SaaS 5xx). Fatal programmer errors (absolute path
 * required, etc.) still throw to surface misuse.
 */
export async function uploadFileToSaasCdn(
  absPath: string,
  options: UploadOptions = {},
): Promise<UploadResult | null> {
  if (!absPath || !nodePath.isAbsolute(absPath)) {
    throw new Error(`uploadFileToSaasCdn: absPath must be absolute — ${absPath}`)
  }

  const token = await ensureServerAccessToken()
  if (!token) return null

  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(absPath)
  } catch {
    return null
  }
  if (!stat.isFile()) return null

  const fileName = options.fileName ?? nodePath.basename(absPath)
  options.progress?.(`uploading ${fileName} (${stat.size} bytes)`)

  let buffer: Buffer
  try {
    buffer = await fs.readFile(absPath)
  } catch {
    return null
  }

  const mediaType =
    options.mediaType ?? guessMediaTypeFromExt(absPath) ?? 'application/octet-stream'

  try {
    const client = getSaasClient(token)
    const blob = new Blob([new Uint8Array(buffer)], { type: mediaType })
    const res = await client.ai.uploadFile(blob, fileName, { expireHours: 24 })
    if (!res || typeof res.url !== 'string' || !res.url) return null
    return { url: res.url, mediaType }
  } catch (err) {
    logger.warn({ err, absPath, fileName }, '[saasUploader] upload failed')
    return null
  }
}

const EXT_TO_MIME: Record<string, string> = {
  // images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  // video
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  // audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.weba': 'audio/webm',
  '.opus': 'audio/opus',
}

function guessMediaTypeFromExt(filePath: string): string | null {
  const ext = nodePath.extname(filePath).toLowerCase()
  return EXT_TO_MIME[ext] ?? null
}
