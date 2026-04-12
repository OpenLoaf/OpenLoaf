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
  .describe('Background task id returned by Bash(run_in_background) or spawnBash')

export const bgListToolDef = {
  id: 'Jobs',
  readonly: true,
  name: '后台进程列表',
  description: `List all background tasks in the current chat session. Returns task summaries (id, kind, status, description, pid/agentId, startTime, exitCode).

Use this to:
- See what's still running in the background
- Check exit codes of recently-finished tasks
- Pick a task_id before calling Tail or Kill

Returns running tasks first, then completed/failed/killed ones. Only tasks from the current session are returned — you cannot see other sessions' processes.

If you just want to wait for a known task, prefer Tail(task_id, block: true). Polling Jobs in a loop is an anti-pattern — background completion is auto-delivered to the next turn.`,
  parameters: z.object({}).optional(),
  component: null,
} as const

export const bgOutputToolDef = {
  id: 'Tail',
  readonly: true,
  name: '读取后台进程输出',
  description: `Read output from a background task, optionally blocking until it completes.

Modes:
- block: false (default) — Return whatever output has been produced so far without waiting. Useful for peeking at progress.
- block: true — Wait until the task reaches a terminal state (completed/failed/killed) or \`timeout_ms\` elapses, then read the final output.

Offsets are tracked server-side: each call returns only the bytes written since the previous read. The first call returns from offset 0.

Returns:
- content: UTF-8 string (capped at 1 MiB per call; use multiple calls to drain a large log)
- status: running | completed | failed | killed
- exit_code: present after terminal state
- is_final: true once status ≠ running
- truncated: true if more data was available than this call returned (call again to drain)

Do NOT poll this tool in a tight loop. For "wait for X and then do Y" use block: true.`,
  parameters: z.object({
    task_id: taskIdSchema,
    block: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, wait for the task to finish before reading.'),
    timeout_ms: z
      .number()
      .int()
      .min(1000)
      .max(600_000)
      .optional()
      .default(60_000)
      .describe('Max wait time when block=true. Clamped to [1s, 600s].'),
  }),
  component: null,
} as const

export const bgKillToolDef = {
  id: 'Kill',
  readonly: false,
  name: '终止后台进程',
  description: `Terminate a running background task. Shell tasks are killed via tree-kill (SIGKILL on the whole process tree). Agent tasks trigger their AbortController, which cancels at the next await point.

Safe to call on tasks that already finished — returns status: already-done in that case.

Returns:
- task_id: echoed back
- status: killed | already-done | not-found`,
  parameters: z.object({
    task_id: taskIdSchema,
  }),
  component: null,
} as const

export const bgTaskToolMeta = {
  [bgListToolDef.id]: { riskType: RiskType.Read },
  [bgOutputToolDef.id]: { riskType: RiskType.Read },
  [bgKillToolDef.id]: { riskType: RiskType.Destructive },
} as const
