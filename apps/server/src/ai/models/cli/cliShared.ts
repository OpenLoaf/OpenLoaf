/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  LanguageModelV3FinishReason,
  LanguageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider'

// ---------------------------------------------------------------------------
// Provider ID constants
// ---------------------------------------------------------------------------

/** Provider id for Codex CLI. */
export const CODEX_CLI_PROVIDER_ID = 'codex-cli'

/** Provider id for Claude Code CLI. */
export const CLAUDE_CODE_CLI_PROVIDER_ID = 'claude-code-cli'

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** Default empty warnings payload. */
export const EMPTY_WARNINGS: SharedV3Warning[] = []

/** Default finish reason for completed turns. */
export const STOP_FINISH_REASON: LanguageModelV3FinishReason = {
  unified: 'stop',
  raw: 'stop',
}

// ---------------------------------------------------------------------------
// Shared utility functions
// ---------------------------------------------------------------------------

/** Build an empty usage payload when token counts are unavailable. */
export function buildEmptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  }
}

/** Strip ANSI control sequences from CLI output. */
export function stripAnsiControlSequences(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
}

// ---------------------------------------------------------------------------
// AsyncQueue — generic async iterable queue for streaming notifications
// ---------------------------------------------------------------------------

/** Async queue for streaming notifications. */
export class AsyncQueue<T> {
  /** Buffered items. */
  private items: T[] = []
  /** Pending resolvers. */
  private resolvers: Array<(value: IteratorResult<T>) => void> = []
  /** Closed flag. */
  private closed = false

  /** Push a new item into the queue. */
  push(item: T): void {
    if (this.closed) return
    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  /** Close the queue and resolve pending waits. */
  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()
      if (resolver) resolver({ value: undefined as T, done: true })
    }
  }

  /** Create an async iterator for the queue. */
  async *iterate(): AsyncGenerator<T> {
    while (true) {
      if (this.items.length > 0) {
        yield this.items.shift() as T
        continue
      }
      if (this.closed) return
      const item = await new Promise<IteratorResult<T>>((resolve) => {
        this.resolvers.push(resolve)
      })
      if (item.done) return
      yield item.value
    }
  }
}
