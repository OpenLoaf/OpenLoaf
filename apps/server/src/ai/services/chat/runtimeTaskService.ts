/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  runtimeTaskStoreSchema,
  RUNTIME_TASK_LIMITS,
  RUNTIME_TASK_METADATA_KEYS,
  type RuntimeTask,
  type RuntimeTaskStore,
  type RuntimeTaskOwner,
  type RuntimeTaskStatus,
  type RuntimeTaskFailReason,
  type RuntimeTaskSseEvent,
} from '@openloaf/api/types/tools/runtimeTask'
import { resolveSessionDir } from '@/ai/services/chat/repositories/chatFileStore'
import { writeFileAtomic } from '@/services/taskFileUtils'
import { getUiWriter } from '@/ai/shared/context/requestContext'
import { logger } from '@/common/logger'

const RUNTIME_TASKS_FILENAME = 'runtime_tasks.json'

// ---------------------------------------------------------------------------
// Path-level Mutex Registry
// ---------------------------------------------------------------------------
// Keyed by absolute session_dir path to prevent races when the same
// session is held by multiple in-memory instances.

const mutexRegistry = new Map<string, Promise<void>>()

/**
 * Single-process mutex keyed by absolute path. Serializes readers+writers
 * accessing the same runtime_tasks.json. Does NOT protect against
 * cross-process concurrency (acceptable: single-process Node.js server).
 */
async function withPathLock<T>(absPath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(absPath)
  const prev = mutexRegistry.get(key) ?? Promise.resolve()
  let release: () => void = () => {}
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  const chain = prev.then(() => next)
  mutexRegistry.set(key, chain)
  await prev
  try {
    return await fn()
  } finally {
    release()
    // Clean up registry only if no later waiter has replaced us as the tail.
    if (mutexRegistry.get(key) === chain) {
      mutexRegistry.delete(key)
    }
  }
}

// ---------------------------------------------------------------------------
// activeForm in-memory store (not persisted)
// ---------------------------------------------------------------------------

const activeFormStore = new Map<string, Map<string, string>>()

function getActiveFormMap(sessionId: string): Map<string, string> {
  let map = activeFormStore.get(sessionId)
  if (!map) {
    map = new Map()
    activeFormStore.set(sessionId, map)
  }
  return map
}

export function setActiveForm(sessionId: string, taskId: string, text: string): void {
  getActiveFormMap(sessionId).set(taskId, text)
}

export function getActiveForm(sessionId: string, taskId: string): string | undefined {
  return activeFormStore.get(sessionId)?.get(taskId)
}

export function clearActiveForm(sessionId: string, taskId: string): void {
  activeFormStore.get(sessionId)?.delete(taskId)
}

export function clearSessionActiveForms(sessionId: string): void {
  activeFormStore.delete(sessionId)
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

async function resolveTaskFilePath(sessionId: string): Promise<string> {
  const sessionDir = await resolveSessionDir(sessionId)
  const filePath = path.join(sessionDir, RUNTIME_TASKS_FILENAME)
  // Path traversal guard: ensure the resolved file path stays within the session dir.
  const resolved = path.resolve(filePath)
  const dirResolved = path.resolve(sessionDir)
  if (!resolved.startsWith(dirResolved + path.sep) && resolved !== path.join(dirResolved, RUNTIME_TASKS_FILENAME)) {
    throw new Error('runtime_tasks.json path escaped session directory')
  }
  return resolved
}

function createEmptyStore(): RuntimeTaskStore {
  return { highWaterMark: 0, seq: 0, tasks: {} }
}

async function readStoreFromDisk(filePath: string): Promise<RuntimeTaskStore> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code
    if (code === 'ENOENT') return createEmptyStore()
    throw err
  }
  try {
    const parsed = JSON.parse(raw)
    const result = runtimeTaskStoreSchema.safeParse(parsed)
    if (!result.success) {
      // Backup corrupted file and start fresh.
      const brokenPath = `${filePath}.broken.${Date.now()}`
      await fs.rename(filePath, brokenPath).catch(() => {})
      logger.warn({ filePath, issues: result.error.issues }, '[runtime-task] store schema invalid, backed up')
      return createEmptyStore()
    }
    return result.data
  } catch (err) {
    logger.warn({ err, filePath }, '[runtime-task] failed to parse store, resetting')
    const brokenPath = `${filePath}.broken.${Date.now()}`
    await fs.rename(filePath, brokenPath).catch(() => {})
    return createEmptyStore()
  }
}

function writeStoreToDisk(filePath: string, store: RuntimeTaskStore): void {
  writeFileAtomic(filePath, JSON.stringify(store, null, 2))
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function nowIso(): string {
  return new Date().toISOString()
}

function isTerminal(status: RuntimeTaskStatus): boolean {
  return status === 'completed' || status === 'failed'
}

/** State machine: which transitions are legal. */
function isLegalTransition(from: RuntimeTaskStatus, to: RuntimeTaskStatus | 'deleted'): boolean {
  if (to === 'deleted') return true // any state may be deleted
  switch (from) {
    case 'pending':
      return to === 'in_progress' || to === 'failed' || to === 'pending'
    case 'in_progress':
      return to === 'completed' || to === 'failed' || to === 'pending'
    case 'completed':
    case 'failed':
      return false
  }
}

/** Validate metadata against the whitelist + size limit. */
function validateMetadata(
  metadata: Record<string, unknown> | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!metadata) return { ok: true }
  for (const key of Object.keys(metadata)) {
    if (!(RUNTIME_TASK_METADATA_KEYS as readonly string[]).includes(key)) {
      return { ok: false, reason: `metadata key "${key}" not in whitelist: ${RUNTIME_TASK_METADATA_KEYS.join(', ')}` }
    }
  }
  const size = Buffer.byteLength(JSON.stringify(metadata), 'utf-8')
  if (size > RUNTIME_TASK_LIMITS.MAX_METADATA_BYTES) {
    return { ok: false, reason: `metadata exceeds ${RUNTIME_TASK_LIMITS.MAX_METADATA_BYTES} bytes` }
  }
  return { ok: true }
}

/**
 * DFS cycle detection: returns true if adding `blockedBy` edges to `newTaskId`
 * creates a cycle OR exceeds MAX_DEPENDENCY_DEPTH (treated as unsafe/potentially cyclic).
 */
function detectCycle(
  tasks: Record<string, RuntimeTask>,
  newTaskId: string,
  newBlockedBy: string[],
): boolean {
  // Start from newTaskId's dependencies: can we reach newTaskId via blockedBy chain?
  const visited = new Set<string>()
  // Track depth via parallel stack.
  const stack: { id: string; depth: number }[] = newBlockedBy.map((id) => ({ id, depth: 1 }))
  while (stack.length > 0) {
    const { id, depth } = stack.pop()!
    if (id === newTaskId) return true
    if (depth > RUNTIME_TASK_LIMITS.MAX_DEPENDENCY_DEPTH) return true
    if (visited.has(id)) continue
    visited.add(id)
    const task = tasks[id]
    if (!task) continue
    for (const dep of task.blockedBy) stack.push({ id: dep, depth: depth + 1 })
  }
  return false
}

/** Compute which tasks are now unlocked after `completedTaskId` finished. */
function computeUnlockedTasks(
  tasks: Record<string, RuntimeTask>,
  completedTaskId: string,
): string[] {
  const completed = tasks[completedTaskId]
  if (!completed) return []
  const unlocked: string[] = []
  for (const downstreamId of completed.blocks) {
    const downstream = tasks[downstreamId]
    if (!downstream) continue
    if (downstream.status !== 'pending') continue
    // All blockedBy must be in terminal 'completed' state (not just any terminal).
    const allDone = downstream.blockedBy.every((depId) => {
      const dep = tasks[depId]
      return dep && dep.status === 'completed'
    })
    if (allDone) unlocked.push(downstreamId)
  }
  return unlocked
}

// ---------------------------------------------------------------------------
// SSE event emission
// ---------------------------------------------------------------------------

function emitSseEvent(event: RuntimeTaskSseEvent): void {
  const writer = getUiWriter()
  if (!writer) return
  try {
    writer.write({
      type: 'data-runtime-task',
      data: event as unknown as Record<string, unknown>,
      transient: true,
    } as never)
  } catch (err) {
    logger.debug({ err }, '[runtime-task] failed to emit SSE event')
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CreateTaskInput = {
  subject: string
  description?: string
  blockedBy?: string[]
}

export type UpdateTaskInput = {
  subject?: string
  description?: string
  activeForm?: string
  status?: RuntimeTaskStatus | 'deleted'
  addBlockedBy?: string[]
  metadata?: Record<string, unknown>
  owner?: RuntimeTaskOwner // Server-injected only, not from AI
  failReason?: RuntimeTaskFailReason // Server-injected only, not from AI
}

export type CreateTaskResult = { ok: true; task: RuntimeTask } | { ok: false; error: string }
export type UpdateTaskResult =
  | { ok: true; task: RuntimeTask; unlockedTasks: string[] }
  | { ok: false; error: string }

/** Create a new runtime task. */
export async function createRuntimeTask(
  sessionId: string,
  input: CreateTaskInput,
): Promise<CreateTaskResult> {
  const filePath = await resolveTaskFilePath(sessionId)
  return withPathLock(filePath, async () => {
    const store = await readStoreFromDisk(filePath)
    const snapshot = deepClone(store)

    // Enforce session-wide task count limit.
    const taskCount = Object.keys(store.tasks).length
    if (taskCount >= RUNTIME_TASK_LIMITS.MAX_TASKS_PER_SESSION) {
      return { ok: false, error: `Reached max ${RUNTIME_TASK_LIMITS.MAX_TASKS_PER_SESSION} tasks per session. Delete completed tasks or reuse existing ones.` }
    }

    // Allocate ID.
    const existingIds = Object.keys(store.tasks).map((s) => Number.parseInt(s, 10)).filter((n) => !Number.isNaN(n))
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0
    const newId = String(Math.max(maxId, store.highWaterMark) + 1)

    // Validate blockedBy references.
    const blockedBy = input.blockedBy ?? []
    for (const depId of blockedBy) {
      if (!store.tasks[depId]) {
        return { ok: false, error: `blockedBy references non-existent task: ${depId}` }
      }
    }

    // Cycle detection.
    if (detectCycle(store.tasks, newId, blockedBy)) {
      return { ok: false, error: 'Creating this task would introduce a dependency cycle. Revise blockedBy.' }
    }

    // Construct new task.
    const now = nowIso()
    const newTask: RuntimeTask = {
      id: newId,
      subject: input.subject,
      description: input.description,
      status: 'pending',
      createdAt: now,
      blocks: [],
      blockedBy: [...blockedBy],
    }

    // Atomic double-linked update: write newTask + update each dep's blocks array.
    store.tasks[newId] = newTask
    for (const depId of blockedBy) {
      const dep = store.tasks[depId]
      if (dep && !dep.blocks.includes(newId)) {
        dep.blocks.push(newId)
      }
    }
    store.highWaterMark = Math.max(store.highWaterMark, Math.max(maxId, store.highWaterMark) + 1)
    store.seq += 1

    // Persist.
    try {
      writeStoreToDisk(filePath, store)
    } catch (err) {
      // Rollback on failure.
      Object.assign(store, snapshot)
      logger.error({ err, sessionId }, '[runtime-task] create failed, rolled back')
      return { ok: false, error: 'Failed to persist task to disk' }
    }

    emitSseEvent({ seq: store.seq, event: 'created', task: newTask })
    return { ok: true, task: newTask }
  })
}

/** Update an existing task. */
export async function updateRuntimeTask(
  sessionId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<UpdateTaskResult> {
  const filePath = await resolveTaskFilePath(sessionId)
  const nextStatus = input.status

  // activeForm-only updates: in-memory + SSE, but still go through the path lock
  // to ensure seq ordering with concurrent writes (prevents SSE sequence inversion).
  const isActiveFormOnly =
    input.activeForm !== undefined &&
    nextStatus === undefined &&
    input.subject === undefined &&
    input.description === undefined &&
    input.addBlockedBy === undefined &&
    input.metadata === undefined &&
    input.owner === undefined &&
    input.failReason === undefined

  if (isActiveFormOnly) {
    return withPathLock(filePath, async () => {
      const store = await readStoreFromDisk(filePath)
      const task = store.tasks[taskId]
      if (!task) {
        return { ok: false, error: `Task ${taskId} not found` }
      }
      // activeForm is memory-only; disk state is NOT modified, but we still
      // bump seq so the SSE event stream has a monotonically increasing seq.
      // We avoid a disk write by skipping store persistence — the seq value
      // will be re-synchronized on the next real write.
      setActiveForm(sessionId, taskId, input.activeForm!)
      const taskWithActiveForm: RuntimeTask = { ...task, activeForm: input.activeForm }
      emitSseEvent({ seq: store.seq, event: 'updated', task: taskWithActiveForm })
      return { ok: true, task: taskWithActiveForm, unlockedTasks: [] }
    })
  }

  return withPathLock(filePath, async () => {
    const store = await readStoreFromDisk(filePath)
    const snapshot = deepClone(store)
    const task = store.tasks[taskId]
    if (!task) {
      return { ok: false, error: `Task ${taskId} not found` }
    }

    // Validate status transition.
    if (nextStatus !== undefined && nextStatus !== task.status) {
      if (!isLegalTransition(task.status, nextStatus)) {
        return {
          ok: false,
          error: `Illegal status transition: ${task.status} → ${nextStatus}. Terminal states (completed/failed) cannot be reverted.`,
        }
      }
    }

    // Validate subject length.
    if (input.subject !== undefined && input.subject.length > RUNTIME_TASK_LIMITS.MAX_SUBJECT_LEN) {
      return { ok: false, error: `subject exceeds ${RUNTIME_TASK_LIMITS.MAX_SUBJECT_LEN} chars` }
    }
    if (input.description !== undefined && input.description.length > RUNTIME_TASK_LIMITS.MAX_DESCRIPTION_LEN) {
      return { ok: false, error: `description exceeds ${RUNTIME_TASK_LIMITS.MAX_DESCRIPTION_LEN} chars` }
    }
    if (input.activeForm !== undefined && input.activeForm.length > RUNTIME_TASK_LIMITS.MAX_ACTIVE_FORM_LEN) {
      return { ok: false, error: `activeForm exceeds ${RUNTIME_TASK_LIMITS.MAX_ACTIVE_FORM_LEN} chars` }
    }

    // Validate metadata.
    if (input.metadata !== undefined) {
      const mergedMeta = { ...(task.metadata ?? {}), ...input.metadata }
      const check = validateMetadata(mergedMeta)
      if (!check.ok) return { ok: false, error: check.reason }
    }

    // Handle deletion.
    if (nextStatus === 'deleted') {
      // Cascade cleanup: remove this task from other tasks' blocks/blockedBy.
      for (const other of Object.values(store.tasks)) {
        if (other.id === taskId) continue
        other.blocks = other.blocks.filter((id) => id !== taskId)
        other.blockedBy = other.blockedBy.filter((id) => id !== taskId)
      }
      delete store.tasks[taskId]
      store.seq += 1
      try {
        writeStoreToDisk(filePath, store)
      } catch (err) {
        Object.assign(store, snapshot)
        logger.error({ err, sessionId, taskId }, '[runtime-task] delete failed, rolled back')
        return { ok: false, error: 'Failed to persist deletion' }
      }
      clearActiveForm(sessionId, taskId)
      emitSseEvent({ seq: store.seq, event: 'deleted', taskId })
      // Return the original task snapshot (its status field is informational only — the task has been deleted).
      return { ok: true, task, unlockedTasks: [] }
    }

    // Handle addBlockedBy.
    if (input.addBlockedBy && input.addBlockedBy.length > 0) {
      const newDeps = input.addBlockedBy.filter((id) => !task.blockedBy.includes(id))
      // Validate references.
      for (const depId of newDeps) {
        if (!store.tasks[depId]) {
          return { ok: false, error: `addBlockedBy references non-existent task: ${depId}` }
        }
        if (depId === taskId) {
          return { ok: false, error: 'Task cannot depend on itself' }
        }
      }
      // Cycle detection with proposed new deps.
      const merged = [...task.blockedBy, ...newDeps]
      if (detectCycle(store.tasks, taskId, merged)) {
        return { ok: false, error: 'Adding these dependencies would introduce a cycle' }
      }
      task.blockedBy = merged
      // Update reverse link.
      for (const depId of newDeps) {
        const dep = store.tasks[depId]
        if (dep && !dep.blocks.includes(taskId)) {
          dep.blocks.push(taskId)
        }
      }
      // If task was in_progress and new deps are not yet completed, demote to pending.
      if (task.status === 'in_progress') {
        const hasIncompleteDep = newDeps.some((depId) => {
          const dep = store.tasks[depId]
          return dep && dep.status !== 'completed'
        })
        if (hasIncompleteDep) {
          task.status = 'pending'
          task.completedAt = undefined
        }
      }
    }

    // Apply simple field updates.
    if (input.subject !== undefined) task.subject = input.subject
    if (input.description !== undefined) task.description = input.description
    if (input.metadata !== undefined) {
      task.metadata = { ...(task.metadata ?? {}), ...input.metadata }
    }
    if (input.owner !== undefined) task.owner = input.owner
    if (input.failReason !== undefined) task.failReason = input.failReason

    // Handle status transition. (nextStatus is already narrowed to exclude 'deleted' by the early return above.)
    let unlockedTasks: string[] = []
    if (nextStatus !== undefined && nextStatus !== task.status) {
      task.status = nextStatus
      const now = nowIso()
      if (nextStatus === 'in_progress' && !task.startedAt) {
        task.startedAt = now
      }
      if (isTerminal(nextStatus)) {
        task.completedAt = now
      }
      if (nextStatus === 'completed') {
        unlockedTasks = computeUnlockedTasks(store.tasks, taskId)
      }
      if (nextStatus === 'failed') {
        // BFS cascade: recursively mark all transitive downstream tasks as depFailed.
        const queue: string[] = [...task.blocks]
        const visited = new Set<string>([taskId])
        while (queue.length > 0) {
          const downstreamId = queue.shift()!
          if (visited.has(downstreamId)) continue
          visited.add(downstreamId)
          const downstream = store.tasks[downstreamId]
          if (!downstream || isTerminal(downstream.status)) continue
          downstream.status = 'failed'
          downstream.failReason = 'depFailed'
          downstream.completedAt = now
          for (const nextId of downstream.blocks) queue.push(nextId)
        }
      }
    }

    store.seq += 1

    // Persist first — do NOT mutate in-memory activeForm before disk is durable.
    try {
      writeStoreToDisk(filePath, store)
    } catch (err) {
      Object.assign(store, snapshot)
      logger.error({ err, sessionId, taskId }, '[runtime-task] update failed, rolled back')
      return { ok: false, error: 'Failed to persist task update' }
    }

    // After durable write, update in-memory activeForm.
    if (input.activeForm !== undefined) {
      setActiveForm(sessionId, taskId, input.activeForm)
    }

    // Emit SSE event (attach activeForm from memory).
    const activeForm = getActiveForm(sessionId, taskId)
    const taskWithActive: RuntimeTask = activeForm ? { ...task, activeForm } : task
    emitSseEvent({ seq: store.seq, event: 'updated', task: taskWithActive, unlockedTasks })

    return { ok: true, task: taskWithActive, unlockedTasks }
  })
}

/** Read a single task. */
export async function getRuntimeTask(
  sessionId: string,
  taskId: string,
): Promise<RuntimeTask | null> {
  const filePath = await resolveTaskFilePath(sessionId)
  const store = await readStoreFromDisk(filePath)
  const task = store.tasks[taskId]
  if (!task) return null
  const activeForm = getActiveForm(sessionId, taskId)
  return activeForm ? { ...task, activeForm } : task
}

/** List tasks with filtering. */
export type ListTasksOptions = {
  statusFilter?: RuntimeTaskStatus[]
  includeAborted?: boolean
  limit?: number
  offset?: number
}

export async function listRuntimeTasks(
  sessionId: string,
  options: ListTasksOptions = {},
): Promise<{ tasks: RuntimeTask[]; total: number }> {
  const filePath = await resolveTaskFilePath(sessionId)
  const store = await readStoreFromDisk(filePath)
  const statusFilter = options.statusFilter ?? ['pending', 'in_progress']
  const includeAborted = options.includeAborted ?? false
  const limit = options.limit ?? 20
  const offset = options.offset ?? 0

  const all = Object.values(store.tasks)
    .filter((t) => statusFilter.includes(t.status))
    .filter((t) => includeAborted || t.failReason !== 'interrupted')
    .sort((a, b) => Number.parseInt(a.id, 10) - Number.parseInt(b.id, 10))

  const sliced = all.slice(offset, offset + limit).map((t) => {
    const activeForm = getActiveForm(sessionId, t.id)
    return activeForm ? { ...t, activeForm } : t
  })

  return { tasks: sliced, total: all.length }
}

/** Read the full store (for snapshot / recovery). */
export async function readRuntimeTaskStore(sessionId: string): Promise<RuntimeTaskStore> {
  const filePath = await resolveTaskFilePath(sessionId)
  return readStoreFromDisk(filePath)
}

/** Emit a snapshot event (for SSE reconnection / tab sync). */
export async function emitSnapshot(sessionId: string): Promise<void> {
  const store = await readRuntimeTaskStore(sessionId)
  const tasksWithActive = Object.values(store.tasks).map((t) => {
    const activeForm = getActiveForm(sessionId, t.id)
    return activeForm ? { ...t, activeForm } : t
  })
  emitSseEvent({
    seq: store.seq,
    event: 'snapshot',
    snapshot: { tasks: tasksWithActive, seq: store.seq },
  })
}

/** Find all tasks owned by a specific agentId (for agent-died cleanup). */
export async function findTasksByAgentId(
  sessionId: string,
  agentId: string,
): Promise<RuntimeTask[]> {
  const store = await readRuntimeTaskStore(sessionId)
  return Object.values(store.tasks).filter((t) => t.owner?.agentId === agentId)
}

/** Bulk fail tasks (for user Stop / server restart). Server-internal use only. */
export async function bulkFailTasks(
  sessionId: string,
  predicate: (task: RuntimeTask) => boolean,
  failReason: RuntimeTaskFailReason,
): Promise<number> {
  const filePath = await resolveTaskFilePath(sessionId)
  return withPathLock(filePath, async () => {
    const store = await readStoreFromDisk(filePath)
    const snapshot = deepClone(store)
    let count = 0
    const now = nowIso()
    for (const task of Object.values(store.tasks)) {
      if (!predicate(task)) continue
      if (isTerminal(task.status)) continue
      task.status = 'failed'
      task.failReason = failReason
      task.completedAt = now
      count += 1
    }
    if (count === 0) return 0
    store.seq += 1
    try {
      writeStoreToDisk(filePath, store)
    } catch (err) {
      Object.assign(store, snapshot)
      logger.error({ err, sessionId, failReason }, '[runtime-task] bulkFail failed, rolled back')
      return 0
    }
    return count
  })
}
