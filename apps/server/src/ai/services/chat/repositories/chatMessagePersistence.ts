/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { prisma } from '@openloaf/db'
import type { StoredMessage } from './chatFileStore'
import {
  ensureSessionDir,
  getMessageCount,
  messagesPath,
  readJsonlRaw,
  rewriteJsonl,
  writeSessionJson,
} from './chatFileStore'
import {
  collectSubtreeIds,
  invalidateCache,
  loadMessageTree,
  resolveRightmostLeaf,
} from './chatMessageTreeIndex'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Per-session mutex (Promise-based queue)
// ---------------------------------------------------------------------------

const sessionLocks = new Map<string, Promise<void>>()

export async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionId) ?? Promise.resolve()
  let resolve: () => void
  const next = new Promise<void>((r) => {
    resolve = r
  })
  sessionLocks.set(sessionId, next)
  try {
    await prev
    return await fn()
  } finally {
    resolve!()
    if (sessionLocks.get(sessionId) === next) {
      sessionLocks.delete(sessionId)
    }
  }
}

// ---------------------------------------------------------------------------
// JSONL write helpers
// ---------------------------------------------------------------------------

async function appendJsonlLine(sessionId: string, message: StoredMessage): Promise<void> {
  await ensureSessionDir(sessionId)
  const filePath = await messagesPath(sessionId)
  const line = `${JSON.stringify(message)}\n`
  await fs.appendFile(filePath, line, 'utf8')
  logger.info({ sessionId, filePath, messageId: message.id }, '[chat-file-store] message appended')
}

/** 原地替换 JSONL 中的消息（按 id 匹配），若不存在则追加。 */
async function replaceMessageInJsonl(sessionId: string, message: StoredMessage): Promise<void> {
  const messages = await readJsonlRaw(sessionId)
  let replaced = false
  const updated = messages.map((m) => {
    if (m.id === message.id) {
      replaced = true
      return message
    }
    return m
  })
  if (!replaced) {
    updated.push(message)
  }
  await rewriteJsonl(sessionId, updated)
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

import { promises as fs } from 'node:fs'

/** Append a new message to the session JSONL. */
export async function appendMessage(input: {
  sessionId: string
  message: StoredMessage
}): Promise<void> {
  await withSessionLock(input.sessionId, async () => {
    await appendJsonlLine(input.sessionId, input.message)
    invalidateCache(input.sessionId)
  })
}

/**
 * Atomically resolve the rightmost leaf and append a message as its child.
 * loadMessageTree + resolveRightmostLeaf + appendJsonlLine are all inside
 * the same session lock, eliminating the race window that causes sibling branches.
 */
export async function appendMessageAtLeaf(input: {
  sessionId: string
  buildMessage: (parentMessageId: string | null) => StoredMessage
}): Promise<StoredMessage> {
  return withSessionLock(input.sessionId, async () => {
    const tree = await loadMessageTree(input.sessionId)
    const parentId = resolveRightmostLeaf(tree)
    const message = input.buildMessage(parentId)
    await appendJsonlLine(input.sessionId, message)
    invalidateCache(input.sessionId)
    return message
  })
}

/** Update an existing message in-place (replace by id, or append if new). */
export async function updateMessage(input: {
  sessionId: string
  message: StoredMessage
}): Promise<void> {
  await withSessionLock(input.sessionId, async () => {
    await replaceMessageInJsonl(input.sessionId, input.message)
    invalidateCache(input.sessionId)
  })
}

// ---------------------------------------------------------------------------
// Delete message subtree
// ---------------------------------------------------------------------------

export async function deleteMessageSubtree(input: {
  sessionId: string
  messageId: string
}): Promise<{ deletedCount: number; parentMessageId: string | null }> {
  const result = await withSessionLock(input.sessionId, async () => {
    const tree = await loadMessageTree(input.sessionId)
    const target = tree.byId.get(input.messageId)
    if (!target) return { deletedCount: 0, parentMessageId: null }

    const idsToDelete = new Set(collectSubtreeIds(tree, input.messageId))
    const allMessages = await readJsonlRaw(input.sessionId)
    // 过滤掉被删除的消息（保留 last-write-wins 语义）
    const remaining = allMessages.filter((m) => !idsToDelete.has(m.id))
    await rewriteJsonl(input.sessionId, remaining)
    invalidateCache(input.sessionId)

    return {
      deletedCount: idsToDelete.size,
      parentMessageId: target.parentMessageId,
    }
  })

  // 同步更新 messageCount（DB + session.json）
  if (result.deletedCount > 0) {
    try {
      const newCount = await getMessageCount(input.sessionId)
      await prisma.chatSession.update({
        where: { id: input.sessionId },
        data: { messageCount: newCount },
      })
      await writeSessionJson(input.sessionId, { messageCount: newCount })
    } catch {
      // messageCount 同步为非关键操作，不阻断删除结果
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Update message parts (in-place replace)
// ---------------------------------------------------------------------------

export async function updateMessageParts(input: {
  sessionId: string
  messageId: string
  parts: unknown[]
}): Promise<boolean> {
  return withSessionLock(input.sessionId, async () => {
    const tree = await loadMessageTree(input.sessionId)
    const existing = tree.byId.get(input.messageId)
    if (!existing) return false

    const updated: StoredMessage = {
      ...existing,
      parts: input.parts,
    }
    await replaceMessageInJsonl(input.sessionId, updated)
    invalidateCache(input.sessionId)
    return true
  })
}

export async function updateMessageMetadata(input: {
  sessionId: string
  messageId: string
  metadata: Record<string, unknown>
}): Promise<Record<string, unknown> | null> {
  return withSessionLock(input.sessionId, async () => {
    const tree = await loadMessageTree(input.sessionId)
    const existing = tree.byId.get(input.messageId)
    if (!existing) return null

    const merged = {
      ...((existing.metadata as Record<string, unknown>) ?? {}),
      ...input.metadata,
    }
    const updated: StoredMessage = {
      ...existing,
      metadata: merged,
    }
    await replaceMessageInJsonl(input.sessionId, updated)
    invalidateCache(input.sessionId)
    return merged
  })
}

export async function getMessageById(input: {
  sessionId: string
  messageId: string
}): Promise<StoredMessage | null> {
  const tree = await loadMessageTree(input.sessionId)
  return tree.byId.get(input.messageId) ?? null
}
