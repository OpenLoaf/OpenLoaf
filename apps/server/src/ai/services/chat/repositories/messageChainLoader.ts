/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { OpenLoafUIMessage } from '@openloaf/api/types/message'
import { loadMessageChainFromFile } from './chatFileStore'

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
    role: row.role as any,
    parentMessageId: row.parentMessageId ?? null,
    parts: (row.parts as any) ?? [],
    metadata: (row.metadata as any) ?? undefined,
    messageKind: (row as any).messageKind ?? 'normal',
  }))
}
