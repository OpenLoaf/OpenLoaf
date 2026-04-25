/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { UIMessage } from 'ai'
import type { ModelDefinition } from '@openloaf/api/common'
import { replaceFileTokensWithNames } from '@/common/chatTitle'

/** Tags that mean the aux model can ingest media natively. */
const MEDIA_ACCEPTS = new Set(['image', 'video', 'audio'])

/** Whether the aux model declares any media input accept type. */
export function modelHasMediaCapability(
  modelDef: ModelDefinition | undefined,
): boolean {
  const accepts = modelDef?.capabilities?.inputAccepts
  if (!Array.isArray(accepts)) return false
  return accepts.some((kind) => MEDIA_ACCEPTS.has(kind))
}

/**
 * Flatten UIMessage[] into a legacy role-prefixed context string. Called when
 * the aux model can't process media natively. File references (attachment
 * tags) are reduced to filenames via replaceFileTokensWithNames so the model
 * sees readable content instead of XML-shaped attachment tags.
 */
export function flattenMessagesToContext(messages: UIMessage[]): string {
  const lines: string[] = []
  for (const msg of messages) {
    const parts = Array.isArray(msg.parts) ? (msg.parts as any[]) : []
    const textChunks: string[] = []
    for (const part of parts) {
      if (part?.type === 'text' && typeof part.text === 'string') {
        textChunks.push(replaceFileTokensWithNames(String(part.text)))
      }
    }
    const text = textChunks.join('\n').trim()
    if (!text) continue
    if (msg.role === 'user') lines.push(`User: ${text}`)
    else if (msg.role === 'assistant') lines.push(`Assistant: ${text}`)
    else lines.push(`System: ${text}`)
  }
  return lines.join('\n').trim()
}

/**
 * Deterministic serialization of a messages array for cache keying. Captures
 * role, part type, text/url/mediaType but drops non-stable fields (ids,
 * timestamps) so the same logical conversation always produces the same seed.
 */
export function messagesCacheSeed(messages: UIMessage[]): string {
  return JSON.stringify(
    messages.map((m) => ({
      role: m.role,
      parts: Array.isArray(m.parts)
        ? (m.parts as any[]).map((p) => {
            if (p?.type === 'text') return { t: 'text', v: p.text }
            if (p?.type === 'file') return { t: 'file', v: p.url, m: p.mediaType }
            return { t: p?.type ?? 'unknown' }
          })
        : [],
    })),
  )
}
