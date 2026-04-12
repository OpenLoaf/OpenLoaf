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
 *
 * Conservative ratios to avoid underestimation (which causes API 400 errors):
 * - CJK: ~1.5 tokens per char (unchanged — reasonably accurate)
 * - ASCII: ~0.4 tokens per char (was 0.25 — too low for JSON, code, punctuation)
 *
 * Applied a 1.15x safety multiplier to account for BPE edge cases and
 * structural overhead (role tokens, separators, etc.) that pure text
 * estimation misses.
 */
function estimateTokenCount(text: string): number {
  if (!text) return 0
  // Count CJK characters
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const nonCjkChars = text.length - cjkChars
  // CJK: ~1.5 tokens per char, ASCII: ~0.4 tokens per char (conservative)
  const raw = cjkChars * 1.5 + nonCjkChars * 0.4
  // Safety multiplier to account for BPE edge cases
  return Math.ceil(raw * 1.15)
}

/**
 * Estimate token cost for a single image part.
 *
 * Pricing logic (conservative, per provider docs):
 *
 * OpenAI vision models (gpt-4o, gpt-4-turbo, o1, o3, o4 …):
 *   - low-detail: flat 85 tokens
 *   - high-detail / unknown: 85 base + 170 tokens per 512×512 tile.
 *     A typical "medium" image (≤2048px) uses ~4 tiles → ~765 tokens.
 *     Without resolution info we conservatively assume 4 tiles.
 *
 * Anthropic Claude vision models:
 *   - Approx 1500–1600 tokens for a standard image (per Anthropic docs).
 *
 * Google Gemini:
 *   - Approx 258 tokens per image (fixed, per Gemini docs).
 *
 * Other / unknown models: fall back to 1000 tokens (previous default).
 *
 * Resolution hint: if `part.width` and `part.height` are available (some
 * SDKs surface this), we compute tiles directly. Otherwise we use the
 * per-model default tile assumption.
 */
function estimateImageTokens(part: any, modelId?: string): number {
  const id = (modelId ?? '').toLowerCase()

  // OpenAI / Azure OpenAI vision models
  if (
    id.includes('gpt-4o') ||
    id.includes('gpt-4-turbo') ||
    id.startsWith('o1') ||
    id.startsWith('o3') ||
    id.startsWith('o4')
  ) {
    if (part?.detail === 'low') return 85
    // high-detail: 85 base + 170 per 512×512 tile
    if (part?.width && part?.height) {
      const tilesW = Math.ceil(part.width / 512)
      const tilesH = Math.ceil(part.height / 512)
      return 85 + tilesW * tilesH * 170
    }
    // No resolution info — assume 4 tiles (≤1024×1024 image)
    return 85 + 4 * 170 // 765
  }

  // Anthropic Claude vision models
  if (id.includes('claude')) {
    return 1_500
  }

  // Google Gemini vision models
  if (id.includes('gemini')) {
    return 258
  }

  // Unknown model — conservative fallback (original default)
  return 1_000
}

/** Estimate token count for a message array. */
function estimateMessagesTokens(messages: any[], modelId?: string): number {
  let total = 0
  for (const msg of messages) {
    // Handle both UIMessage (parts) and ModelMessage (content) formats
    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (typeof part === 'string') {
          total += estimateTokenCount(part)
        } else if (part?.type === 'tool-invocation') {
          // Tool invocations include input + output
          total += estimateTokenCount(JSON.stringify(part.input ?? ''))
          total += estimateTokenCount(JSON.stringify(part.output ?? ''))
        } else if (part?.text) {
          total += estimateTokenCount(String(part.text))
        } else if (part?.type === 'image') {
          // Image tokens vary by model and resolution — see estimateImageTokens
          total += estimateImageTokens(part, modelId)
        } else if (part?.type === 'file') {
          // File content — estimate from data length or use fixed fallback
          const data = part.data ?? part.content ?? ''
          total += typeof data === 'string'
            ? estimateTokenCount(data)
            : 500
        } else if (part != null && typeof part === 'object') {
          // Catch-all for unknown part types — JSON serialize to estimate
          total += estimateTokenCount(JSON.stringify(part))
        }
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === 'string') {
          total += estimateTokenCount(part)
        } else if (part?.type === 'image') {
          total += estimateImageTokens(part, modelId)
        } else if (part?.type === 'file') {
          const data = part.data ?? part.content ?? ''
          total += typeof data === 'string'
            ? estimateTokenCount(data)
            : 500
        } else if (part?.type === 'tool-call') {
          total += estimateTokenCount(JSON.stringify(part.args ?? ''))
        } else if (part?.type === 'tool-result') {
          total += estimateTokenCount(JSON.stringify(part.result ?? ''))
        } else if (part?.text) {
          total += estimateTokenCount(String(part.text))
        } else if (part != null && typeof part === 'object') {
          total += estimateTokenCount(JSON.stringify(part))
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
  'gemini-2.5-pro': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
  'gemini-2.0-flash': 1_048_576,
  'gemini-1.5-pro': 1_048_576,
  'gemini-1.5-flash': 1_048_576,
  'claude-sonnet-4': 200_000,
  'claude-opus-4': 200_000,
  'o1': 200_000,
  'o3': 200_000,
  'o3-mini': 200_000,
  'o4-mini': 200_000,
}

const DEFAULT_CONTEXT_SIZE = 128_000

/** Get the context window size for a model. */
function getModelContextSize(modelId?: string): number {
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

// ---------------------------------------------------------------------------
// 工具结果重要度分级 — 按类型差异化压缩 (Anthropic Best Practice)
// ---------------------------------------------------------------------------

/**
 * 工具结果压缩策略：
 * - keep:   协作类工具，保留 500 字符摘要（结果对后续决策至关重要）
 * - summarize: 读取类工具，保留 300 字符摘要（信息可能被引用）
 * - drop:   写入/生成类工具，仅保留状态标签（确认执行即可）
 */
type ToolImportance = 'keep' | 'summarize' | 'drop'

const TOOL_RESULT_IMPORTANCE: Record<string, ToolImportance> = {
  // 协作类 — 子代理结果关键
  'Agent': 'keep',
  'SendMessage': 'keep',
  // 读取类 — 可能被引用
  'Read': 'summarize',
  'Grep': 'summarize',
  'Glob': 'summarize',
  'Bash': 'summarize',
  'ProjectQuery': 'summarize',
  'CalendarQuery': 'summarize',
  'EmailQuery': 'summarize',
  'BrowserSnapshot': 'summarize',
  // 写入/生成类 — 确认即可
  'Edit': 'drop',
  'Write': 'drop',
  'EditDocument': 'drop',
  'GenerateWidget': 'drop',
  'JsxCreate': 'drop',
  'ChartRender': 'drop',
  'ProjectMutate': 'drop',
  'CalendarMutate': 'drop',
  'EmailMutate': 'drop',
  'ExcelQuery': 'summarize',
  'ExcelMutate': 'drop',
}

/** 按工具类型获取结果的截断长度。 */
function getToolResultLimit(toolName: string): number {
  const importance = TOOL_RESULT_IMPORTANCE[toolName]
  if (importance === 'keep') return 500
  if (importance === 'summarize') return 300
  return 0 // drop — 不保留结果内容
}

/** 格式化压缩后的工具调用摘要。 */
function compressToolInvocation(part: { toolName?: string; state?: string; output?: any }): string {
  const toolName = part.toolName || 'unknown-tool'
  const state = part.state || 'unknown'
  const limit = getToolResultLimit(toolName)

  if (limit === 0) {
    return `[Tool: ${toolName} (${state})]`
  }

  // 提取工具输出文本
  let output = ''
  if (part.output != null) {
    output = typeof part.output === 'string'
      ? part.output
      : JSON.stringify(part.output)
  }

  if (!output || output.length <= limit) {
    return output
      ? `[Tool: ${toolName} (${state})]\n${output}`
      : `[Tool: ${toolName} (${state})]`
  }

  return `[Tool: ${toolName} (${state})]\n${output.slice(0, limit)}...`
}

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
          textParts.push(compressToolInvocation(part))
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

// ---------------------------------------------------------------------------
// Tool result interception constants (used by toolResultInterceptor.ts)
// ---------------------------------------------------------------------------

/** XML tag name used to wrap truncated tool output in the message stream. */
export const TRUNCATED_OUTPUT_TAG = 'truncated-output'

/** Placeholder text for cleared (micro-compacted) old tool results. */
export const TOOL_RESULT_CLEARED_MESSAGE = '[旧工具结果已清除]'

/** Re-export for use by autoCompact and other modules. */
export { estimateMessagesTokens, getModelContextSize, computeHardLimit }

/**
 * Compute the hard token limit for a given context size.
 *
 * Strategy:
 * - Models ≤ 200K or unknown: hard limit = 120K (leave room for system prompt + response)
 *   Capped at contextSize - 2K for very small models (e.g. GPT-4 8K)
 * - Models > 200K (e.g. 1M): hard limit = 85% of context size
 */
function computeHardLimit(contextSize: number): number {
  if (contextSize > 200_000) {
    return Math.floor(contextSize * 0.85)
  }
  return Math.min(120_000, contextSize - 2_000)
}

/**
 * Trim model messages to fit within context window.
 *
 * Call this after `buildModelMessages()` and before passing to the model.
 * Returns the (possibly compressed) message array.
 *
 * Three-pass strategy:
 * 1. Heuristic compression (truncate old messages to summaries)
 * 2. Progressive drop (remove oldest messages one-by-one)
 * 3. Hard tail-keep (keep only the most recent N messages that fit)
 */
export function trimToContextWindow(
  messages: any[],
  options?: { modelId?: string },
): any[] {
  const modelId = options?.modelId
  const contextSize = getModelContextSize(modelId)
  const threshold = Math.floor(contextSize * COMPRESSION_THRESHOLD)
  const hardLimit = computeHardLimit(contextSize)
  const tokenCount = estimateMessagesTokens(messages, modelId)

  if (tokenCount <= threshold) return messages

  logger.info(
    { tokenCount, threshold, contextSize, messageCount: messages.length },
    '[context-window] messages exceed threshold, compressing',
  )

  // Pass 1: Heuristic compression (summarize old messages)
  let result = compressMessages(messages)
  let newTokenCount = estimateMessagesTokens(result, modelId)

  // Pass 2: Progressive drop — remove oldest non-summary messages until under hard limit
  if (newTokenCount > hardLimit && result.length > 2) {
    logger.warn(
      { tokenCount: newTokenCount, hardLimit },
      '[context-window] pass 1 insufficient, progressively dropping old messages',
    )
    // Keep the first message (summary) and progressively remove from index 1
    while (newTokenCount > hardLimit && result.length > 2) {
      result.splice(1, 1)
      newTokenCount = estimateMessagesTokens(result, modelId)
    }
  }

  // Pass 3: Hard tail-keep — if still over, keep only the last N messages that fit
  if (newTokenCount > hardLimit && result.length > 1) {
    logger.warn(
      { tokenCount: newTokenCount, hardLimit, remaining: result.length },
      '[context-window] pass 2 insufficient, applying hard tail-keep',
    )
    const kept: any[] = []
    let keptTokens = 0
    // Walk backwards, adding messages until we'd exceed the limit
    for (let i = result.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([result[i]], modelId)
      if (keptTokens + msgTokens > hardLimit) break
      kept.unshift(result[i])
      keptTokens += msgTokens
    }
    // Always keep at least the last message
    result = kept.length > 0 ? kept : [result[result.length - 1]]
    newTokenCount = estimateMessagesTokens(result, modelId)
  }

  logger.info(
    {
      before: tokenCount,
      after: newTokenCount,
      saved: tokenCount - newTokenCount,
      messagesBefore: messages.length,
      messagesAfter: result.length,
    },
    '[context-window] compression complete',
  )

  return result
}
