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
 * Tool execution timeout protection (MAST FM-2.6 / ReliabilityBench).
 *
 * Wraps tool `execute` functions with a timeout that rejects if the tool
 * takes longer than the configured limit, preventing indefinite blocking.
 */

import { logger } from '@/common/logger'

/** Per-category timeout settings (milliseconds). */
const TOOL_TIMEOUT_MAP: Record<string, number> = {
  // Shell 工具 — 进程级超时兜底
  'Bash': 120_000,

  // Browser tools — network-dependent
  'open-url': 60_000,
  'browser-snapshot': 60_000,
  'browser-observe': 60_000,
  'browser-extract': 60_000,
  'browser-act': 60_000,
  'browser-wait': 60_000,

  // Media download — network-dependent
  'video-download': 600_000,

  // Office document tools — ZIP I/O + XML parsing can be slow for large files
  'word-mutate': 120_000,
  'excel-mutate': 120_000,
  'pptx-mutate': 120_000,
  'pdf-mutate': 120_000,
  'word-query': 60_000,
  'excel-query': 60_000,
  'pptx-query': 60_000,
  'pdf-query': 60_000,

  // Agent collaboration — delegates to sub-agents which have their own lifecycle
  'spawn-agent': 10_000,
  'wait-agent': 310_000, // slightly above the max 300s wait timeout
  'send-input': 10_000,
  'abort-agent': 10_000,
}

const DEFAULT_TIMEOUT_MS = 30_000

/** Resolve timeout for a given tool ID. */
function resolveToolTimeout(toolId: string): number {
  return TOOL_TIMEOUT_MAP[toolId] ?? DEFAULT_TIMEOUT_MS
}

/** Wrap a tool's execute function with a timeout. */
export function wrapToolWithTimeout(toolId: string, tool: any): any {
  const originalExecute = tool.execute
  if (typeof originalExecute !== 'function') return tool

  const timeoutMs = resolveToolTimeout(toolId)

  return {
    ...tool,
    execute: async (...args: any[]) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const result = await Promise.race([
          originalExecute(...args),
          new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(
                new Error(
                  `[TOOL_TIMEOUT] Tool "${toolId}" exceeded ${timeoutMs}ms timeout. The operation was cancelled. Try a simpler approach or break the task into smaller steps.`,
                ),
              )
            })
          }),
        ])
        return result
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('[TOOL_TIMEOUT]')) {
          logger.warn({ toolId, timeoutMs }, '[tool-timeout] tool execution timed out')
        }
        throw err
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
