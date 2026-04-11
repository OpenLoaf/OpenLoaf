/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from 'node:path'
import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
  statSync,
} from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import { writeFileAtomic } from './scheduleFileUtils'

const MAX_LOG_LINES = 2000
const KEEP_LOG_LINES = 1500
const MAX_LOG_BYTES = 2_000_000 // 2MB

const OPENLOAF_DIR = '.openloaf'
const TASKS_DIR = 'tasks'
const RUNS_DIR = 'runs'

export type TaskRunLog = {
  id: string
  trigger: string
  triggerData?: unknown
  status: string
  error?: string | null
  agentSessionId?: string | null
  startedAt: string
  finishedAt?: string | null
  durationMs?: number | null
}

/** Resolve runs directory for a given root path. */
function resolveRunsDir(rootPath: string): string {
  return path.join(rootPath, OPENLOAF_DIR, TASKS_DIR, RUNS_DIR)
}

/** Resolve JSONL file path for a task. */
function resolveRunLogPath(rootPath: string, taskId: string): string {
  return path.join(resolveRunsDir(rootPath), `${taskId}.jsonl`)
}

/** Append a run log entry to the JSONL file. */
export function appendRunLog(
  taskId: string,
  entry: Omit<TaskRunLog, 'id'>,
  rootPath: string,
): TaskRunLog {
  const dir = resolveRunsDir(rootPath)
  mkdirSync(dir, { recursive: true })
  const logEntry: TaskRunLog = { id: uuidv4(), ...entry }
  const filePath = resolveRunLogPath(rootPath, taskId)
  appendFileSync(filePath, `${JSON.stringify(logEntry)}\n`, 'utf8')
  rotateIfNeeded(filePath)
  return logEntry
}

/** Rotate the JSONL file if it exceeds size/line limits. */
function rotateIfNeeded(filePath: string): void {
  try {
    if (!existsSync(filePath)) return
    const stats = statSync(filePath)
    if (stats.size < MAX_LOG_BYTES) return

    const content = readFileSync(filePath, 'utf8')
    const lines = content.trim().split('\n').filter(Boolean)
    if (lines.length <= MAX_LOG_LINES) return

    // Keep only the most recent lines
    const kept = lines.slice(-KEEP_LOG_LINES)
    writeFileAtomic(filePath, kept.join('\n') + '\n')
  } catch {
    // Rotation failure is non-critical, skip silently
  }
}

/** Read run logs for a task, most recent first. */
function readRunLogs(
  taskId: string,
  rootPath: string,
  limit = 50,
): TaskRunLog[] {
  const filePath = resolveRunLogPath(rootPath, taskId)
  if (!existsSync(filePath)) return []
  try {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.trim().split('\n').filter(Boolean)
    // 逻辑：倒序读取最近 N 条。
    const entries: TaskRunLog[] = []
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      try {
        entries.push(JSON.parse(lines[i]!) as TaskRunLog)
      } catch {
        // 逻辑：跳过损坏的行。
      }
    }
    return entries
  } catch {
    return []
  }
}

/** Read run logs from both global and project roots. */
export function readRunLogsMultiScope(
  taskId: string,
  globalRoot: string,
  projectRoot?: string | null,
  limit = 50,
): TaskRunLog[] {
  if (projectRoot) {
    const logs = readRunLogs(taskId, projectRoot, limit)
    if (logs.length > 0) return logs
  }
  return readRunLogs(taskId, globalRoot, limit)
}
