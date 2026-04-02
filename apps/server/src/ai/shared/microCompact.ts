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
 * Time-based microcompact — proactively clear old tool results when
 * the conversation resumes after a long idle gap.
 *
 * Inspired by Claude Code's `timeBasedMicrocompact` pattern.
 *
 * Strategy:
 * 1. Detect the time gap between now and the last assistant message
 * 2. If gap exceeds threshold (default 30 min), collect all compactable tool results
 * 3. Keep the most recent N tool results, replace the rest with a cleared marker
 * 4. Only modify message copies — never mutate the original array
 *
 * This runs in prepareStep (step 0 only), before tryAutoCompact.
 */

import type { ModelMessage } from 'ai'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Tools whose results can be cleared during microcompact. */
const COMPACTABLE_TOOLS = new Set([
  'Read',
  'Grep',
  'Glob',
  'Bash',
  'WebFetch',
  'WebSearch',
  'Edit',
  'Write',
  'JsRepl',
  'BrowserSnapshot',
  'ExcelQuery',
  'office-read',
])

/** Placeholder text that replaces cleared tool results. */
const CLEARED_MESSAGE = '[旧工具结果已清除]'

/** Default configuration. */
const DEFAULT_CONFIG: MicrocompactConfig = {
  gapThresholdMinutes: 30,
  keepRecent: 3,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MicrocompactConfig {
  /** Time gap threshold in minutes before triggering microcompact. */
  gapThresholdMinutes: number
  /** Number of most recent compactable tool results to keep intact. */
  keepRecent: number
}

export interface MicrocompactResult {
  /** Processed messages (deep copy if modified, original reference if unchanged). */
  messages: ModelMessage[]
  /** Number of tool results that were cleared. */
  toolsCleared: number
  /** Number of tool results that were kept. */
  toolsKept: number
  /** Estimated tokens saved by clearing tool results. */
  estimatedTokensSaved: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Describes a compactable tool-result location within the message array.
 * Used to track positions for selective clearing.
 */
interface ToolResultLocation {
  /** Index in the messages array. */
  messageIndex: number
  /** Index in the message's content array. */
  partIndex: number
  /** Tool name for logging. */
  toolName: string
}

/**
 * Check if a content part is a tool-result from a compactable tool.
 */
function isCompactableToolResult(part: unknown): part is {
  type: 'tool-result'
  toolName: string
  result: unknown
} {
  if (!part || typeof part !== 'object') return false
  const p = part as Record<string, unknown>
  return (
    p.type === 'tool-result' &&
    typeof p.toolName === 'string' &&
    COMPACTABLE_TOOLS.has(p.toolName)
  )
}

/**
 * Estimate the token count of a single tool-result part.
 */
function estimatePartTokens(part: { result: unknown }): number {
  const text =
    typeof part.result === 'string' ? part.result : JSON.stringify(part.result ?? '')
  if (!text) return 0
  // Simplified estimation: ~0.4 tokens per ASCII char, ~1.5 per CJK char, 1.15x safety
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const nonCjk = text.length - cjk
  return Math.ceil((cjk * 1.5 + nonCjk * 0.4) * 1.15)
}

/**
 * Deep clone a ModelMessage, preserving its structure.
 */
function cloneMessage(msg: ModelMessage): ModelMessage {
  // Use structured clone for a true deep copy
  return structuredClone(msg)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply time-based microcompact to messages.
 *
 * @param messages - The model messages array (will NOT be mutated)
 * @param lastAssistantTimestamp - Timestamp (ms) of the last assistant message,
 *   extracted from UIMessage.createdAt before model message conversion.
 *   If not provided, microcompact is skipped.
 * @param config - Optional partial config overrides
 * @returns MicrocompactResult with processed messages and stats
 */
export function microcompactMessages(
  messages: ReadonlyArray<ModelMessage>,
  lastAssistantTimestamp?: number | null,
  config?: Partial<MicrocompactConfig>,
): MicrocompactResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const noopResult: MicrocompactResult = {
    messages: [...messages] as ModelMessage[],
    toolsCleared: 0,
    toolsKept: 0,
    estimatedTokensSaved: 0,
  }

  // Guard: no timestamp → skip
  if (!lastAssistantTimestamp) {
    return noopResult
  }

  // Check time gap
  const gapMs = Date.now() - lastAssistantTimestamp
  const gapMinutes = gapMs / (1000 * 60)

  if (gapMinutes < cfg.gapThresholdMinutes) {
    return noopResult
  }

  // Collect all compactable tool-result locations
  const locations: ToolResultLocation[] = []

  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi]
    const content = (msg as any).content
    if (!Array.isArray(content)) continue

    for (let pi = 0; pi < content.length; pi++) {
      const part = content[pi]
      if (isCompactableToolResult(part)) {
        locations.push({
          messageIndex: mi,
          partIndex: pi,
          toolName: part.toolName,
        })
      }
    }
  }

  // Not enough tool results to compact
  if (locations.length <= cfg.keepRecent) {
    return noopResult
  }

  // Keep the last N, clear the rest
  const toClear = locations.slice(0, -cfg.keepRecent)
  const toKeep = locations.slice(-cfg.keepRecent)

  // Build a set of message indices that need cloning
  const messagesToClone = new Set(toClear.map((loc) => loc.messageIndex))

  // Create the output array — clone only affected messages
  const result: ModelMessage[] = []
  const clonedByIndex = new Map<number, ModelMessage>()

  for (let i = 0; i < messages.length; i++) {
    if (messagesToClone.has(i)) {
      const cloned = cloneMessage(messages[i]!)
      clonedByIndex.set(i, cloned)
      result.push(cloned)
    } else {
      result.push(messages[i] as ModelMessage)
    }
  }

  // Apply clearing on cloned messages
  let estimatedTokensSaved = 0

  for (const loc of toClear) {
    const cloned = clonedByIndex.get(loc.messageIndex)
    if (!cloned) continue

    const content = (cloned as any).content
    if (!Array.isArray(content)) continue

    const part = content[loc.partIndex]
    if (part && typeof part === 'object') {
      // Estimate tokens before clearing
      estimatedTokensSaved += estimatePartTokens(part as { result: unknown })

      // Replace the result content with the cleared marker
      ;(part as any).result = CLEARED_MESSAGE
    }
  }

  // Subtract the tokens of the cleared markers themselves
  const clearedMarkerTokens = toClear.length * Math.ceil(CLEARED_MESSAGE.length * 1.5 * 1.15)
  estimatedTokensSaved = Math.max(0, estimatedTokensSaved - clearedMarkerTokens)

  logger.info(
    {
      gapMinutes: Math.round(gapMinutes),
      toolsCleared: toClear.length,
      toolsKept: toKeep.length,
      estimatedTokensSaved,
    },
    '[microcompact] cleared old tool results after idle gap',
  )

  return {
    messages: result,
    toolsCleared: toClear.length,
    toolsKept: toKeep.length,
    estimatedTokensSaved,
  }
}

/**
 * Extract the timestamp (ms) of the last assistant message from UIMessages.
 *
 * Call this BEFORE converting UIMessages to ModelMessages, as the conversion
 * strips the `createdAt` field.
 *
 * @param messages - UIMessage-like objects with optional `createdAt` field
 * @returns Timestamp in milliseconds, or null if not found
 */
export function extractLastAssistantTimestamp(
  messages: ReadonlyArray<{ role: string; createdAt?: string | Date }>,
): number | null {
  // Walk backwards to find the last assistant message with a timestamp
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    if (msg.role === 'assistant' && msg.createdAt) {
      const ts =
        msg.createdAt instanceof Date
          ? msg.createdAt.getTime()
          : new Date(msg.createdAt).getTime()
      if (!Number.isNaN(ts)) return ts
    }
  }
  return null
}
