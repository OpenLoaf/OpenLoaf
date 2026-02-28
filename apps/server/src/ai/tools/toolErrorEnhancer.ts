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
 * Tool error enhancer — structured recovery hints for common errors (MAST FM-2.6).
 *
 * When a tool execution fails, the raw error message is augmented with:
 * - A `[TOOL_ERROR]` tag for structured parsing
 * - A `[RECOVERY_HINT]` with actionable guidance
 * - A `[RETRY_SUGGESTED]` or `[STOP_RETRY]` flag based on consecutive failure count
 *
 * This helps LLMs understand *why* a tool failed and *what to do next*, rather than
 * blindly retrying the same failing operation.
 */

import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Consecutive failure tracking
// ---------------------------------------------------------------------------

type FailureKey = string // `${toolId}:${errorPattern}`
const consecutiveFailures = new Map<FailureKey, { count: number; lastAt: number }>()

const MAX_CONSECUTIVE_FAILURES = 3
const FAILURE_WINDOW_MS = 60_000 // reset counter after 1 minute of no failures

function getFailureKey(toolId: string, errorMsg: string): FailureKey {
  // Normalize error message to a pattern (strip paths, numbers)
  const pattern = errorMsg
    .replace(/\/[\w./\-]+/g, '<path>')
    .replace(/\d+/g, '<n>')
    .slice(0, 100)
  return `${toolId}:${pattern}`
}

function trackFailure(toolId: string, errorMsg: string): number {
  const key = getFailureKey(toolId, errorMsg)
  const now = Date.now()
  const entry = consecutiveFailures.get(key)

  if (entry && now - entry.lastAt < FAILURE_WINDOW_MS) {
    entry.count++
    entry.lastAt = now
    return entry.count
  }

  consecutiveFailures.set(key, { count: 1, lastAt: now })
  return 1
}

/** Reset failure counter for a tool (call on success). */
function resetFailures(toolId: string): void {
  for (const [key] of consecutiveFailures) {
    if (key.startsWith(`${toolId}:`)) {
      consecutiveFailures.delete(key)
    }
  }
}

// ---------------------------------------------------------------------------
// Error pattern → recovery hint mapping
// ---------------------------------------------------------------------------

type RecoveryRule = {
  pattern: RegExp
  hint: string
}

const RECOVERY_RULES: RecoveryRule[] = [
  // File system errors
  {
    pattern: /ENOENT|no such file|not found|does not exist/i,
    hint: '请先用 list-dir 确认路径是否正确，或检查文件名拼写。',
  },
  {
    pattern: /EACCES|permission denied/i,
    hint: '权限不足。检查文件权限或尝试其他路径。',
  },
  {
    pattern: /EISDIR|is a directory/i,
    hint: '目标是目录而非文件。请使用 list-dir 查看目录内容，或指定具体文件路径。',
  },
  {
    pattern: /ENOSPC|no space/i,
    hint: '磁盘空间不足。无法写入更多内容。',
  },
  {
    pattern: /EEXIST|already exists/i,
    hint: '目标已存在。如需覆盖请使用相应参数，或选择其他文件名。',
  },

  // Shell / command errors
  {
    pattern: /command not found|not recognized/i,
    hint: '命令不存在。检查命令名称拼写，或确认该工具是否已安装。',
  },
  {
    pattern: /exit code [1-9]|non-zero exit/i,
    hint: '命令执行失败。请检查命令参数和输出中的错误信息。',
  },
  {
    pattern: /killed|signal.*SIGKILL|SIGTERM/i,
    hint: '进程被终止（可能超时或内存不足）。尝试简化操作或减少数据量。',
  },

  // Network errors
  {
    pattern: /ECONNREFUSED|connection refused/i,
    hint: '连接被拒绝。目标服务可能未启动或端口错误。',
  },
  {
    pattern: /ETIMEDOUT|timeout|timed out/i,
    hint: '操作超时。网络可能不稳定或目标服务响应慢。可以重试或换一个方法。',
  },
  {
    pattern: /ENOTFOUND|DNS|resolve/i,
    hint: '域名解析失败。检查 URL 是否正确。',
  },
  {
    pattern: /fetch failed|network error/i,
    hint: '网络请求失败。检查 URL 和网络连接。',
  },

  // API / auth errors
  {
    pattern: /401|unauthorized|unauthenticated/i,
    hint: '认证失败。需要登录或提供有效凭证。',
  },
  {
    pattern: /403|forbidden/i,
    hint: '无权访问。请确认你有执行此操作的权限。',
  },
  {
    pattern: /404|not found/i,
    hint: '资源不存在。检查 ID 或路径是否正确。',
  },
  {
    pattern: /429|rate limit|too many requests/i,
    hint: '请求频率过高。等待一会儿再重试。',
  },
  {
    pattern: /500|internal server error/i,
    hint: '服务端内部错误。这是外部服务的问题，可以稍后重试。',
  },

  // Agent / tool specific
  {
    pattern: /Max agent spawn depth/i,
    hint: '子代理嵌套层级已达上限。请简化任务或由当前代理直接执行。',
  },
  {
    pattern: /Max concurrent agents/i,
    hint: '并发子代理数已满。等待现有子代理完成后再 spawn 新的。',
  },
  {
    pattern: /Agent.*not found/i,
    hint: '子代理不存在或已被清理。请重新 spawn 一个新的子代理。',
  },
]

function findRecoveryHint(errorMsg: string): string {
  for (const rule of RECOVERY_RULES) {
    if (rule.pattern.test(errorMsg)) {
      return rule.hint
    }
  }
  return '请分析错误原因，考虑换一种方法或用其他工具完成任务。'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Enhance an error message with structured recovery hints. */
export function enhanceToolError(toolId: string, errorMsg: string): string {
  const failureCount = trackFailure(toolId, errorMsg)
  const hint = findRecoveryHint(errorMsg)

  const retryTag =
    failureCount >= MAX_CONSECUTIVE_FAILURES
      ? `[STOP_RETRY] 此工具已连续失败 ${failureCount} 次。请停止重试相同操作，换一种策略或使用其他工具。`
      : '[RETRY_SUGGESTED]'

  return [
    `[TOOL_ERROR] ${toolId}: ${errorMsg}`,
    `[RECOVERY_HINT] ${hint}`,
    retryTag,
  ].join('\n')
}

/** Wrap a tool's execute function with error enhancement. */
export function wrapToolWithErrorEnhancer(toolId: string, tool: any): any {
  const originalExecute = tool.execute
  if (typeof originalExecute !== 'function') return tool

  return {
    ...tool,
    execute: async (...args: any[]) => {
      try {
        const result = await originalExecute(...args)
        // Reset failure counter on success
        resetFailures(toolId)
        return result
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err)

        // Don't double-enhance already enhanced errors
        if (rawMsg.startsWith('[TOOL_ERROR]') || rawMsg.startsWith('[TOOL_TIMEOUT]')) {
          throw err
        }

        const enhanced = enhanceToolError(toolId, rawMsg)
        logger.debug({ toolId, raw: rawMsg }, '[tool-error-enhancer] error enhanced')
        throw new Error(enhanced)
      }
    },
  }
}
