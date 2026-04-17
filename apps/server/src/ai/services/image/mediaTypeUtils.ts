/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import nodePath from 'node:path'

export type MediaKind = 'image' | 'video' | 'audio' | 'unknown'

const IMAGE_EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
}

const VIDEO_EXT_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
}

const AUDIO_EXT_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
}

function getExt(filePath: string): string {
  // 逻辑：兼容 `path:10-20` 后缀的行号语法，先剥掉。
  const base = filePath.replace(/:\d+-\d+$/, '')
  return nodePath.extname(base).toLowerCase()
}

/** Classify a path by its extension. Returns "unknown" for unsupported types. */
export function classifyMediaByExt(filePath: string): MediaKind {
  const ext = getExt(filePath)
  if (IMAGE_EXT_MIME[ext]) return 'image'
  if (VIDEO_EXT_MIME[ext]) return 'video'
  if (AUDIO_EXT_MIME[ext]) return 'audio'
  return 'unknown'
}

/** Resolve the MIME type for a media file. Returns null if unknown. */
export function guessMediaTypeByExt(filePath: string): string | null {
  const ext = getExt(filePath)
  return IMAGE_EXT_MIME[ext] ?? VIDEO_EXT_MIME[ext] ?? AUDIO_EXT_MIME[ext] ?? null
}
