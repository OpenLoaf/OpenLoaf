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
 * Non-destructive context collapse — LLM-based incremental summarization.
 *
 * Inspired by Claude Code's Context Collapse pattern.
 *
 * Strategy: "Read-only projection"
 * 1. Estimate token count of current messages
 * 2. If below commitThreshold → return original messages unchanged
 * 3. If above commitThreshold → generate LLM summary of old messages,
 *    return [summary, ...recentMessages] as a new array
 * 4. If above blockingThreshold → force hard trim as fallback
 * 5. On LLM failure → fallback to trimToContextWindow
 *
 * Key design principles:
 * - Never mutate the original message array
 * - Summaries are stored in an internal segments array, accumulating across calls
 * - Each collapse merges existing summaries + new old messages into one segment
 * - Most recent N messages are always preserved intact
 */

import { generateText, type ModelMessage } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { logger } from '@/common/logger'
import {
  estimateMessagesTokens,
  getModelContextSize,
  computeHardLimit,
  trimToContextWindow,
} from '@/ai/shared/contextWindowManager'

// ---------------------------------------------------------------------------
// Configuration defaults
// ---------------------------------------------------------------------------

const DEFAULT_COMMIT_THRESHOLD = 0.80
const DEFAULT_BLOCKING_THRESHOLD = 0.90
const DEFAULT_KEEP_RECENT_MESSAGES = 10

/** Max tokens for the collapse summary generation call. */
const COLLAPSE_SUMMARY_MAX_TOKENS = 1000

/** Timeout for the summary generation call (ms). */
const COLLAPSE_SUMMARY_TIMEOUT_MS = 15_000

// ---------------------------------------------------------------------------
// Collapse prompt
// ---------------------------------------------------------------------------

const COLLAPSE_SYSTEM_PROMPT = [
  '你是一个对话摘要助手。请对以下对话历史生成增量压缩摘要。',
  '',
  '要求：',
  '- 保留：明确需求、约束、决策、关键事实',
  '- 保留：重要数据、参数、文件路径、命令、接口信息',
  '- 标注：未完成事项与风险',
  '- 格式：精简要点，不展开推理过程',
  '- 控制在 500 字以内',
  '',
  '如果输入中包含之前的摘要（标记为 [Context Collapse]），',
  '请将其与新对话内容合并为一个完整的累积摘要。',
  '',
  '输出格式：',
  '## 摘要',
  '## 关键决策',
  '## 待办',
].join('\n')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollapseSegment {
  /** Collapsed message index range [start, end) — relative to original messages. */
  range: [number, number]
  /** LLM-generated summary text. */
  summary: string
  /** Estimated tokens of the original messages in this segment. */
  originalTokens: number
  /** Estimated tokens of the summary text. */
  summaryTokens: number
  /** Timestamp when this segment was created. */
  createdAt: number
}

export interface CollapseResult {
  /** Messages to send to the model (projection — original is unchanged). */
  messages: ModelMessage[]
  /** Whether a new collapse was performed. */
  collapsed: boolean
  /** Tokens saved by this collapse (0 if not collapsed). */
  tokensSaved: number
}

export interface ContextCollapseOptions {
  /** Trigger collapse when tokens exceed this fraction of context window. Default 0.80. */
  commitThreshold?: number
  /** Force hard trim when tokens exceed this fraction. Default 0.90. */
  blockingThreshold?: number
  /** Number of recent messages to always keep intact. Default 10. */
  keepRecentMessages?: number
  /** Model ID for context window size lookup. */
  modelId?: string
}

// ---------------------------------------------------------------------------
// Message formatting (similar to autoCompact but more concise)
// ---------------------------------------------------------------------------

/** Extract readable text from a model message content part. */
function extractPartText(part: unknown): string | null {
  if (!part || typeof part !== 'object') return null
  const p = part as Record<string, unknown>
  if (typeof p.text === 'string') {
    const text = p.text
    return text.length > 300 ? `${text.slice(0, 300)}...` : text
  }
  if (p.type === 'tool-call') return `[Tool call: ${p.toolName ?? 'unknown'}]`
  if (p.type === 'tool-result') return `[Tool result: ${p.toolName ?? 'unknown'}]`
  return null
}

/** Format model messages into readable text for collapse summarization. */
function formatMessagesForCollapse(messages: ReadonlyArray<ModelMessage>): string {
  const parts: string[] = []
  for (const msg of messages) {
    const role =
      msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role
    const contentParts: string[] = []
    const content = (msg as any).content

    if (Array.isArray(content)) {
      for (const part of content) {
        const text = extractPartText(part)
        if (text) contentParts.push(text)
      }
    } else if (typeof content === 'string') {
      contentParts.push(
        content.length > 300 ? `${content.slice(0, 300)}...` : content,
      )
    }

    if (contentParts.length > 0) {
      parts.push(`${role}: ${contentParts.join(' | ')}`)
    }
  }
  return parts.join('\n\n')
}

// ---------------------------------------------------------------------------
// ContextCollapseManager
// ---------------------------------------------------------------------------

/**
 * Manages incremental, non-destructive context collapse.
 *
 * One instance per agent — persists across multiple prepareStep calls
 * so collapse segments accumulate over the agent's lifetime.
 */
export class ContextCollapseManager {
  private segments: CollapseSegment[] = []
  private commitThreshold: number
  private blockingThreshold: number
  private keepRecentMessages: number
  private modelId?: string

  constructor(options?: ContextCollapseOptions) {
    this.commitThreshold = options?.commitThreshold ?? DEFAULT_COMMIT_THRESHOLD
    this.blockingThreshold = options?.blockingThreshold ?? DEFAULT_BLOCKING_THRESHOLD
    this.keepRecentMessages = options?.keepRecentMessages ?? DEFAULT_KEEP_RECENT_MESSAGES
    this.modelId = options?.modelId
  }

  /** Get the current collapse segments (read-only). */
  getSegments(): ReadonlyArray<CollapseSegment> {
    return this.segments
  }

  /** Clear all collapse segments. */
  clear(): void {
    this.segments = []
  }

  /**
   * Apply context collapse if needed.
   *
   * Returns a CollapseResult containing the projected messages.
   * The original messages array is never mutated.
   */
  async applyIfNeeded(
    messages: ReadonlyArray<ModelMessage>,
    model?: LanguageModelV3,
  ): Promise<CollapseResult> {
    const mutableMessages = [...messages] as ModelMessage[]
    const noopResult: CollapseResult = {
      messages: mutableMessages,
      collapsed: false,
      tokensSaved: 0,
    }

    // Not enough messages to collapse
    if (mutableMessages.length <= this.keepRecentMessages) {
      return noopResult
    }

    const contextSize = getModelContextSize(this.modelId)
    const commitLimit = Math.floor(contextSize * this.commitThreshold)
    const blockingLimit = Math.floor(contextSize * this.blockingThreshold)
    const tokenCount = estimateMessagesTokens(mutableMessages)

    // Below commit threshold — no collapse needed
    if (tokenCount <= commitLimit) {
      return noopResult
    }

    logger.info(
      {
        tokenCount,
        commitLimit,
        blockingLimit,
        contextSize,
        messageCount: mutableMessages.length,
        existingSegments: this.segments.length,
      },
      '[context-collapse] context exceeds commit threshold, attempting collapse',
    )

    // Above blocking threshold with no model — force hard trim
    if (tokenCount > blockingLimit && !model) {
      logger.warn(
        { tokenCount, blockingLimit },
        '[context-collapse] above blocking threshold with no model, falling back to hard trim',
      )
      const trimmed = trimToContextWindow(mutableMessages, { modelId: this.modelId }) as ModelMessage[]
      return {
        messages: trimmed,
        collapsed: true,
        tokensSaved: tokenCount - estimateMessagesTokens(trimmed),
      }
    }

    // No model available — fallback to hard trim
    if (!model) {
      logger.warn(
        { tokenCount, commitLimit },
        '[context-collapse] no model available for summarization, falling back to hard trim',
      )
      const trimmed = trimToContextWindow(mutableMessages, { modelId: this.modelId }) as ModelMessage[]
      return {
        messages: trimmed,
        collapsed: true,
        tokensSaved: tokenCount - estimateMessagesTokens(trimmed),
      }
    }

    // Attempt LLM-based collapse
    try {
      const result = await this.performCollapse(mutableMessages, model)
      return result
    } catch (err) {
      logger.warn(
        { err },
        '[context-collapse] LLM summarization failed, falling back to hard trim',
      )
      const trimmed = trimToContextWindow(mutableMessages, { modelId: this.modelId }) as ModelMessage[]
      return {
        messages: trimmed,
        collapsed: true,
        tokensSaved: tokenCount - estimateMessagesTokens(trimmed),
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async performCollapse(
    messages: ModelMessage[],
    model: LanguageModelV3,
  ): Promise<CollapseResult> {
    const recentMessages = messages.slice(-this.keepRecentMessages)
    const oldMessages = messages.slice(0, -this.keepRecentMessages)

    const beforeTokens = estimateMessagesTokens(messages)

    // Build summarization input: existing summaries + new old messages
    const inputParts: string[] = []

    // Include existing collapse summaries so they get merged
    if (this.segments.length > 0) {
      const existingSummary = this.segments.map((s) => s.summary).join('\n\n---\n\n')
      inputParts.push(`[Context Collapse — 已有摘要]\n\n${existingSummary}`)
    }

    // Format old messages for summarization
    const formattedOld = formatMessagesForCollapse(oldMessages)
    if (formattedOld) {
      inputParts.push(formattedOld)
    }

    const summarizationInput = inputParts.join('\n\n---\n\n')

    // Generate summary via LLM
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), COLLAPSE_SUMMARY_TIMEOUT_MS)

    const result = await generateText({
      model,
      system: COLLAPSE_SYSTEM_PROMPT,
      messages: [{ role: 'user' as const, content: summarizationInput }],
      maxOutputTokens: COLLAPSE_SUMMARY_MAX_TOKENS,
      abortSignal: abortController.signal,
    })

    clearTimeout(timeout)

    const summaryText = result.text?.trim()
    if (!summaryText) {
      logger.warn('[context-collapse] model returned empty summary, keeping original messages')
      return {
        messages: messages,
        collapsed: false,
        tokensSaved: 0,
      }
    }

    // Create summary message
    const summaryMessage: ModelMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `[Context Collapse: 以下为早期对话的累积摘要]\n\n${summaryText}`,
        },
      ],
    }

    // Build new collapsed view
    let collapsed = [summaryMessage, ...recentMessages] as ModelMessage[]

    // Record this segment
    const oldTokens = estimateMessagesTokens(oldMessages)
    const summaryTokens = estimateMessagesTokens([summaryMessage])
    const newSegment: CollapseSegment = {
      range: [0, oldMessages.length],
      summary: summaryText,
      originalTokens: oldTokens,
      summaryTokens,
      createdAt: Date.now(),
    }

    // Replace all existing segments with one merged segment
    this.segments = [newSegment]

    const afterTokens = estimateMessagesTokens(collapsed)
    const tokensSaved = beforeTokens - afterTokens

    logger.info(
      {
        before: beforeTokens,
        after: afterTokens,
        saved: tokensSaved,
        messagesBefore: messages.length,
        messagesAfter: collapsed.length,
        segmentCount: this.segments.length,
      },
      '[context-collapse] collapse complete',
    )

    // Safety net: if collapsed still exceeds hard limit, apply trim
    const hardLimit = computeHardLimit(getModelContextSize(this.modelId))
    if (afterTokens > hardLimit) {
      logger.warn(
        { afterTokens, hardLimit },
        '[context-collapse] collapsed result still exceeds hard limit, applying trim',
      )
      collapsed = trimToContextWindow(collapsed, { modelId: this.modelId }) as ModelMessage[]
    }

    return {
      messages: collapsed,
      collapsed: true,
      tokensSaved: Math.max(0, tokensSaved),
    }
  }
}
