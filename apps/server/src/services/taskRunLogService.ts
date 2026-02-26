import path from 'node:path'
import {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
} from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

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
  return logEntry
}

/** Read run logs for a task, most recent first. */
export function readRunLogs(
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

/** Read run logs from both workspace and project roots. */
export function readRunLogsMultiScope(
  taskId: string,
  workspaceRoot: string,
  projectRoot?: string | null,
  limit = 50,
): TaskRunLog[] {
  // 逻辑：先查 project 级，再查 workspace 级。
  if (projectRoot) {
    const logs = readRunLogs(taskId, projectRoot, limit)
    if (logs.length > 0) return logs
  }
  return readRunLogs(taskId, workspaceRoot, limit)
}
