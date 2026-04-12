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

// Shared id constraints: UUID v4 format, regex-validated server-side.
const taskIdSchema = z
  .string()
  .regex(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    'Invalid task_id format',
  )
  .describe('Background task id returned by Bash(run_in_background) or spawnBash.')

export const bgListToolDef = {
  id: 'Jobs',
  readonly: true,
  name: 'List Jobs',
  description: `List background tasks in the current chat session. Running tasks are returned first, then completed/failed/killed. Use this to see what's still running, check exit codes, grab output_path for Read, or pick a task_id to Kill.

Polling Jobs in a loop is an anti-pattern — background completion is auto-delivered to the next turn.`,
  parameters: z.object({}).optional(),
  component: null,
} as const

export const bgKillToolDef = {
  id: 'Kill',
  readonly: false,
  name: 'Kill Job',
  description:
    'Terminate a running background task. Shell tasks are killed via tree-kill (SIGKILL on the whole process tree); agent tasks trigger their AbortController. Safe to call on already-finished tasks. Returns `{ task_id, status: "killed" | "already-done" | "not-found" }`.',
  parameters: z.object({
    task_id: taskIdSchema,
  }),
  component: null,
} as const

export const bgTaskToolMeta = {
  [bgListToolDef.id]: { riskType: RiskType.Read },
  [bgKillToolDef.id]: { riskType: RiskType.Destructive },
} as const
