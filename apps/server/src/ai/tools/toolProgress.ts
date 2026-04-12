/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Generic tool progress streaming helper.
 *
 * Allows any tool to emit real-time progress events to the UI via the SSE
 * stream while still returning a complete result string to the LLM.
 *
 * Usage:
 *   import { createToolProgress } from './toolProgress'
 *
 *   execute: async (input, { toolCallId }) => {
 *     const progress = createToolProgress(toolCallId, 'MyTool')
 *     progress.start('Processing...')
 *     progress.delta('Step 1 result\n')
 *     progress.done('Complete')
 *     return fullResult
 *   }
 */
import { getUiWriter } from '@/ai/shared/context/requestContext'

export type ToolProgressEmitter = {
  /** Emit when tool execution starts. */
  start(label: string, meta?: Record<string, unknown>): void
  /** Emit incremental text content during execution. */
  delta(text: string, meta?: Record<string, unknown>): void
  /** Emit when tool execution completes successfully. */
  done(summary: string, meta?: Record<string, unknown>): void
  /** Emit when tool execution fails. */
  error(errorText: string): void
}

/**
 * Create a progress emitter bound to a specific tool call.
 *
 * If the UI writer is unavailable (tests, background context), all methods
 * become silent no-ops — the tool still works, it just won't stream progress.
 */
export function createToolProgress(
  toolCallId: string,
  toolName: string,
): ToolProgressEmitter {
  const writer = getUiWriter()

  function emit(event: string, payload: Record<string, unknown>) {
    if (!writer) return
    writer.write({
      type: 'data-tool-progress',
      data: { toolCallId, toolName, event, ...payload },
    // biome-ignore lint/suspicious/noExplicitAny: UIMessageStreamWriter generic requires exact chunk type
    } as any)
  }

  return {
    start(label, meta) {
      emit('start', { label, ...(meta ? { meta } : {}) })
    },
    delta(text, meta) {
      emit('delta', { text, ...(meta ? { meta } : {}) })
    },
    done(summary, meta) {
      emit('done', { summary, ...(meta ? { meta } : {}) })
    },
    error(errorText) {
      emit('error', { errorText })
    },
  }
}
