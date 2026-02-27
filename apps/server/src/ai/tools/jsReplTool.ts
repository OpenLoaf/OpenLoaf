/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import vm from 'node:vm'
import { tool, zodSchema } from 'ai'
import { jsReplToolDef, jsReplResetToolDef } from '@openloaf/api/types/tools/runtime'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { logger } from '@/common/logger'

const DEFAULT_TIMEOUT_MS = 10_000

type ReplEntry = {
  context: vm.Context
  createdAt: number
}

// 逻辑：按 sessionId 隔离 REPL 上下文，每个 chat session 独立。
const replContexts = new Map<string, ReplEntry>()

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      try {
        return JSON.stringify(arg, null, 2)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

/** Build a fresh sandbox context with safe globals. */
function createSandboxContext(logs: string[]): vm.Context {
  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => logs.push(formatArgs(args)),
      warn: (...args: unknown[]) => logs.push(`[warn] ${formatArgs(args)}`),
      error: (...args: unknown[]) => logs.push(`[error] ${formatArgs(args)}`),
      info: (...args: unknown[]) => logs.push(formatArgs(args)),
      dir: (...args: unknown[]) => logs.push(formatArgs(args)),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Symbol,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    URIError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURI,
    encodeURIComponent,
    decodeURI,
    decodeURIComponent,
    Uint8Array,
    Int8Array,
    Float64Array,
    ArrayBuffer,
    TextEncoder,
    TextDecoder,
    structuredClone,
    URL,
    URLSearchParams,
    atob,
    btoa,
  }
  return vm.createContext(sandbox, { name: 'js-repl-sandbox' })
}

function resolveSessionKey(): string {
  return getSessionId() ?? '__global__'
}

/** Execute JavaScript code in the persistent REPL sandbox. */
export const jsReplTool = tool({
  description: jsReplToolDef.description,
  inputSchema: zodSchema(jsReplToolDef.parameters),
  execute: async (input: string): Promise<string> => {
    // 逻辑：每次执行独立的 logs 数组，避免并发竞争。
    const logs: string[] = []
    const key = resolveSessionKey()

    let entry = replContexts.get(key)
    if (!entry) {
      entry = {
        context: createSandboxContext(logs),
        createdAt: Date.now(),
      }
      replContexts.set(key, entry)
    }

    // 逻辑：更新 console 引用指向本次执行的 logs 数组。
    entry.context.console = {
      log: (...args: unknown[]) => logs.push(formatArgs(args)),
      warn: (...args: unknown[]) => logs.push(`[warn] ${formatArgs(args)}`),
      error: (...args: unknown[]) => logs.push(`[error] ${formatArgs(args)}`),
      info: (...args: unknown[]) => logs.push(formatArgs(args)),
      dir: (...args: unknown[]) => logs.push(formatArgs(args)),
    }

    try {
      const script = new vm.Script(input, { filename: 'repl.js' })
      const result = script.runInContext(entry.context, {
        timeout: DEFAULT_TIMEOUT_MS,
      })

      const sections: string[] = []
      if (logs.length > 0) {
        sections.push(logs.join('\n'))
      }
      if (result !== undefined) {
        const resultStr =
          typeof result === 'string' ? result : formatArgs([result])
        sections.push(`→ ${resultStr}`)
      }
      return sections.join('\n') || '(no output)'
    } catch (err) {
      const sections: string[] = []
      if (logs.length > 0) {
        sections.push(logs.join('\n'))
      }
      const errorMessage =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      sections.push(`Error: ${errorMessage}`)
      logger.warn({ err, sessionKey: key }, '[js-repl] execution error')
      return sections.join('\n')
    }
  },
})

/** Reset the REPL sandbox to a clean state. */
export const jsReplResetTool = tool({
  description: jsReplResetToolDef.description,
  inputSchema: zodSchema(jsReplResetToolDef.parameters),
  execute: async (): Promise<string> => {
    const key = resolveSessionKey()
    replContexts.delete(key)
    logger.info({ sessionKey: key }, '[js-repl] context reset')
    return JSON.stringify({ ok: true, message: 'REPL context has been reset.' })
  },
})
