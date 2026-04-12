/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

export type BgTaskStatus = 'running' | 'completed' | 'failed' | 'killed'
export type BgNotificationPriority = 'next' | 'later'

type BgTaskBase = {
  id: string
  sessionId: string
  status: BgTaskStatus
  description: string
  ownerAgentId?: string
  startTime: number
  endTime?: number
  notified: boolean
}

export type BgShellTaskState = BgTaskBase & {
  kind: 'shell'
  pid: number
  command: string
  outputPath: string
  outputOffset: number
  exitCode?: number
  interrupted?: boolean
}

export type BgAgentTaskState = BgTaskBase & {
  kind: 'agent'
  agentId: string
  prompt: string
  abortController: AbortController
  progress?: {
    toolUseCount: number
    tokenCount: number
    lastTool?: string
  }
  result?: string
  error?: string
}

export type BgTaskState = BgShellTaskState | BgAgentTaskState

/**
 * Metadata file persisted to disk for orphan process recovery.
 * Written on spawn, deleted on finalize. Server startup scans these to reap
 * processes left behind by a crashed parent.
 */
export type BgTaskMetaFile = {
  id: string
  kind: 'shell' | 'agent'
  sessionId: string
  pid?: number
  startedAt: number
  ownerAgentId?: string
  serverPid: number
}

/**
 * Background task completion notification. Inner XML is wrapped with
 * `<system-reminder>` by streamOrchestrator before injection as a synthetic
 * user message (P2).
 */
export type BgNotification = {
  taskId: string
  priority: BgNotificationPriority
  xmlContent: string
  enqueuedAt: number
}

/** Summary shape exposed to Jobs tool (stripped of runtime-only fields). */
export type BgTaskSummary = {
  id: string
  kind: 'shell' | 'agent'
  status: BgTaskStatus
  description: string
  startTime: number
  endTime?: number
  pid?: number
  command?: string
  outputPath?: string
  agentId?: string
  exitCode?: number
}
