/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from 'ai'
import { sleepToolDef } from '@openloaf/api/types/tools/sleep'
import { getRequestContext } from '@/ai/shared/context/requestContext'
import { backgroundProcessManager } from '@/ai/services/background/BackgroundProcessManager'

type WakeReason = 'timeout' | 'bg-task-notification'

/**
 * Sleep tool — sync primitive that yields the turn without blocking a shell
 * slot. Implemented as a 3-way race:
 *
 *   1. setTimeout       → wokenBy: 'timeout'
 *   2. abortSignal       → rejects the tool call (caller sees Aborted)
 *   3. bg-task-notification event → wokenBy: 'bg-task-notification'
 *
 * Response latency on abort is 0ms (event-driven, not 1s polling). The timer
 * is unref'd so it cannot keep the Node event loop alive past the request.
 */
export const sleepTool = tool({
  description: sleepToolDef.description,
  inputSchema: zodSchema(sleepToolDef.parameters),
  execute: async ({ seconds, reason }: { seconds: number; reason?: string }) => {
    const ctx = getRequestContext()
    const sessionId = ctx?.sessionId
    if (!sessionId) {
      throw new Error('Sleep tool requires an active chat session.')
    }
    const abortSignal = ctx?.abortSignal
    const startTime = Date.now()

    const wokenBy: WakeReason = await new Promise<WakeReason>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null
      let unsubscribe: (() => void) | null = null
      let abortListener: (() => void) | null = null
      let settled = false

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
        if (abortListener && abortSignal) {
          abortSignal.removeEventListener('abort', abortListener)
          abortListener = null
        }
      }
      const settleResolve = (v: WakeReason) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(v)
      }
      const settleReject = (err: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(err)
      }

      // ── (1) Timeout ────────────────────────────────────────────────────
      timer = setTimeout(() => settleResolve('timeout'), seconds * 1000)
      // Prevent a long sleep from keeping the event loop alive past request lifecycle.
      timer.unref()

      // ── (2) Abort ──────────────────────────────────────────────────────
      if (abortSignal) {
        if (abortSignal.aborted) {
          return settleReject(new Error('Aborted'))
        }
        abortListener = () => settleReject(new Error('Aborted'))
        abortSignal.addEventListener('abort', abortListener, { once: true })
      }

      // ── (3) Bg-task completion ─────────────────────────────────────────
      unsubscribe = backgroundProcessManager.onSessionNotification(sessionId, () => {
        if (backgroundProcessManager.hasPending(sessionId, 'later')) {
          settleResolve('bg-task-notification')
        }
      })

      // Race guard: a notification might have arrived between the caller's
      // last check and our listener registration.
      if (backgroundProcessManager.hasPending(sessionId, 'later')) {
        settleResolve('bg-task-notification')
      }
    })

    // If woken by a bg-task notification, drain those notifications so they
    // don't also appear as a redundant synthetic message at end-of-turn.
    // The AI will use Jobs / Read to inspect results within this same turn.
    if (wokenBy === 'bg-task-notification') {
      backgroundProcessManager.drainNotifications(sessionId, 'later')
    }

    return {
      ok: true as const,
      slept_ms: Date.now() - startTime,
      requested_seconds: seconds,
      reason: reason ?? null,
      wokenBy,
    }
  },
})
