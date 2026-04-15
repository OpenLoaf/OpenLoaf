/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * saveRawArtifact — shared helper for tools that do LOSSY extraction
 * (e.g. HTML → Markdown, DOM → innerText). Persists the raw source to
 * `{sessionAssetDir}/{subdir}/{filename}` so the model can re-analyze it
 * via Read/Grep when the extracted summary loses structural info.
 *
 * Pattern origin: the hexems.com diagnosis showed that WebFetch's
 * Turndown-transformed output stripped `<script>/<link>` tags, forcing the
 * model into a 30-step Grep loop. Keeping the raw bytes on disk lets the
 * model fall back to direct inspection.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { logger } from '@/common/logger'

export type RawArtifactSubdir = 'webfetch' | 'browser'

export interface SavedRawArtifact {
  /** Absolute filesystem path. */
  absPath: string
  /** Path template returned to the model: `${CURRENT_CHAT_DIR}/{subdir}/{filename}`. */
  relPath: string
  /** Byte length written. */
  bytes: number
}

/**
 * Sanitize a hostname (or arbitrary slug) for use in filenames.
 * - Strips protocol/path if a full URL is passed.
 * - Replaces any non [a-z0-9.-] with `-`.
 * - Truncates to 40 chars.
 */
export function hostSlug(input: string): string {
  let host = input
  try {
    host = new URL(input).hostname
  } catch {
    // not a URL — use as-is
  }
  return host
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'unknown'
}

/** Build a timestamp prefix in local time: `YYYYMMDD_HHMMSS`. */
export function timestampPrefix(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
}

/**
 * Save raw artifact bytes into `{sessionAssetDir}/{subdir}/{filename}`.
 * Requires an active session (throws if sessionId is missing — every chat
 * turn has one).
 */
export async function saveRawArtifact(params: {
  subdir: RawArtifactSubdir
  filename: string
  content: string | Uint8Array
}): Promise<SavedRawArtifact> {
  const sessionId = getSessionId()
  if (!sessionId) {
    throw new Error('saveRawArtifact: sessionId is required (no active chat session).')
  }

  const assetDir = await resolveSessionAssetDir(sessionId)
  const targetDir = path.join(assetDir, params.subdir)
  await fs.mkdir(targetDir, { recursive: true })

  const absPath = path.join(targetDir, params.filename)
  const bytes = typeof params.content === 'string'
    ? Buffer.byteLength(params.content, 'utf-8')
    : params.content.byteLength

  await fs.writeFile(absPath, params.content)

  // Use the ${CURRENT_CHAT_DIR} template variable so AI can use this path
  // directly in any tool (including Bash) without session-id wrangling.
  const relPath = `\${CURRENT_CHAT_DIR}/${params.subdir}/${params.filename}`

  logger.info(
    { subdir: params.subdir, filename: params.filename, bytes, sessionId },
    '[saveRawArtifact] persisted raw artifact',
  )

  return { absPath, relPath, bytes }
}

/** Format a human-readable byte count. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
