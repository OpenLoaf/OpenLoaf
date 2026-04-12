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
  'OpenUrl': 60_000,
  'BrowserSnapshot': 60_000,
  'BrowserAct': 60_000,
  'BrowserWait': 60_000,

  // Media download — network-dependent
  'VideoDownload': 600_000,

  // Office document tools — ZIP I/O + XML parsing can be slow for large files
  'WordMutate': 120_000,
  'ExcelMutate': 120_000,
  'PptxMutate': 120_000,
  'PdfMutate': 120_000,
  'WordQuery': 60_000,
  'ExcelQuery': 60_000,
  'PptxQuery': 60_000,
  'PdfQuery': 60_000,

  // Agent collaboration — delegates to sub-agents which have their own lifecycle
  'Agent': 310_000,        // 同步模式需覆盖子 agent 的 5min 超时
  'SendMessage': 30_000,   // 包含可能的 resume 时间
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
