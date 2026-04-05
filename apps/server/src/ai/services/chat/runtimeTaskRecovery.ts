/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { bulkFailTasks, readRuntimeTaskStore } from './runtimeTaskService'
import { getAgentManager } from '@/ai/services/agentRegistry'
import { logger } from '@/common/logger'

/** Master-owned in_progress tasks older than this are considered stale/interrupted. */
const STALE_IN_PROGRESS_THRESHOLD_MS = 30 * 60 * 1000

/**
 * Reconcile runtime tasks at stream start: mark orphaned in_progress tasks as interrupted.
 *
 * Lazy recovery strategy (called from streamOrchestrator at the start of each stream):
 * - If a task is owned by an agentId that no longer exists in AgentManager → interrupted
 * - If an owner-less (Master-owned) in_progress task has been running for >
 *   STALE_IN_PROGRESS_THRESHOLD_MS → interrupted
 */
export async function reconcileRuntimeTasksOnSessionStart(sessionId: string): Promise<void> {
  try {
    const store = await readRuntimeTaskStore(sessionId)
    const manager = getAgentManager()
    const now = Date.now()
    let orphanCount = 0

    const predicate = (task: Parameters<typeof bulkFailTasks>[1] extends (t: infer T) => boolean ? T : never) => {
      if (task.status !== 'in_progress') return false
      // Owned by sub-agent that's gone?
      if (task.owner?.agentId) {
        const agent = manager.getAgent(task.owner.agentId)
        if (!agent) {
          orphanCount += 1
          return true
        }
        // Agent exists but in terminal state?
        if (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'shutdown') {
          orphanCount += 1
          return true
        }
        return false
      }
      // Master-owned (no sub-agent): use time heuristic.
      if (task.startedAt) {
        const age = now - new Date(task.startedAt).getTime()
        if (age > STALE_IN_PROGRESS_THRESHOLD_MS) {
          orphanCount += 1
          return true
        }
      }
      return false
    }

    if (Object.values(store.tasks).some((t) => predicate(t))) {
      await bulkFailTasks(sessionId, predicate, 'interrupted')
      logger.debug({ sessionId, orphanCount }, '[runtime-task] reconciled orphaned tasks')
    }
  } catch (err) {
    logger.debug({ err, sessionId }, '[runtime-task] reconcile failed, continuing')
  }
}

/**
 * Abort all in_progress tasks for a session (called when user Stops the conversation).
 */
export async function abortSessionRuntimeTasks(sessionId: string): Promise<void> {
  try {
    await bulkFailTasks(sessionId, (task) => task.status === 'in_progress', 'abortedByUser')
  } catch (err) {
    logger.debug({ err, sessionId }, '[runtime-task] abort-session failed')
  }
}
