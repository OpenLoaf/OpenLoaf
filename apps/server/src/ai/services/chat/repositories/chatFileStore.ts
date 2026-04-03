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
import path from 'node:path'
import { resolveOpenLoafPath, resolveScopedOpenLoafPath } from '@openloaf/config'
import { getResolvedTempStorageDir } from '@openloaf/api/services/appConfigService'
import { getProjectRootPath } from '@openloaf/api/services/vfsService'
import { prisma } from '@openloaf/db'
import { logger } from '@/common/logger'

import { resolveSessionDir, registerSessionDir, _getSessionDirCache } from './chatSessionPathResolver'
import { loadMessageTree, invalidateCache, _clearAllTreeCaches } from './chatMessageTreeIndex'
import { withSessionLock } from './chatMessagePersistence'

// ---------------------------------------------------------------------------
// Re-export sub-modules (backward compatibility — all consumers import from
// chatFileStore and must continue to work without changes)
// ---------------------------------------------------------------------------

export {
  resolveSessionDir,
  registerSessionDir,
  resolveSessionAssetDir,
  resolveSessionFilesDir,
  clearSessionDirCache,
  registerAgentDir,
} from './chatSessionPathResolver'

export {
  invalidateCache,
  buildTreeFromMessages,
  loadMessageTree,
  resolveChainFromLeaf,
  resolveRightmostLeaf,
  resolveLatestLeafInSubtree,
  buildSiblingNavForChain,
  collectSubtreeIds,
} from './chatMessageTreeIndex'

export {
  withSessionLock,
  appendMessage,
  appendMessageAtLeaf,
  updateMessage,
  deleteMessageSubtree,
  updateMessageParts,
  updateMessageMetadata,
  getMessageById,
} from './chatMessagePersistence'

export {
  type ChatViewResult,
  getChatViewFromFile,
  normalizeTaskReportForModel,
  loadMessageChainFromFile,
} from './chatViewQuery'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoredMessage = {
  id: string
  parentMessageId: string | null
  role: 'user' | 'assistant' | 'system' | 'subagent' | 'task-report'
  messageKind: 'normal' | 'error' | 'compact_prompt' | 'compact_summary'
  parts: unknown[]
  metadata?: Record<string, unknown>
  createdAt: string
}

export type MessageTreeIndex = {
  byId: Map<string, StoredMessage>
  childrenOf: Map<string, string[]>
  rootIds: string[]
}

type SessionJson = {
  id: string
  title: string
  isUserRename: boolean
  isPin: boolean
  errorMessage: string | null
  sessionPreface: string | null
  projectId: string | null
  boardId: string | null
  cliId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  messageCount: number
}

export type SiblingNavEntry = {
  parentMessageId: string | null
  prevSiblingId: string | null
  nextSiblingId: string | null
  siblingIndex: number
  siblingTotal: number
}

// ---------------------------------------------------------------------------
// Constants (exported for sub-modules)
// ---------------------------------------------------------------------------

export const CHAT_HISTORY_DIR = 'chat-history'
export const MESSAGES_FILE = 'messages.jsonl'
export const SESSION_FILE = 'session.json'
export const LRU_MAX_SIZE = 50

// ---------------------------------------------------------------------------
// Low-level path + I/O helpers (used by sub-modules via import)
// ---------------------------------------------------------------------------

export async function messagesPath(sessionId: string): Promise<string> {
  const dir = await resolveSessionDir(sessionId)
  return path.join(dir, MESSAGES_FILE)
}

/** Resolve the absolute path to the messages.jsonl file for a session. */
export async function resolveMessagesJsonlPath(sessionId: string): Promise<string> {
  return messagesPath(sessionId)
}

export async function sessionJsonPath(sessionId: string): Promise<string> {
  const dir = await resolveSessionDir(sessionId)
  return path.join(dir, SESSION_FILE)
}

export async function ensureSessionDir(sessionId: string): Promise<void> {
  const dir = await resolveSessionDir(sessionId)
  await fs.mkdir(dir, { recursive: true })
}

// ---------------------------------------------------------------------------
// JSONL read helpers (exported for sub-modules)
// ---------------------------------------------------------------------------

export function parseJsonlLine(line: string): StoredMessage | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as StoredMessage
  } catch {
    return null
  }
}

export async function readJsonlRaw(sessionId: string): Promise<StoredMessage[]> {
  const filePath = await messagesPath(sessionId)
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n')
    const messages: StoredMessage[] = []
    for (const line of lines) {
      const msg = parseJsonlLine(line)
      if (msg) messages.push(msg)
    }
    return messages
  } catch (err: any) {
    if (err?.code === 'ENOENT') return []
    throw err
  }
}

export async function rewriteJsonl(sessionId: string, messages: StoredMessage[]): Promise<void> {
  await ensureSessionDir(sessionId)
  const content = messages.map((m) => `${JSON.stringify(m)}\n`).join('')
  await fs.writeFile(await messagesPath(sessionId), content, 'utf8')
}

// ---------------------------------------------------------------------------
// Session JSON dual-write
// ---------------------------------------------------------------------------

export async function writeSessionJson(
  sessionId: string,
  data: Partial<SessionJson>,
): Promise<void> {
  return withSessionLock(sessionId, async () => {
    await ensureSessionDir(sessionId)
    const filePath = await sessionJsonPath(sessionId)
    let existing: Partial<SessionJson> = {}
    try {
      const content = await fs.readFile(filePath, 'utf8')
      existing = JSON.parse(content)
    } catch {
      // 文件不存在或解析失败，使用空对象
    }
    const merged = { ...existing, ...data, id: sessionId }
    await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf8')
  })
}

export async function readSessionJson(sessionId: string): Promise<SessionJson | null> {
  try {
    const content = await fs.readFile(await sessionJsonPath(sessionId), 'utf8')
    return JSON.parse(content) as SessionJson
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Message count helper
// ---------------------------------------------------------------------------

export async function getMessageCount(sessionId: string): Promise<number> {
  const tree = await loadMessageTree(sessionId)
  let count = 0
  for (const msg of tree.byId.values()) {
    if (msg.role === 'subagent' || msg.role === 'task-report') continue
    if (msg.messageKind === 'compact_prompt') continue
    count++
  }
  return count
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/** Delete all files for a session. */
export async function deleteSessionFiles(sessionId: string): Promise<void> {
  const { sessionDirCache, sessionDirOrder } = _getSessionDirCache()
  try {
    const dir = await resolveSessionDir(sessionId)
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // 目录不存在时忽略
  }
  invalidateCache(sessionId)
  sessionDirCache.delete(sessionId)
  const idx = sessionDirOrder.indexOf(sessionId)
  if (idx >= 0) sessionDirOrder.splice(idx, 1)
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Migrate the entire session directory from global path to a project-scoped path.
 * Called when ensureTempProject() binds a session to a newly created project,
 * so that all files (messages.jsonl, session.json, root/, files/, agents/, etc.)
 * written before the project existed are not orphaned.
 */
export async function migrateSessionDirToProject(
  sessionId: string,
  projectId: string,
): Promise<void> {
  const { sessionDirCache, touchSessionDirCache } = _getSessionDirCache()

  // 1. 全局路径（无 projectId 时的默认路径）
  const globalRoot = resolveOpenLoafPath(CHAT_HISTORY_DIR)
  const globalDir = path.join(globalRoot, sessionId)

  // 2. 目标项目路径
  const projectRoot = getProjectRootPath(projectId)
  if (!projectRoot) return
  const targetRoot = resolveScopedOpenLoafPath(projectRoot, CHAT_HISTORY_DIR)
  const targetDir = path.join(targetRoot, sessionId)

  // 3. 路径相同则跳过
  if (globalDir === targetDir) return

  // 4. 全局目录不存在则跳过
  try {
    await fs.stat(globalDir)
  } catch {
    return
  }

  // 5. 目标目录不存在 → 直接 rename 整个目录（最高效）
  await fs.mkdir(targetRoot, { recursive: true })
  try {
    await fs.stat(targetDir)
  } catch {
    // 目标不存在，直接移动整个目录
    await fs.rename(globalDir, targetDir)
    sessionDirCache.set(sessionId, targetDir)
    touchSessionDirCache(sessionId)
    invalidateCache(sessionId)
    logger.info(
      { sessionId, from: globalDir, to: targetDir },
      '[chat-file-store] migrated session dir to project scope (rename)',
    )
    return
  }

  // 6. 目标目录已存在 → 逐个合并文件
  const entries = await fs.readdir(globalDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(globalDir, entry.name)
    const dstPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      // 子目录：目标不存在则直接移动，已存在则跳过（保留目标）
      try {
        await fs.stat(dstPath)
      } catch {
        await fs.rename(srcPath, dstPath)
      }
    } else if (entry.name === MESSAGES_FILE) {
      // messages.jsonl：去重合并
      const globalContent = await fs.readFile(srcPath, 'utf8')
      if (globalContent.trim()) {
        // 读取目标文件已有消息的 ID 集合
        const existingIds = new Set<string>()
        try {
          const dstContent = await fs.readFile(dstPath, 'utf8')
          for (const line of dstContent.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const msg = JSON.parse(trimmed)
              if (msg.id) existingIds.add(msg.id)
            } catch {
              /* skip malformed lines */
            }
          }
        } catch {
          /* dst file doesn't exist yet */
        }

        // 只追加不存在的消息
        const newLines: string[] = []
        for (const line of globalContent.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const msg = JSON.parse(trimmed)
            if (msg.id && !existingIds.has(msg.id)) {
              newLines.push(trimmed)
            }
          } catch {
            newLines.push(trimmed) // 保留无法解析的行
          }
        }
        if (newLines.length > 0) {
          await fs.appendFile(dstPath, newLines.map((l) => `${l}\n`).join(''))
        }
      }
      await fs.unlink(srcPath)
    } else {
      // 其他文件（session.json 等）：目标不存在则移动
      try {
        await fs.stat(dstPath)
        await fs.unlink(srcPath) // 目标已有，删除源文件
      } catch {
        await fs.rename(srcPath, dstPath)
      }
    }
  }

  // 7. 清理空的全局目录
  try {
    await fs.rmdir(globalDir)
  } catch {
    /* 目录非空则忽略 */
  }

  // 8. 更新缓存
  sessionDirCache.set(sessionId, targetDir)
  touchSessionDirCache(sessionId)
  invalidateCache(sessionId)

  logger.info(
    { sessionId, from: globalDir, to: targetDir },
    '[chat-file-store] migrated session dir to project scope (merge)',
  )
}

/** Delete all chat history files for all sessions. */
export async function deleteAllChatFiles(): Promise<void> {
  // 逻辑：查询所有 session，逐个删除对应目录
  const sessions = await prisma.chatSession.findMany({
    select: { id: true, projectId: true, boardId: true },
  })
  for (const session of sessions) {
    await registerSessionDir(session.id, session.projectId, session.boardId)
    try {
      const dir = await resolveSessionDir(session.id)
      await fs.rm(dir, { recursive: true, force: true })
    } catch {
      // 忽略
    }
  }
  _clearAllTreeCaches()
  const { sessionDirCache, sessionDirOrder } = _getSessionDirCache()
  sessionDirCache.clear()
  sessionDirOrder.length = 0
}
