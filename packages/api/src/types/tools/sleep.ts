/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'
import { RiskType } from '../toolResult'

export const sleepToolDef = {
  id: 'Sleep',
  readonly: true,
  name: '等待/休眠',
  description: `Sleep for a specified number of seconds. Prefer this over Bash(sleep ...) for two reasons:
1. It does not block a shell process or consume a process slot.
2. It declares "I am idle and ready to absorb any pending background task results" — the runtime will surface any completed background tasks at the end of the current turn via a synthetic user message.

Wakes early (before the timeout elapses) when:
- A background task completes and its notification is enqueued → wokenBy = "bg-task-notification"
- The request is aborted → the call rejects

If you are explicitly waiting on a known background task, prefer BgOutput(task_id, block: true) instead — it reads the final output in one call.

Do NOT poll BgList or BgOutput in a busy loop. Use Sleep to relinquish the turn.`,
  parameters: z.object({
    seconds: z
      .number()
      .int()
      .min(1)
      .max(300)
      .describe('How long to sleep, in seconds. Clamped to [1, 300].'),
    reason: z
      .string()
      .optional()
      .describe('Optional human-readable reason for the sleep (for telemetry/ux).'),
  }),
  component: null,
} as const

export const sleepToolMeta = {
  [sleepToolDef.id]: { riskType: RiskType.Read },
} as const
