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
 * Session Memory Hook — auto-archive session summary when session ends or resets.
 *
 * Generates a slug-based filename (YYYY-MM-DD-slug.md) and writes to the
 * appropriate memory directory (user-level for main chat, project-level for PM).
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { resolveMemoryDir } from '@/ai/shared/memoryLoader'
import { loadMessageTree } from '@/ai/services/chat/repositories/chatFileStore'
import { logger } from '@/common/logger'

/** Max messages to include in the archive summary. */
const ARCHIVE_TAKE = 20
/** Max characters for the archive content. */
const ARCHIVE_MAX_CHARS = 2000

type ArchiveOptions = {
  sessionId: string
  /** Project root path for project-level memory. If absent, archives to user memory. */
  projectRootPath?: string
}

/** Generate a simple slug from text. */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '')
    || 'session'
}

/** Extract text content from message parts. */
function extractText(parts: unknown[]): string {
  return (parts as any[])
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim()
}

/**
 * Archive a session's key messages to a memory file.
 * Called when a session ends, resets, or is explicitly archived.
 */
export async function archiveSessionMemory(options: ArchiveOptions): Promise<string | null> {
  try {
    const tree = await loadMessageTree(options.sessionId)
    if (tree.byId.size === 0) return null

    // Get messages sorted by time
    const messages = Array.from(tree.byId.values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-ARCHIVE_TAKE)

    if (messages.length < 2) return null

    // Build archive content
    const lines: string[] = []
    for (const msg of messages) {
      const text = extractText(Array.isArray(msg.parts) ? msg.parts : [])
      if (!text) continue
      const prefix = msg.role === 'user' ? 'User' : 'Assistant'
      const truncated = text.length > 200 ? `${text.slice(0, 200)}...` : text
      lines.push(`**${prefix}**: ${truncated}`)
    }

    const content = lines.join('\n\n').slice(0, ARCHIVE_MAX_CHARS)
    if (!content) return null

    // Generate slug from first user message
    const firstUserMsg = messages.find((m) => m.role === 'user')
    const slugSource = firstUserMsg
      ? extractText(Array.isArray(firstUserMsg.parts) ? firstUserMsg.parts : [])
      : 'session'
    const slug = generateSlug(slugSource)

    // Resolve target directory
    const rootPath = options.projectRootPath || homedir()
    const memDir = resolveMemoryDir(rootPath)
    mkdirSync(memDir, { recursive: true })

    // Generate filename: YYYY-MM-DD-slug.md
    const today = new Date().toISOString().slice(0, 10)
    let fileName = `${today}-${slug}.md`
    let filePath = path.join(memDir, fileName)

    // Avoid overwriting: append timestamp if exists
    if (existsSync(filePath)) {
      const hhmm = new Date().toISOString().slice(11, 16).replace(':', '')
      fileName = `${today}-${slug}-${hhmm}.md`
      filePath = path.join(memDir, fileName)
    }

    // Write archive
    const archiveContent = `# Session Archive: ${slug}\n\n${content}\n`
    writeFileSync(filePath, archiveContent, 'utf8')

    logger.info(
      { sessionId: options.sessionId, filePath },
      '[session-memory] Archived session memory',
    )

    return filePath
  } catch (err) {
    logger.error(
      { sessionId: options.sessionId, err },
      '[session-memory] Failed to archive session memory',
    )
    return null
  }
}
