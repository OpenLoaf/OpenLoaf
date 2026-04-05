import { describe, it, expect, beforeEach, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Mock chatFileStore to point to a temp directory.
let tmpSessionDir: string

vi.mock('@/ai/services/chat/repositories/chatFileStore', () => ({
  resolveSessionDir: vi.fn(async (_sessionId: string) => tmpSessionDir),
}))

// Mock UI writer to capture emitted events.
const emittedEvents: unknown[] = []
vi.mock('@/ai/shared/context/requestContext', () => ({
  getUiWriter: vi.fn(() => ({
    write: (evt: unknown) => {
      emittedEvents.push(evt)
    },
  })),
}))

import {
  createRuntimeTask,
  updateRuntimeTask,
  getRuntimeTask,
  listRuntimeTasks,
  readRuntimeTaskStore,
  bulkFailTasks,
} from '../runtimeTaskService'

describe('runtimeTaskService', () => {
  beforeEach(async () => {
    // Fresh tmp dir per test.
    tmpSessionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-task-test-'))
    emittedEvents.length = 0
  })

  describe('createRuntimeTask', () => {
    it('creates a task with auto-incrementing id', async () => {
      const r1 = await createRuntimeTask('s1', { subject: 'Task A' })
      expect(r1.ok).toBe(true)
      if (r1.ok) {
        expect(r1.task.id).toBe('1')
        expect(r1.task.status).toBe('pending')
        expect(r1.task.blockedBy).toEqual([])
      }

      const r2 = await createRuntimeTask('s1', { subject: 'Task B' })
      expect(r2.ok).toBe(true)
      if (r2.ok) expect(r2.task.id).toBe('2')
    })

    it('updates bidirectional blocks/blockedBy atomically', async () => {
      const a = await createRuntimeTask('s1', { subject: 'A' })
      expect(a.ok).toBe(true)
      const b = await createRuntimeTask('s1', { subject: 'B', blockedBy: ['1'] })
      expect(b.ok).toBe(true)
      if (!b.ok) return
      expect(b.task.blockedBy).toEqual(['1'])

      const store = await readRuntimeTaskStore('s1')
      expect(store.tasks['1']?.blocks).toEqual(['2'])
      expect(store.tasks['2']?.blockedBy).toEqual(['1'])
    })

    it('rejects creation with non-existent blockedBy', async () => {
      const r = await createRuntimeTask('s1', { subject: 'X', blockedBy: ['99'] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('non-existent')
    })

    it('detects cycles: A→B then update A to depend on B should fail', async () => {
      await createRuntimeTask('s1', { subject: 'A' })
      await createRuntimeTask('s1', { subject: 'B', blockedBy: ['1'] })
      const r = await updateRuntimeTask('s1', '1', { addBlockedBy: ['2'] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('cycle')
    })

    it('detects 3-node cycles: A→B→C, then C→A creates cycle', async () => {
      await createRuntimeTask('s1', { subject: 'A' })
      await createRuntimeTask('s1', { subject: 'B', blockedBy: ['1'] })
      await createRuntimeTask('s1', { subject: 'C', blockedBy: ['2'] })
      const r = await updateRuntimeTask('s1', '1', { addBlockedBy: ['3'] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('cycle')
    })
  })

  describe('updateRuntimeTask state machine', () => {
    beforeEach(async () => {
      await createRuntimeTask('s1', { subject: 'Task' })
    })

    it('transitions pending → in_progress → completed', async () => {
      const r1 = await updateRuntimeTask('s1', '1', { status: 'in_progress' })
      expect(r1.ok).toBe(true)
      if (r1.ok) expect(r1.task.status).toBe('in_progress')

      const r2 = await updateRuntimeTask('s1', '1', { status: 'completed' })
      expect(r2.ok).toBe(true)
      if (r2.ok) {
        expect(r2.task.status).toBe('completed')
        expect(r2.task.completedAt).toBeDefined()
      }
    })

    it('rejects illegal transition completed → in_progress', async () => {
      await updateRuntimeTask('s1', '1', { status: 'in_progress' })
      await updateRuntimeTask('s1', '1', { status: 'completed' })
      const r = await updateRuntimeTask('s1', '1', { status: 'in_progress' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('Illegal')
    })

    it('cascades depFailed to downstream when upstream fails', async () => {
      await createRuntimeTask('s1', { subject: 'B', blockedBy: ['1'] })
      await updateRuntimeTask('s1', '1', { status: 'in_progress' })
      await updateRuntimeTask('s1', '1', { status: 'failed' })
      const task2 = await getRuntimeTask('s1', '2')
      expect(task2?.status).toBe('failed')
      expect(task2?.failReason).toBe('depFailed')
    })

    it('recursively cascades depFailed through A→B→C chain', async () => {
      await createRuntimeTask('s1', { subject: 'B', blockedBy: ['1'] })
      await createRuntimeTask('s1', { subject: 'C', blockedBy: ['2'] })
      await updateRuntimeTask('s1', '1', { status: 'in_progress' })
      await updateRuntimeTask('s1', '1', { status: 'failed' })
      const task2 = await getRuntimeTask('s1', '2')
      const task3 = await getRuntimeTask('s1', '3')
      expect(task2?.status).toBe('failed')
      expect(task2?.failReason).toBe('depFailed')
      expect(task3?.status).toBe('failed')
      expect(task3?.failReason).toBe('depFailed')
    })

    it('unlocks downstream tasks when all blockers complete', async () => {
      await createRuntimeTask('s1', { subject: 'B' })
      await createRuntimeTask('s1', { subject: 'C', blockedBy: ['1', '2'] })
      await updateRuntimeTask('s1', '1', { status: 'in_progress' })
      const r1 = await updateRuntimeTask('s1', '1', { status: 'completed' })
      expect(r1.ok).toBe(true)
      if (r1.ok) expect(r1.unlockedTasks).toEqual([])
      await updateRuntimeTask('s1', '2', { status: 'in_progress' })
      const r2 = await updateRuntimeTask('s1', '2', { status: 'completed' })
      expect(r2.ok).toBe(true)
      if (r2.ok) expect(r2.unlockedTasks).toEqual(['3'])
    })
  })

  describe('listRuntimeTasks', () => {
    it('filters by status and includes activeForm', async () => {
      await createRuntimeTask('s1', { subject: 'A' })
      await createRuntimeTask('s1', { subject: 'B' })
      await updateRuntimeTask('s1', '1', { status: 'in_progress', activeForm: 'doing stuff' })
      await updateRuntimeTask('s1', '2', { status: 'in_progress' })
      await updateRuntimeTask('s1', '2', { status: 'completed' })

      const { tasks: active } = await listRuntimeTasks('s1')
      expect(active).toHaveLength(1)
      expect(active[0]?.id).toBe('1')
      expect((active[0] as { activeForm?: string }).activeForm).toBe('doing stuff')

      const { tasks: all } = await listRuntimeTasks('s1', {
        statusFilter: ['pending', 'in_progress', 'completed', 'failed'],
      })
      expect(all).toHaveLength(2)
    })
  })

  describe('bulkFailTasks', () => {
    it('marks in_progress tasks as failed with given reason', async () => {
      await createRuntimeTask('s1', { subject: 'A' })
      await createRuntimeTask('s1', { subject: 'B' })
      await updateRuntimeTask('s1', '1', { status: 'in_progress' })
      const count = await bulkFailTasks('s1', (t) => t.status === 'in_progress', 'interrupted')
      expect(count).toBe(1)
      const t1 = await getRuntimeTask('s1', '1')
      expect(t1?.status).toBe('failed')
      expect(t1?.failReason).toBe('interrupted')
      const t2 = await getRuntimeTask('s1', '2')
      expect(t2?.status).toBe('pending')
    })
  })

  describe('concurrent writes', () => {
    it('serializes concurrent createRuntimeTask calls without ID collision', async () => {
      const results = await Promise.all([
        createRuntimeTask('s1', { subject: 'A' }),
        createRuntimeTask('s1', { subject: 'B' }),
        createRuntimeTask('s1', { subject: 'C' }),
        createRuntimeTask('s1', { subject: 'D' }),
      ])
      const ids = results.filter((r) => r.ok).map((r) => (r.ok ? r.task.id : ''))
      expect(new Set(ids).size).toBe(4)
      expect(ids.sort()).toEqual(['1', '2', '3', '4'])
    })
  })

  describe('addBlockedBy in_progress demotion', () => {
    it('demotes to pending and clears completedAt', async () => {
      await createRuntimeTask('s1', { subject: 'A' })
      await createRuntimeTask('s1', { subject: 'B' })
      await updateRuntimeTask('s1', '2', { status: 'in_progress' })
      const r = await updateRuntimeTask('s1', '2', { addBlockedBy: ['1'] })
      expect(r.ok).toBe(true)
      const t2 = await getRuntimeTask('s1', '2')
      expect(t2?.status).toBe('pending')
      expect(t2?.completedAt).toBeUndefined()
    })
  })

  describe('delete', () => {
    it('cascades cleanup of blocks/blockedBy references', async () => {
      await createRuntimeTask('s1', { subject: 'A' })
      await createRuntimeTask('s1', { subject: 'B', blockedBy: ['1'] })
      await updateRuntimeTask('s1', '1', { status: 'deleted' })
      const t2 = await getRuntimeTask('s1', '2')
      expect(t2?.blockedBy).toEqual([])
      const deleted = await getRuntimeTask('s1', '1')
      expect(deleted).toBeNull()
    })
  })

  describe('max tasks per session', () => {
    it('rejects create when exceeding 100 tasks', async () => {
      // Create 100 tasks (baseline).
      for (let i = 0; i < 100; i++) {
        await createRuntimeTask('s1', { subject: `t${i}` })
      }
      const r = await createRuntimeTask('s1', { subject: 'overflow' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('max')
    })
  })
})
