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
  mkdirSync,
  readdirSync,
  rmSync,
  renameSync,
} from 'node:fs'
import { writeFileAtomic } from './taskFileUtils'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/common/logger'

const OPENLOAF_DIR = '.openloaf'
const TASKS_DIR = 'tasks'
const ARCHIVE_DIR = 'archive'

// ─── Types ───────────────────────────────────────────────────────────

export type TaskScope = 'global' | 'project'

export type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'cancelled'

export type ReviewType = 'plan' | 'completion'

export type ScheduleConfig = {
  type: 'once' | 'interval' | 'cron'
  cronExpr?: string
  intervalMs?: number
  scheduleAt?: string
  timezone?: string
}

export type ConditionConfig = {
  type: 'email_received' | 'chat_keyword' | 'file_changed'
  preFilter?: Record<string, unknown>
  rule?: string
}

export type ExecutionSummary = {
  currentStep?: string
  totalSteps?: number
  completedSteps?: number
  lastAgentMessage?: string
}

export type ActivityLogEntry = {
  timestamp: string
  from: TaskStatus
  to: TaskStatus
  reviewType?: ReviewType
  reason?: string
  actor: 'system' | 'user' | 'agent' | 'timeout'
}

export type TaskConfig = {
  id: string
  name: string
  description?: string
  status: TaskStatus
  reviewType?: ReviewType
  priority?: 'urgent' | 'high' | 'medium' | 'low'

  // Trigger mode
  triggerMode: 'manual' | 'scheduled' | 'condition'
  schedule?: ScheduleConfig
  condition?: ConditionConfig

  // Agent config
  agentName?: string
  payload?: Record<string, unknown>

  // Execution config
  sessionMode: 'isolated' | 'shared'
  sessionId?: string
  timeoutMs: number
  cooldownMs?: number

  // Plan confirmation
  planConfirmTimeoutMs: number
  skipPlanConfirm: boolean

  // Supervision & review
  requiresReview: boolean
  autoExecute: boolean

  // Relations
  parentTaskId?: string
  dependsOn?: string[]
  templateId?: string

  // State tracking
  enabled: boolean
  lastRunAt: string | null
  lastStatus: string | null
  lastError: string | null
  runCount: number
  consecutiveErrors: number

  // Execution summary (for card display)
  executionSummary?: ExecutionSummary

  // Activity log (status change history)
  activityLog: ActivityLogEntry[]

  // Chat integration
  /** The chat session that triggered this task (for completion reporting). */
  sourceSessionId?: string
  /** Page context at task creation time (for skill auto-loading during execution). */
  pageContext?: { scope: 'global' | 'project'; page: string; projectId?: string; boardId?: string }

  // Metadata
  createdAt: string
  updatedAt: string
  completedAt?: string
  createdBy: 'user' | 'agent'
  scope: TaskScope
  filePath: string
  projectId?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Resolve tasks directory for a given root path. */
function resolveTasksDir(rootPath: string): string {
  return path.join(rootPath, OPENLOAF_DIR, TASKS_DIR)
}

/** Resolve archive directory for a given root path and date. */
function resolveArchiveDir(rootPath: string, dateStr: string): string {
  return path.join(rootPath, OPENLOAF_DIR, TASKS_DIR, ARCHIVE_DIR, dateStr)
}

/** Read a single task from its directory. */
function readTaskFromDir(taskDir: string, scope: TaskScope): TaskConfig | null {
  try {
    const filePath = path.join(taskDir, 'task.json')
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw) as Omit<TaskConfig, 'scope' | 'filePath'>
    return { ...data, scope, filePath }
  } catch {
    return null
  }
}

/** Scan a root's .openloaf/tasks/ directory for task directories. */
function scanTasks(rootPath: string, scope: TaskScope): TaskConfig[] {
  const dir = resolveTasksDir(rootPath)
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir, { withFileTypes: true })
  const results: TaskConfig[] = []
  for (const entry of entries) {
    // Only scan directories, skip archive and hidden dirs
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIR || entry.name.startsWith('.')) continue
    const taskDir = path.join(dir, entry.name)
    const task = readTaskFromDir(taskDir, scope)
    if (task) results.push(task)
  }
  return results
}

/** Strip scope/filePath metadata for persistence. */
function stripMeta(task: TaskConfig): Omit<TaskConfig, 'scope' | 'filePath'> {
  const { scope: _s, filePath: _f, ...rest } = task
  return rest
}

/** Remove undefined values from a patch object. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value
  }
  return result as Partial<T>
}

// ─── Public API ──────────────────────────────────────────────────────

/** List tasks from global + optional project roots. */
export function listTasks(
  globalRoot: string,
  projectRoots?: string | string[] | null,
): TaskConfig[] {
  const tasks: TaskConfig[] = []
  tasks.push(...scanTasks(globalRoot, 'global'))
  if (projectRoots) {
    const roots = Array.isArray(projectRoots) ? projectRoots : [projectRoots]
    for (const root of roots) {
      tasks.push(...scanTasks(root, 'project'))
    }
  }
  tasks.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  return tasks
}

/** List tasks from global + all projects, attaching projectId to each project task. */
export function listTasksWithProjectMapping(
  globalRoot: string,
  projectRootMapping: Map<string, string>,
): TaskConfig[] {
  const tasks: TaskConfig[] = []
  tasks.push(...scanTasks(globalRoot, 'global'))
  for (const [rootPath, projectId] of projectRootMapping) {
    const projectTasks = scanTasks(rootPath, 'project')
    for (const task of projectTasks) {
      task.projectId = projectId
    }
    tasks.push(...projectTasks)
  }
  tasks.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  return tasks
}

/** List tasks filtered by status. */
export function listTasksByStatus(
  status: TaskStatus | TaskStatus[],
  globalRoot: string,
  projectRoots?: string | string[] | null,
): TaskConfig[] {
  const statuses = Array.isArray(status) ? status : [status]
  return listTasks(globalRoot, projectRoots).filter((t) => statuses.includes(t.status))
}

/** Get a single task by ID. */
export function getTask(
  id: string,
  globalRoot: string,
  projectRoots?: string | string[] | null,
): TaskConfig | null {
  if (projectRoots) {
    const roots = Array.isArray(projectRoots) ? projectRoots : [projectRoots]
    for (const root of roots) {
      const taskDir = path.join(resolveTasksDir(root), id)
      const task = readTaskFromDir(taskDir, 'project')
      if (task) return task
    }
  }
  const taskDir = path.join(resolveTasksDir(globalRoot), id)
  return readTaskFromDir(taskDir, 'global')
}

/** Create input type (fields user/agent must provide). */
export type CreateTaskInput = {
  name: string
  description?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  triggerMode?: 'manual' | 'scheduled' | 'condition'
  schedule?: ScheduleConfig
  condition?: ConditionConfig
  agentName?: string
  payload?: Record<string, unknown>
  sessionMode?: 'isolated' | 'shared'
  timeoutMs?: number
  cooldownMs?: number
  planConfirmTimeoutMs?: number
  skipPlanConfirm?: boolean
  requiresReview?: boolean
  autoExecute?: boolean
  parentTaskId?: string
  dependsOn?: string[]
  enabled?: boolean
  createdBy?: 'user' | 'agent'
  /** The chat session that triggered this task (for completion reporting). */
  sourceSessionId?: string
}

/** Create a new task. */
export function createTask(
  data: CreateTaskInput,
  rootPath: string,
  scope: TaskScope,
): TaskConfig {
  const id = uuidv4()
  const now = new Date().toISOString()
  const taskDir = path.join(resolveTasksDir(rootPath), id)
  mkdirSync(taskDir, { recursive: true })

  // Condition triggers are experimental — log a warning
  if (data.triggerMode === 'condition') {
    logger.warn({ taskName: data.name }, '[task-config] Condition trigger is experimental and not yet implemented in backend')
  }

  const config: Omit<TaskConfig, 'scope' | 'filePath'> = {
    id,
    name: data.name,
    description: data.description,
    status: 'todo',
    priority: data.priority ?? 'medium',
    triggerMode: data.triggerMode ?? 'manual',
    schedule: data.schedule,
    condition: data.condition,
    agentName: data.agentName,
    payload: data.payload,
    sessionMode: data.sessionMode ?? 'isolated',
    timeoutMs: data.timeoutMs ?? 600000,
    cooldownMs: data.cooldownMs,
    planConfirmTimeoutMs: data.planConfirmTimeoutMs ?? 300000,
    skipPlanConfirm: data.skipPlanConfirm ?? false,
    requiresReview: data.requiresReview ?? true,
    autoExecute: data.autoExecute ?? true,
    parentTaskId: data.parentTaskId,
    dependsOn: data.dependsOn,
    enabled: data.enabled ?? true,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    consecutiveErrors: 0,
    activityLog: [{
      timestamp: now,
      from: 'todo',
      to: 'todo',
      actor: (data.createdBy ?? 'user') === 'agent' ? 'agent' : 'user',
      reason: '任务创建',
    }],
    createdAt: now,
    updatedAt: now,
    createdBy: data.createdBy ?? 'user',
    sourceSessionId: data.sourceSessionId,
  }

  const filePath = path.join(taskDir, 'task.json')
  writeFileAtomic(filePath, JSON.stringify(config, null, 2))
  return { ...config, scope, filePath }
}

/** Update an existing task. */
export function updateTask(
  id: string,
  patch: Partial<Omit<TaskConfig, 'id' | 'createdAt' | 'scope' | 'filePath' | 'activityLog'>>,
  globalRoot: string,
  projectRoot?: string | null,
): TaskConfig | null {
  const existing = getTask(id, globalRoot, projectRoot)
  if (!existing) return null

  const updated: Omit<TaskConfig, 'scope' | 'filePath'> = {
    ...stripMeta(existing),
    ...stripUndefined(patch),
    updatedAt: new Date().toISOString(),
  }

  writeFileAtomic(existing.filePath, JSON.stringify(updated, null, 2))
  return { ...updated, scope: existing.scope, filePath: existing.filePath }
}

/** Append an activity log entry to a task. */
export function appendActivityLog(
  id: string,
  entry: Omit<ActivityLogEntry, 'timestamp'>,
  globalRoot: string,
  projectRoot?: string | null,
): boolean {
  const existing = getTask(id, globalRoot, projectRoot)
  if (!existing) return false

  const logEntry: ActivityLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  }

  const data = stripMeta(existing)
  if (!data.activityLog) data.activityLog = []
  data.activityLog.push(logEntry)
  // Keep only the most recent 50 entries to prevent unbounded growth
  if (data.activityLog.length > 50) {
    data.activityLog = data.activityLog.slice(-50)
  }
  data.updatedAt = new Date().toISOString()

  writeFileAtomic(existing.filePath, JSON.stringify(data, null, 2))
  return true
}

/** Update execution summary for a task (progress tracking). */
export function updateExecutionSummary(
  id: string,
  summary: ExecutionSummary,
  globalRoot: string,
  projectRoot?: string | null,
): boolean {
  const existing = getTask(id, globalRoot, projectRoot)
  if (!existing) return false

  const data = stripMeta(existing)
  data.executionSummary = { ...data.executionSummary, ...summary }
  data.updatedAt = new Date().toISOString()

  writeFileAtomic(existing.filePath, JSON.stringify(data, null, 2))
  return true
}

/** Delete a task by ID (removes the entire directory). */
export function deleteTask(
  id: string,
  globalRoot: string,
  projectRoot?: string | null,
): boolean {
  const existing = getTask(id, globalRoot, projectRoot)
  if (!existing) return false
  try {
    const taskDir = path.dirname(existing.filePath)
    rmSync(taskDir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/** Archive a completed task to archive/YYYY-MM-DD/<taskId>/. */
export function archiveTask(
  id: string,
  globalRoot: string,
  projectRoot?: string | null,
): boolean {
  const existing = getTask(id, globalRoot, projectRoot)
  if (!existing || existing.status !== 'done') return false

  try {
    const sourceDir = path.dirname(existing.filePath)
    const dateStr = (existing.completedAt ?? existing.updatedAt).slice(0, 10)
    const rootPath = existing.scope === 'project' && projectRoot ? projectRoot : globalRoot
    const archiveDir = resolveArchiveDir(rootPath, dateStr)
    const destDir = path.join(archiveDir, id)

    mkdirSync(archiveDir, { recursive: true })
    renameSync(sourceDir, destDir)
    return true
  } catch {
    return false
  }
}

/** Find an active PM task for a given project. */
export function findActivePmTask(
  projectId: string,
  globalRoot: string,
  projectRoots?: string | string[] | null,
): TaskConfig | null {
  // Check running tasks first
  const running = listTasksByStatus('running', globalRoot, projectRoots)
    .filter((t) => t.agentName === 'pm' && t.projectId === projectId)
  if (running.length > 0) {
    // Take the most recent
    return running.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0] ?? null
  }
  // Fallback: check queued (todo) tasks
  const queued = listTasksByStatus('todo', globalRoot, projectRoots)
    .filter((t) => t.agentName === 'pm' && t.projectId === projectId)
  if (queued.length > 0) {
    return queued.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0] ?? null
  }
  return null
}

/** Get the task directory path for storing plan.md and chat-history. */
export function getTaskDir(
  id: string,
  globalRoot: string,
  projectRoot?: string | null,
): string | null {
  const existing = getTask(id, globalRoot, projectRoot)
  if (!existing) return null
  return path.dirname(existing.filePath)
}
