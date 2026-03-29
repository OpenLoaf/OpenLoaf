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
 * Auto-compact — LLM-based context compression for long conversations.
 *
 * Replaces the manual `/summary-history` command with automatic detection
 * and compression when the conversation context exceeds a threshold.
 *
 * Strategy: "Anchored Summarization"
 * 1. Estimate token count of current messages
 * 2. If over threshold (60% of context window), split into old + recent
 * 3. Use the current model to generate a structured summary of old messages
 * 4. Replace old messages with the summary, keep recent messages intact
 *
 * This runs in prepareStep (step 0 only) so it executes once per request.
 */

import { generateText, type ModelMessage } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { logger } from '@/common/logger'
import {
  estimateMessagesTokens,
  getModelContextSize,
} from '@/ai/shared/contextWindowManager'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Trigger auto-compact when tokens exceed this fraction of context window. */
const AUTO_COMPACT_THRESHOLD = 0.6

/** Number of recent messages to always keep intact (roughly 5 user+assistant turns). */
const KEEP_RECENT_MESSAGES = 10

/** Max tokens for the summary generation call. */
const SUMMARY_MAX_TOKENS = 1500

/** Timeout for the summary generation call (ms). */
const SUMMARY_TIMEOUT_MS = 15_000

// ---------------------------------------------------------------------------
// Compact prompt
// ---------------------------------------------------------------------------

const COMPACT_SYSTEM_PROMPT = [
  '你是一个对话摘要助手。请对以下对话历史生成结构化压缩摘要。',
  '',
  '要求：',
  '- 保留：明确需求、约束、决策、关键事实',
  '- 保留：重要数据、参数、文件路径、命令、接口信息',
  '- 标注：未完成事项与风险',
  '- 格式：精简要点，不展开推理过程',
  '',
  '输出格式：',
  '## 摘要',
  '## 关键决策',
  '## 待办',
  '## 涉及文件',
].join('\n')

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

/** Extract readable text from a model message content part. */
function extractPartText(part: unknown): string | null {
  if (!part || typeof part !== 'object') return null
  const p = part as Record<string, unknown>
  if (typeof p.text === 'string') {
    const text = p.text
    return text.length > 500 ? `${text.slice(0, 500)}...` : text
  }
  if (p.type === 'tool-call') return `[Tool call: ${p.toolName ?? 'unknown'}]`
  if (p.type === 'tool-result') return `[Tool result: ${p.toolName ?? 'unknown'}]`
  return null
}

/** Format old model messages into readable text for summarization. */
function formatMessagesForSummary(messages: ReadonlyArray<ModelMessage>): string {
  const parts: string[] = []
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role
    const contentParts: string[] = []
    const content = (msg as any).content

    if (Array.isArray(content)) {
      for (const part of content) {
        const text = extractPartText(part)
        if (text) contentParts.push(text)
      }
    } else if (typeof content === 'string') {
      contentParts.push(content.length > 500 ? `${content.slice(0, 500)}...` : content)
    }

    if (contentParts.length > 0) {
      parts.push(`${role}: ${contentParts.join(' | ')}`)
    }
  }
  return parts.join('\n\n')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Auto-compact messages if context exceeds threshold.
 *
 * Returns the original messages if no compaction is needed,
 * or a compacted array with a summary replacing old messages.
 *
 * Gracefully falls back to original messages on any error.
 */
export async function tryAutoCompact(
  messages: ReadonlyArray<ModelMessage>,
  modelId?: string,
  model?: LanguageModelV3,
): Promise<ModelMessage[]> {
  const mutableMessages = [...messages] as ModelMessage[]

  // Skip if too few messages to compact
  if (mutableMessages.length <= KEEP_RECENT_MESSAGES) return mutableMessages

  const contextSize = getModelContextSize(modelId)
  const threshold = Math.floor(contextSize * AUTO_COMPACT_THRESHOLD)
  const tokenCount = estimateMessagesTokens(mutableMessages)

  if (tokenCount <= threshold) return mutableMessages

  // No model available — fall back to original (heuristic compression already applied)
  if (!model) {
    logger.warn(
      { tokenCount, threshold },
      '[auto-compact] context exceeds threshold but no model available for summarization',
    )
    return mutableMessages
  }

  logger.info(
    { tokenCount, threshold, contextSize, messageCount: mutableMessages.length },
    '[auto-compact] context exceeds threshold, generating summary',
  )

  try {
    const recentMessages = mutableMessages.slice(-KEEP_RECENT_MESSAGES)
    const oldMessages = mutableMessages.slice(0, -KEEP_RECENT_MESSAGES)
    const formattedOld = formatMessagesForSummary(oldMessages)

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), SUMMARY_TIMEOUT_MS)

    const result = await generateText({
      model,
      system: COMPACT_SYSTEM_PROMPT,
      messages: [{ role: 'user' as const, content: formattedOld }],
      maxOutputTokens: SUMMARY_MAX_TOKENS,
      abortSignal: abortController.signal,
    })

    clearTimeout(timeout)

    const summaryText = result.text?.trim()
    if (!summaryText) {
      logger.warn('[auto-compact] model returned empty summary, keeping original messages')
      return mutableMessages
    }

    const summaryMessage: ModelMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `[Auto-Compact: 以下为早期对话的压缩摘要]\n\n${summaryText}`,
        },
      ],
    }

    const compacted = [summaryMessage, ...recentMessages]
    const newTokenCount = estimateMessagesTokens(compacted)

    logger.info(
      {
        before: tokenCount,
        after: newTokenCount,
        saved: tokenCount - newTokenCount,
        messagesBefore: mutableMessages.length,
        messagesAfter: compacted.length,
      },
      '[auto-compact] compression complete',
    )

    return compacted
  } catch (err) {
    // Graceful fallback — auto-compact is best-effort
    logger.warn({ err }, '[auto-compact] summarization failed, keeping original messages')
    return mutableMessages
  }
}
