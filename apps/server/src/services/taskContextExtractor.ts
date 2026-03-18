/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  loadMessageTree,
  resolveRightmostLeaf,
  resolveChainFromLeaf,
  type StoredMessage,
} from '@/ai/services/chat/repositories/chatFileStore'
import { logger } from '@/common/logger'

const MAX_SNAPSHOT_CHARS = 2000
const RECENT_PAIRS = 3 // 3 pairs = 6 messages
const RECENT_MSG_LIMIT = 400
const EARLY_MSG_LIMIT = 120

/**
 * Extract a compact text snapshot from the source chat session.
 * This runs synchronously against the message file — no LLM calls.
 */
export async function extractSourceContextSnapshot(
  sessionId: string,
): Promise<string | undefined> {
  try {
    const tree = await loadMessageTree(sessionId)
    const leafId = resolveRightmostLeaf(tree)
    if (!leafId) return undefined

    const chain = resolveChainFromLeaf(tree, leafId)
    // Filter out subagent / compact_prompt messages
    const filtered = chain.filter(
      (m) =>
        m.role !== 'subagent' &&
        m.messageKind !== 'compact_prompt' &&
        m.messageKind !== 'compact_summary',
    )

    if (filtered.length === 0) return undefined

    // Split into recent (last N pairs) and early
    const recentCount = RECENT_PAIRS * 2
    const recentStart = Math.max(0, filtered.length - recentCount)
    const earlyMessages = filtered.slice(0, recentStart)
    const recentMessages = filtered.slice(recentStart)

    const parts: string[] = []

    // Early messages: compressed
    if (earlyMessages.length > 0) {
      parts.push('[早期对话摘要]')
      for (const msg of earlyMessages) {
        const text = extractText(msg, EARLY_MSG_LIMIT)
        if (text) {
          parts.push(`${roleLabel(msg.role)}: ${text}`)
        }
      }
    }

    // Recent messages: more detail
    if (recentMessages.length > 0) {
      parts.push('[最近对话]')
      for (const msg of recentMessages) {
        const text = extractText(msg, RECENT_MSG_LIMIT)
        if (text) {
          parts.push(`${roleLabel(msg.role)}: ${text}`)
        }
      }
    }

    let snapshot = parts.join('\n')
    if (snapshot.length > MAX_SNAPSHOT_CHARS) {
      snapshot = snapshot.slice(0, MAX_SNAPSHOT_CHARS) + '…'
    }

    return snapshot || undefined
  } catch (err) {
    logger.warn({ sessionId, err }, '[task-context] Failed to extract source context snapshot')
    return undefined
  }
}

function extractText(msg: StoredMessage, limit: number): string {
  const parts = Array.isArray(msg.parts) ? msg.parts : []
  const texts: string[] = []
  for (const part of parts) {
    const p = part as any
    if (p?.type === 'text' && typeof p.text === 'string' && p.text.trim()) {
      texts.push(p.text.trim())
    }
  }
  const joined = texts.join(' ')
  if (joined.length <= limit) return joined
  return joined.slice(0, limit) + '…'
}

function roleLabel(role: string): string {
  switch (role) {
    case 'user':
      return 'User'
    case 'assistant':
      return 'AI'
    case 'task-report':
      return 'TaskReport'
    default:
      return role
  }
}
