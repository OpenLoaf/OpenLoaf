/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ChatMessageKind, OpenLoafUIMessage } from '@openloaf/api/types/message'
import { loadMessageChainFromFile, loadMessageTree, normalizeTaskReportForModel } from './chatFileStore'

/** Default max messages in a chain. */
const DEFAULT_MAX_MESSAGES = 80

/** Load a message chain from JSONL file. */
export async function loadMessageChain(input: {
  /** Session id. */
  sessionId: string
  /** Leaf message id. */
  leafMessageId: string
  /** Max messages to load. */
  maxMessages?: number
}): Promise<OpenLoafUIMessage[]> {
  const maxMessages = Number.isFinite(input.maxMessages)
    ? Number(input.maxMessages)
    : DEFAULT_MAX_MESSAGES
  const leafId = String(input.leafMessageId || '').trim()
  if (!leafId) throw new Error('leafMessageId is required.')

  const rows = await loadMessageChainFromFile({
    sessionId: input.sessionId,
    leafMessageId: leafId,
    maxMessages,
  })

  return rows.map((row) => ({
    id: row.id,
    role: row.role as OpenLoafUIMessage['role'],
    parentMessageId: row.parentMessageId ?? null,
    parts: (row.parts ?? []) as OpenLoafUIMessage['parts'],
    metadata: {
      ...(row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {}),
      _createdAt: row.createdAt,
    },
    messageKind: (row.messageKind ?? 'normal') as ChatMessageKind,
  }))
}

/** Load messages by explicit ID list (board chat messageIdChain). */
export async function loadMessageChainByIds(input: {
  /** Session id. */
  sessionId: string
  /** Ordered message IDs from canvas connector chain. */
  messageIds: string[]
}): Promise<OpenLoafUIMessage[]> {
  if (!input.messageIds.length) return []

  const tree = await loadMessageTree(input.sessionId)
  const result: OpenLoafUIMessage[] = []

  for (const id of input.messageIds) {
    const msg = tree.byId.get(id)
    if (!msg) continue
    if (msg.role === 'subagent') continue
    const normalized = normalizeTaskReportForModel({
      id: msg.id,
      role: msg.role,
      parentMessageId: msg.parentMessageId ?? null,
      parts: msg.parts ?? [],
      metadata: msg.metadata ?? undefined,
      messageKind: msg.messageKind ?? 'normal',
    })
    result.push({
      id: normalized.id,
      role: normalized.role as OpenLoafUIMessage['role'],
      parentMessageId: normalized.parentMessageId,
      parts: normalized.parts as OpenLoafUIMessage['parts'],
      metadata: normalized.metadata,
      messageKind: normalized.messageKind,
    } as OpenLoafUIMessage)
  }

  return result
}
