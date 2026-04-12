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
import {
  bgListToolDef,
  bgKillToolDef,
} from '@openloaf/api/types/tools/bgTask'
import { getRequestContext } from '@/ai/shared/context/requestContext'
import { backgroundProcessManager } from '@/ai/services/background/BackgroundProcessManager'
import type { BgTaskState } from '@/ai/services/background/types'

/** Require a non-empty sessionId on the ambient request context. Bg tools
 *  are pointless without a session — rejection is safer than defaulting. */
function requireSessionId(): string {
  const ctx = getRequestContext()
  const sessionId = ctx?.sessionId
  if (!sessionId) {
    throw new Error('Background tools require an active chat session.')
  }
  return sessionId
}

/** Reject any attempt to touch a task that doesn't belong to the caller. */
function assertTaskOwnedBySession(task: BgTaskState, sessionId: string): void {
  if (task.sessionId !== sessionId) {
    throw new Error(
      `Task ${task.id} does not belong to this session (cross-session access blocked).`,
    )
  }
}

export const bgListTool = tool({
  description: bgListToolDef.description,
  inputSchema: zodSchema(bgListToolDef.parameters ?? (undefined as any)),
  execute: async () => {
    const sessionId = requireSessionId()
    const tasks = backgroundProcessManager.listBySession(sessionId)
    // Running first, then terminal states sorted by endTime desc.
    const sorted = [...tasks].sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (a.status !== 'running' && b.status === 'running') return 1
      const ae = a.endTime ?? Number.MAX_SAFE_INTEGER
      const be = b.endTime ?? Number.MAX_SAFE_INTEGER
      return be - ae
    })
    return {
      ok: true,
      count: sorted.length,
      tasks: sorted.map((t) => backgroundProcessManager.summarize(t)),
    }
  },
})

export const bgKillTool = tool({
  description: bgKillToolDef.description,
  inputSchema: zodSchema(bgKillToolDef.parameters),
  execute: async ({ task_id }: { task_id: string }) => {
    const sessionId = requireSessionId()
    const task = backgroundProcessManager.get(task_id)
    if (!task) {
      return { ok: false, task_id, status: 'not-found' as const }
    }
    assertTaskOwnedBySession(task, sessionId)
    if (task.status !== 'running') {
      return {
        ok: true,
        task_id,
        description: task.description,
        status: 'already-done' as const,
        previous_status: task.status,
      }
    }
    await backgroundProcessManager.kill(task_id)
    return { ok: true, task_id, description: task.description, status: 'killed' as const }
  },
})
