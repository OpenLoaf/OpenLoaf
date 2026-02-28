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
 * Context window management — token estimation and message compression.
 *
 * Prevents token overflow in long conversations (MAST FM-1.4).
 * Uses a "Write-Select-Compress-Isolate" strategy:
 * 1. Estimate token count for message array
 * 2. If over threshold, compress older messages into summaries
 * 3. Keep recent messages intact for continuity
 */

import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token estimation using character count heuristic.
 * - English: ~4 chars per token
 * - Chinese: ~2 chars per token
 * - Mixed content: ~3 chars per token (conservative)
 *
 * This avoids a tiktoken dependency while being reasonably accurate.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0
  // Count CJK characters
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const nonCjkChars = text.length - cjkChars
  // CJK: ~1.5 tokens per char, ASCII: ~0.25 tokens per char
  return Math.ceil(cjkChars * 1.5 + nonCjkChars * 0.25)
}

/** Estimate token count for a message array. */
export function estimateMessagesTokens(messages: any[]): number {
  let total = 0
  for (const msg of messages) {
    // Handle both UIMessage (parts) and ModelMessage (content) formats
    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (typeof part === 'string') {
          total += estimateTokenCount(part)
        } else if (part?.text) {
          total += estimateTokenCount(String(part.text))
        } else if (part?.type === 'tool-invocation') {
          // Tool invocations include input + output
          total += estimateTokenCount(JSON.stringify(part.input ?? ''))
          total += estimateTokenCount(JSON.stringify(part.output ?? ''))
        }
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === 'string') {
          total += estimateTokenCount(part)
        } else if (part?.text) {
          total += estimateTokenCount(String(part.text))
        }
      }
    } else if (typeof msg.content === 'string') {
      total += estimateTokenCount(msg.content)
    }
    // Role + structural overhead: ~4 tokens per message
    total += 4
  }
  return total
}

// ---------------------------------------------------------------------------
// Context window limits per model family
// ---------------------------------------------------------------------------

/** Known model context window sizes (tokens). */
const MODEL_CONTEXT_SIZES: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'claude-3-5-sonnet': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-opus': 200_000,
  'claude-4-sonnet': 200_000,
  'deepseek-chat': 128_000,
  'deepseek-reasoner': 128_000,
  'qwen-plus': 128_000,
  'qwen-max': 128_000,
}

const DEFAULT_CONTEXT_SIZE = 128_000

/** Get the context window size for a model. */
export function getModelContextSize(modelId?: string): number {
  if (!modelId) return DEFAULT_CONTEXT_SIZE
  const lower = modelId.toLowerCase()
  for (const [key, size] of Object.entries(MODEL_CONTEXT_SIZES)) {
    if (lower.includes(key)) return size
  }
  return DEFAULT_CONTEXT_SIZE
}

// ---------------------------------------------------------------------------
// Message compression
// ---------------------------------------------------------------------------

/** Number of recent message turns to always keep intact. */
const KEEP_RECENT_TURNS = 5 // 5 pairs (user + assistant) = 10 messages

/** Threshold ratio — compress when tokens exceed this fraction of context window. */
const COMPRESSION_THRESHOLD = 0.7

/** Compress older messages into a summary. */
function compressMessages(messages: any[]): any[] {
  if (messages.length <= KEEP_RECENT_TURNS * 2) return messages

  // Split into old + recent
  const recentCount = KEEP_RECENT_TURNS * 2
  const oldMessages = messages.slice(0, -recentCount)
  const recentMessages = messages.slice(-recentCount)

  // Build a text summary of old messages
  const summaryParts: string[] = ['[Context Summary - Earlier conversation:]']

  for (const msg of oldMessages) {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role
    const textParts: string[] = []

    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (part?.type === 'text' && part.text) {
          // Truncate long text parts
          const text = String(part.text)
          textParts.push(text.length > 200 ? `${text.slice(0, 200)}...` : text)
        } else if (part?.type === 'tool-invocation') {
          const toolName = part.toolName || 'unknown-tool'
          const state = part.state || 'unknown'
          textParts.push(`[Tool: ${toolName} (${state})]`)
        }
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text' && part.text) {
          const text = String(part.text)
          textParts.push(text.length > 200 ? `${text.slice(0, 200)}...` : text)
        }
      }
    } else if (typeof msg.content === 'string') {
      const text = msg.content
      textParts.push(text.length > 200 ? `${text.slice(0, 200)}...` : text)
    }

    if (textParts.length > 0) {
      summaryParts.push(`${role}: ${textParts.join(' | ')}`)
    }
  }

  const summaryMessage = {
    role: 'user',
    content: [{ type: 'text', text: summaryParts.join('\n') }],
  }

  return [summaryMessage, ...recentMessages]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trim model messages to fit within context window.
 *
 * Call this after `buildModelMessages()` and before passing to the model.
 * Returns the (possibly compressed) message array.
 */
export function trimToContextWindow(
  messages: any[],
  options?: { modelId?: string },
): any[] {
  const contextSize = getModelContextSize(options?.modelId)
  const threshold = Math.floor(contextSize * COMPRESSION_THRESHOLD)
  const tokenCount = estimateMessagesTokens(messages)

  if (tokenCount <= threshold) return messages

  logger.info(
    { tokenCount, threshold, contextSize, messageCount: messages.length },
    '[context-window] messages exceed threshold, compressing',
  )

  const compressed = compressMessages(messages)
  const newTokenCount = estimateMessagesTokens(compressed)

  logger.info(
    {
      before: tokenCount,
      after: newTokenCount,
      saved: tokenCount - newTokenCount,
      messagesBefore: messages.length,
      messagesAfter: compressed.length,
    },
    '[context-window] compression complete',
  )

  return compressed
}
