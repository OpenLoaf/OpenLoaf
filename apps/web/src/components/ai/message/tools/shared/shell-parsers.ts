/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/**
 * Shell output parsers for detecting stack traces and test results.
 */

export type ParsedTestResults = {
  passed: number
  failed: number
  skipped: number
  total: number
  duration?: number
}

// 逻辑：匹配 Node.js / JS 堆栈帧格式 "at ... (file:line:col)" 或 "at file:line:col"
const STACK_FRAME_RE = /^\s+at\s+.+[:(]\d+:\d+\)?/m
// 逻辑：匹配常见错误类型前缀
const ERROR_TYPE_RE =
  /^(Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|AggregateError|AssertionError|ENOENT|EACCES|EPERM|MODULE_NOT_FOUND):/m

/**
 * Detect if output contains a stack trace.
 * Returns the stack trace string if found, null otherwise.
 */
export function detectStackTrace(output: string): string | null {
  if (!output || output.length < 20) return null
  const hasFrame = STACK_FRAME_RE.test(output)
  const hasErrorType = ERROR_TYPE_RE.test(output)
  if (hasFrame && hasErrorType) return output
  // 逻辑：至少 3 个堆栈帧也算堆栈跟踪
  const frameCount = (output.match(/^\s+at\s+/gm) ?? []).length
  if (frameCount >= 3) return output
  return null
}

// 逻辑：匹配 vitest/jest 测试摘要行
const VITEST_SUMMARY_RE =
  /Tests?\s+(\d+)\s+passed.*?(\d+)\s+failed|Tests?\s+(\d+)\s+passed/i
const JEST_SUMMARY_RE =
  /Tests?:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(?:(\d+)\s+passed,?\s*)?(\d+)\s+total/i
const DURATION_RE = /(?:Time|Duration):\s*([\d.]+)\s*(?:s|ms)/i

/**
 * Detect if output contains test results.
 * Returns parsed summary if found, null otherwise.
 */
export function detectTestResults(output: string): ParsedTestResults | null {
  if (!output || output.length < 10) return null

  // 逻辑：尝试 Jest 格式
  const jestMatch = output.match(JEST_SUMMARY_RE)
  if (jestMatch) {
    const failed = Number(jestMatch[1] ?? 0)
    const skipped = Number(jestMatch[2] ?? 0)
    const passed = Number(jestMatch[3] ?? 0)
    const total = Number(jestMatch[4] ?? 0)
    const durationMatch = output.match(DURATION_RE)
    const duration = durationMatch
      ? durationMatch[0].includes('ms')
        ? Number(durationMatch[1])
        : Number(durationMatch[1]) * 1000
      : undefined
    return { passed, failed, skipped, total, duration }
  }

  // 逻辑：尝试 Vitest 格式
  const vitestMatch = output.match(VITEST_SUMMARY_RE)
  if (vitestMatch) {
    const passed = Number(vitestMatch[1] ?? vitestMatch[3] ?? 0)
    const failed = Number(vitestMatch[2] ?? 0)
    const durationMatch = output.match(DURATION_RE)
    const duration = durationMatch
      ? durationMatch[0].includes('ms')
        ? Number(durationMatch[1])
        : Number(durationMatch[1]) * 1000
      : undefined
    const total = passed + failed
    return { passed, failed, skipped: 0, total, duration }
  }

  return null
}
