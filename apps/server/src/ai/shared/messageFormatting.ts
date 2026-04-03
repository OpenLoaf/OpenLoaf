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
 * Shared message formatting utilities for context compression modules.
 *
 * Used by autoCompact.ts and contextCollapse.ts.
 */

import type { ModelMessage } from 'ai'

/**
 * Extract readable text from a model message content part.
 *
 * @param part    - An individual content part (unknown type for safety).
 * @param maxLen  - Maximum character length before truncation. Default 500.
 */
export function extractPartText(part: unknown, maxLen = 500): string | null {
  if (!part || typeof part !== 'object') return null
  const p = part as Record<string, unknown>
  if (typeof p.text === 'string') {
    const text = p.text
    return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
  }
  if (p.type === 'tool-call') return `[Tool call: ${p.toolName ?? 'unknown'}]`
  if (p.type === 'tool-result') return `[Tool result: ${p.toolName ?? 'unknown'}]`
  return null
}

/**
 * Format model messages into readable plain text for LLM summarization.
 *
 * @param messages - Array of model messages to format.
 * @param maxLen   - Maximum character length per text part before truncation. Default 500.
 */
export function formatMessagesAsText(
  messages: ReadonlyArray<ModelMessage>,
  maxLen = 500,
): string {
  const parts: string[] = []
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role
    const contentParts: string[] = []
    const content = (msg as any).content

    if (Array.isArray(content)) {
      for (const part of content) {
        const text = extractPartText(part, maxLen)
        if (text) contentParts.push(text)
      }
    } else if (typeof content === 'string') {
      contentParts.push(content.length > maxLen ? `${content.slice(0, maxLen)}...` : content)
    }

    if (contentParts.length > 0) {
      parts.push(`${role}: ${contentParts.join(' | ')}`)
    }
  }
  return parts.join('\n\n')
}
