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
 * Tool Result Interceptor — intercepts oversized tool results before they
 * enter the message stream, persisting the full output to disk and replacing
 * it with a truncated preview.
 *
 * Inspired by Claude Code's toolResultStorage.ts pattern.
 * See: .plans/openloaf/docs/backend/context-compression-v2.md (改进一)
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logger } from '@/common/logger'
import { resolveSessionDir } from '@/ai/services/chat/repositories/chatFileStore'
import { TRUNCATED_OUTPUT_TAG } from '@/ai/shared/contextWindowManager'

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Default character threshold for persisting tool results. */
const DEFAULT_PERSISTENCE_THRESHOLD = 30_000 // 30K chars

/** Per-tool threshold overrides. */
const TOOL_PERSISTENCE_OVERRIDES: Record<string, number> = {
  'Bash': 50_000,       // Shell output allowed to be longer
  'Read': 20_000,       // File reads easily exceed threshold
  'WebFetch': 20_000,   // Web page fetches
  'Grep': 20_000,       // Search results
}

/** Tools whose output is metadata/summary — never needs persistence. */
const SKIP_PERSISTENCE_TOOLS = new Set([
  'tool-search',       // Tool search results are metadata
  'Agent',             // Sub-agent results already compressed
  'SendMessage',
  'AskUserQuestion',
  'load-skill',
])

/** Number of preview characters to keep in the message stream. */
const PREVIEW_LENGTH = 2_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterceptionResult {
  /** The (possibly truncated) preview text to use in the message stream. */
  content: string
  /** Whether the result was truncated. */
  truncated: boolean
  /** Full result's disk path (only set when truncated). */
  persistedPath?: string
  /** Original character count. */
  originalLength: number
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/** Get the persistence threshold for a given tool. */
function getThreshold(toolName: string): number {
  return TOOL_PERSISTENCE_OVERRIDES[toolName] ?? DEFAULT_PERSISTENCE_THRESHOLD
}

/** Serialize a tool result to a string for length checking and persistence. */
function resultToString(result: unknown): string {
  if (typeof result === 'string') return result
  if (result == null) return ''
  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

/**
 * Intercept a tool result: if it exceeds the threshold, persist the full
 * output to disk and return a truncated preview wrapped in
 * `<truncated-output>` tags.
 */
export async function interceptToolResult(
  toolName: string,
  toolCallId: string,
  result: unknown,
  sessionId: string,
): Promise<InterceptionResult> {
  const text = resultToString(result)
  const originalLength = text.length

  // Skip tools whose output is inherently small/metadata
  if (SKIP_PERSISTENCE_TOOLS.has(toolName)) {
    return { content: text, truncated: false, originalLength }
  }

  const threshold = getThreshold(toolName)
  if (originalLength <= threshold) {
    return { content: text, truncated: false, originalLength }
  }

  // Persist full result to disk
  let persistedPath: string | undefined
  try {
    const sessionDir = await resolveSessionDir(sessionId)
    const toolResultsDir = path.join(sessionDir, 'tool-results')
    await fs.mkdir(toolResultsDir, { recursive: true })

    // Sanitize toolCallId for use as filename
    const safeId = toolCallId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const filePath = path.join(toolResultsDir, `${safeId}.txt`)
    await fs.writeFile(filePath, text, 'utf-8')
    persistedPath = filePath

    logger.info(
      {
        toolName,
        toolCallId,
        originalLength,
        threshold,
        persistedPath,
      },
      '[tool-result-interceptor] persisted oversized result to disk',
    )
  } catch (err) {
    logger.warn(
      { err, toolName, toolCallId, sessionId },
      '[tool-result-interceptor] failed to persist result, returning full text',
    )
    // Persistence failed — return full text to avoid data loss
    return { content: text, truncated: false, originalLength }
  }

  // Build truncated preview
  const preview = text.slice(0, PREVIEW_LENGTH)
  const pathAttr = persistedPath ? ` path="${persistedPath}"` : ''
  const content = `<${TRUNCATED_OUTPUT_TAG}${pathAttr} original-length="${originalLength}">\n${preview}\n</${TRUNCATED_OUTPUT_TAG}>`

  return {
    content,
    truncated: true,
    persistedPath,
    originalLength,
  }
}

/**
 * Wrap all tool execute functions to intercept oversized results.
 *
 * Should be called after `applyActivationGuard` in the agent factory,
 * so the interception layer is the outermost wrapper.
 */
export function applyToolResultInterception(
  tools: Record<string, any>,
  getSessionId: () => string | undefined,
): void {
  for (const toolId of Object.keys(tools)) {
    if (SKIP_PERSISTENCE_TOOLS.has(toolId)) continue
    const tool = tools[toolId]
    const originalExecute = tool.execute
    if (typeof originalExecute !== 'function') continue

    tools[toolId] = {
      ...tool,
      execute: async (input: any, options: any) => {
        const result = await originalExecute(input, options)
        const sessionId = getSessionId()
        if (!sessionId) return result

        // Only intercept string results (most tools return strings)
        const text = resultToString(result)
        const threshold = getThreshold(toolId)
        if (text.length <= threshold) return result

        const toolCallId = options?.toolCallId ?? `${toolId}_${Date.now()}`
        const interception = await interceptToolResult(
          toolId,
          toolCallId,
          result,
          sessionId,
        )

        if (interception.truncated) {
          return interception.content
        }
        return result
      },
    }
  }
}
