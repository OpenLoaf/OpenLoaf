import path from 'node:path'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

const OPENLOAF_DIR = '.openloaf'
const TASKS_DIR = 'tasks'

export type TaskScope = 'workspace' | 'project'

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

export type TaskConfig = {
  id: string
  name: string
  agentName?: string
  enabled: boolean
  triggerMode: 'scheduled' | 'condition'
  schedule?: ScheduleConfig
  condition?: ConditionConfig
  payload?: Record<string, unknown>
  sessionMode: 'isolated' | 'shared'
  timeoutMs: number
  cooldownMs?: number
  lastRunAt: string | null
  lastStatus: string | null
  lastError: string | null
  runCount: number
  consecutiveErrors: number
  createdAt: string
  updatedAt: string
  scope: TaskScope
  filePath: string
}

/** Resolve tasks directory for a given root path. */
function resolveTasksDir(rootPath: string): string {
  return path.join(rootPath, OPENLOAF_DIR, TASKS_DIR)
}

/** Read a single task JSON file. */
function readTaskFile(filePath: string, scope: TaskScope): TaskConfig | null {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw) as Omit<TaskConfig, 'scope' | 'filePath'>
    return { ...data, scope, filePath }
  } catch {
    return null
  }
}

/** Scan a root's .openloaf/tasks/ directory for task JSON files. */
function scanTasks(rootPath: string, scope: TaskScope): TaskConfig[] {
  const dir = resolveTasksDir(rootPath)
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir, { withFileTypes: true })
  const results: TaskConfig[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const filePath = path.join(dir, entry.name)
    const task = readTaskFile(filePath, scope)
    if (task) results.push(task)
  }
  return results
}

/** List tasks from workspace + optional project roots. */
export function listTasks(
  workspaceRoot: string,
  projectRoot?: string | null,
): TaskConfig[] {
  const tasks: TaskConfig[] = []
  tasks.push(...scanTasks(workspaceRoot, 'workspace'))
  if (projectRoot) {
    tasks.push(...scanTasks(projectRoot, 'project'))
  }
  // 逻辑：按创建时间倒序排列。
  tasks.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  return tasks
}

/** Get a single task by ID. */
export function getTask(
  id: string,
  workspaceRoot: string,
  projectRoot?: string | null,
): TaskConfig | null {
  // 逻辑：先查 project 级，再查 workspace 级。
  if (projectRoot) {
    const filePath = path.join(resolveTasksDir(projectRoot), `${id}.json`)
    const task = readTaskFile(filePath, 'project')
    if (task) return task
  }
  const filePath = path.join(resolveTasksDir(workspaceRoot), `${id}.json`)
  return readTaskFile(filePath, 'workspace')
}

/** Create a new task. */
export function createTask(
  data: Omit<TaskConfig, 'id' | 'createdAt' | 'updatedAt' | 'scope' | 'filePath' | 'runCount' | 'consecutiveErrors' | 'lastRunAt' | 'lastStatus' | 'lastError'>,
  rootPath: string,
  scope: TaskScope,
): TaskConfig {
  const id = uuidv4()
  const now = new Date().toISOString()
  const dir = resolveTasksDir(rootPath)
  mkdirSync(dir, { recursive: true })

  const config: Omit<TaskConfig, 'scope' | 'filePath'> = {
    id,
    name: data.name,
    agentName: data.agentName,
    enabled: data.enabled,
    triggerMode: data.triggerMode,
    schedule: data.schedule,
    condition: data.condition,
    payload: data.payload,
    sessionMode: data.sessionMode ?? 'isolated',
    timeoutMs: data.timeoutMs ?? 600000,
    cooldownMs: data.cooldownMs,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    consecutiveErrors: 0,
    createdAt: now,
    updatedAt: now,
  }

  const filePath = path.join(dir, `${id}.json`)
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8')
  return { ...config, scope, filePath }
}

/** Update an existing task. */
export function updateTask(
  id: string,
  patch: Partial<Omit<TaskConfig, 'id' | 'createdAt' | 'scope' | 'filePath'>>,
  workspaceRoot: string,
  projectRoot?: string | null,
): TaskConfig | null {
  const existing = getTask(id, workspaceRoot, projectRoot)
  if (!existing) return null

  const updated: Omit<TaskConfig, 'scope' | 'filePath'> = {
    ...stripMeta(existing),
    ...stripUndefined(patch),
    updatedAt: new Date().toISOString(),
  }

  writeFileSync(existing.filePath, JSON.stringify(updated, null, 2), 'utf8')
  return { ...updated, scope: existing.scope, filePath: existing.filePath }
}

/** Delete a task by ID. */
export function deleteTask(
  id: string,
  workspaceRoot: string,
  projectRoot?: string | null,
): boolean {
  const existing = getTask(id, workspaceRoot, projectRoot)
  if (!existing) return false
  try {
    unlinkSync(existing.filePath)
    return true
  } catch {
    return false
  }
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
