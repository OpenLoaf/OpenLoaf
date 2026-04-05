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
  computeHardLimit,
  trimToContextWindow,
} from '@/ai/shared/contextWindowManager'
import { formatMessagesAsText } from '@/ai/shared/messageFormatting'
import { getPlanUpdate } from '@/ai/shared/context/requestContext'

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
  '- 保留：如果对话中存在 UpdatePlan 工具调用或计划（plan），必须在摘要中完整保留当前计划的步骤列表和每步状态（pending/in_progress/completed/failed）',
  '- 格式：精简要点，不展开推理过程',
  '',
  '输出格式：',
  '## 摘要',
  '## 关键决策',
  '## 待办',
  '## 当前计划（如有）',
  '## 涉及文件',
].join('\n')

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

  // No model available — fall back to hard trim (heuristic compression)
  if (!model) {
    logger.warn(
      { tokenCount, threshold },
      '[auto-compact] context exceeds threshold but no model available, falling back to hard trim',
    )
    return trimToContextWindow(mutableMessages, { modelId }) as ModelMessage[]
  }

  logger.info(
    { tokenCount, threshold, contextSize, messageCount: mutableMessages.length },
    '[auto-compact] context exceeds threshold, generating summary',
  )

  try {
    const recentMessages = mutableMessages.slice(-KEEP_RECENT_MESSAGES)
    const oldMessages = mutableMessages.slice(0, -KEEP_RECENT_MESSAGES)
    const formattedOld = formatMessagesAsText(oldMessages, 500)

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

    let summaryText = result.text?.trim()
    if (!summaryText) {
      logger.warn('[auto-compact] model returned empty summary, keeping original messages')
      return mutableMessages
    }

    // 硬注入当前活跃 plan 状态，不依赖 LLM 保留。
    const currentPlan = getPlanUpdate()
    if (currentPlan && Array.isArray(currentPlan.plan) && currentPlan.plan.length > 0) {
      const planLines = currentPlan.plan
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s, i) => `${i + 1}. ${s}`)
      if (planLines.length > 0) {
        summaryText += `\n\n## 当前计划\n\n${currentPlan.actionName ?? '计划'}\n\n${planLines.join('\n')}`
      }
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

    let compacted = [summaryMessage, ...recentMessages] as ModelMessage[]
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

    // Safety net: if LLM summary + recent messages still exceed context, hard trim
    const hardLimit = computeHardLimit(contextSize)
    if (newTokenCount > hardLimit) {
      logger.warn(
        { newTokenCount, hardLimit },
        '[auto-compact] compacted result still exceeds hard limit, applying trim',
      )
      compacted = trimToContextWindow(compacted, { modelId }) as ModelMessage[]
    }

    return compacted
  } catch (err) {
    // Graceful fallback — summarization failed, apply hard trim as safety net
    logger.warn({ err }, '[auto-compact] summarization failed, falling back to hard trim')
    return trimToContextWindow(mutableMessages, { modelId }) as ModelMessage[]
  }
}
