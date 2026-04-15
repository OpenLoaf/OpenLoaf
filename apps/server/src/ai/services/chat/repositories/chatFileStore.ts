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
import { prisma } from '@openloaf/db'

import {
  resolveSessionDir,
  registerSessionDir,
  _getSessionDirCache,
  MESSAGES_FILE,
} from '@openloaf/api/services/chatSessionPaths'
// Re-export shared chat path constants so sub-modules in this package can import them
// via the existing './chatFileStore' alias without creating a direct @openloaf/api dep.
export {
  CHAT_HISTORY_DIR,
  MESSAGES_FILE,
  LRU_MAX_SIZE,
} from '@openloaf/api/services/chatSessionPaths'
import { loadMessageTree, invalidateCache, _clearAllTreeCaches } from './chatMessageTreeIndex'
import { withSessionLock } from './chatMessagePersistence'
import { logger } from '@/common/logger'
import type { ProbeMeta } from '@openloaf/api'

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
  /** Last allocated plan number for PLAN_{no}.md naming. */
  lastPlanNo?: number
  /** 自动化探针标记（chat-probe runner 写入，后端只读）。 */
  autoTest?: boolean
  /** 自动化探针元数据（chat-probe runner 写入，后端只读）。 */
  probeMeta?: ProbeMeta
}

export type SiblingNavEntry = {
  parentMessageId: string | null
  prevSiblingId: string | null
  nextSiblingId: string | null
  siblingIndex: number
  siblingTotal: number
}

// ---------------------------------------------------------------------------
// Constants (local — CHAT_HISTORY_DIR / MESSAGES_FILE / LRU_MAX_SIZE are
// re-exported from @openloaf/api/services/chatSessionPaths)
// ---------------------------------------------------------------------------

export const SESSION_FILE = 'session.json'

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

/**
 * 从 session.json 派生自动化探针字段（只读）。
 * 数据源：chat-history/<sessionId>/session.json —— 外部 probe runner 写入。
 * 容错策略：文件不存在 / JSON 解析失败 / 字段类型不对 → 降级为 { autoTest: false, probeMeta: null }，不抛错。
 */
export async function readSessionJsonAutoTest(
  sessionId: string,
): Promise<{ autoTest: boolean; probeMeta: ProbeMeta | null }> {
  try {
    const session = await readSessionJson(sessionId)
    if (!session) return { autoTest: false, probeMeta: null }
    const autoTest = session.autoTest === true
    const probeMeta =
      autoTest && session.probeMeta && typeof session.probeMeta === 'object'
        ? (session.probeMeta as ProbeMeta)
        : null
    return { autoTest, probeMeta }
  } catch (err) {
    logger.warn(
      { sessionId, err: err instanceof Error ? err.message : String(err) },
      'readSessionJsonAutoTest failed, falling back to autoTest=false',
    )
    return { autoTest: false, probeMeta: null }
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
