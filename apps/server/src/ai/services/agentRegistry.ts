/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getSessionId } from '@/ai/shared/context/requestContext'
import { AgentManager } from '@/ai/services/agentManager'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// AgentManagerRegistry — 按 sessionId 分发 AgentManager 实例
// ---------------------------------------------------------------------------

/**
 * AgentManagerRegistry — 按 sessionId 分发 AgentManager 实例。
 *
 * 每个 session 拥有独立的 AgentManager，避免不同 session 的 agent 混在一起。
 * 启动 5 分钟定时器，清理 30 分钟无访问的 session manager。
 */
export class AgentManagerRegistry {
  private managers = new Map<string, { manager: AgentManager; lastAccess: number }>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // 逻辑：每 5 分钟清理 30 分钟无访问的 session manager。
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      const staleThreshold = 30 * 60 * 1000
      for (const [sessionId, entry] of this.managers) {
        if (now - entry.lastAccess > staleThreshold) {
          // 逻辑：清理前检查是否有 running 状态的 Agent，若有则跳过（MAST FM-2.1）。
          if (entry.manager.hasRunningAgents()) {
            entry.lastAccess = now // 刷新时间戳，防止下轮再检查
            logger.info({ sessionId }, '[agent-registry] session has running agents, skipping cleanup')
            continue
          }
          entry.manager.shutdownAll()
          this.managers.delete(sessionId)
          logger.info({ sessionId }, '[agent-registry] stale session cleaned')
        }
      }
    }, 5 * 60 * 1000)
    // 逻辑：不阻止进程退出。
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref()
    }
  }

  /** Get or create an AgentManager for the given sessionId. */
  get(sessionId: string): AgentManager {
    let entry = this.managers.get(sessionId)
    if (!entry) {
      entry = { manager: new AgentManager(), lastAccess: Date.now() }
      this.managers.set(sessionId, entry)
    } else {
      entry.lastAccess = Date.now()
    }
    return entry.manager
  }

  /** Refresh lastAccess for a session without creating it. */
  touchSession(sessionId?: string): void {
    if (!sessionId) return
    const entry = this.managers.get(sessionId)
    if (entry) {
      entry.lastAccess = Date.now()
    }
  }

  /** Shut down and remove a session's manager. */
  remove(sessionId: string): void {
    const entry = this.managers.get(sessionId)
    if (entry) {
      entry.manager.shutdownAll()
      this.managers.delete(sessionId)
    }
  }
}

/** Global agent manager registry (session-isolated). */
export const agentRegistry = new AgentManagerRegistry()

/**
 * Convenience: get the AgentManager for the current session.
 * Falls back to a shared 'global' manager if no sessionId is available.
 */
export function getAgentManager(): AgentManager {
  const sessionId = getSessionId() || '__global__'
  return agentRegistry.get(sessionId)
}

/** @deprecated Use getAgentManager() instead. Kept for backward compatibility. */
export const agentManager = {
  get spawn() { return getAgentManager().spawn.bind(getAgentManager()) },
  get sendInput() { return getAgentManager().sendInput.bind(getAgentManager()) },
  get wait() { return getAgentManager().wait.bind(getAgentManager()) },
  get abort() { return getAgentManager().abort.bind(getAgentManager()) },
  get getStatus() { return getAgentManager().getStatus.bind(getAgentManager()) },
  get getAgent() { return getAgentManager().getAgent.bind(getAgentManager()) },
  get complete() { return getAgentManager().complete.bind(getAgentManager()) },
  get fail() { return getAgentManager().fail.bind(getAgentManager()) },
  get shutdownAll() { return getAgentManager().shutdownAll.bind(getAgentManager()) },
}
