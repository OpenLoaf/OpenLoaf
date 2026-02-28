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
  'spawn-agent': 'keep',
  'wait-agent': 'keep',
  'send-input': 'keep',
  // 读取类 — 可能被引用
  'read-file': 'summarize',
  'grep-files': 'summarize',
  'list-dir': 'summarize',
  'shell-command': 'summarize',
  'shell': 'summarize',
  'exec-command': 'summarize',
  'js-repl': 'summarize',
  'project-query': 'summarize',
  'calendar-query': 'summarize',
  'email-query': 'summarize',
  'browser-extract': 'summarize',
  'browser-snapshot': 'summarize',
  // 写入/生成类 — 确认即可
  'apply-patch': 'drop',
  'edit-document': 'drop',
  'write-stdin': 'drop',
  'image-generate': 'drop',
  'video-generate': 'drop',
  'generate-widget': 'drop',
  'jsx-create': 'drop',
  'chart-render': 'drop',
  'project-mutate': 'drop',
  'calendar-mutate': 'drop',
  'email-mutate': 'drop',
  'office-execute': 'drop',
  'abort-agent': 'drop',
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
