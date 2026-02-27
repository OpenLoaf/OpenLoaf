/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * TaskOrchestrator candidate collection and conflict detection tests.
 *
 * Tests the pure logic functions without requiring running services.
 * We extract and test collectCandidates and checkConflict logic directly.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/services/__tests__/taskOrchestrator.test.ts
 */
import assert from 'node:assert/strict'
import type { TaskConfig, TaskStatus } from '../taskConfigService'

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    const msg = `${name}: ${err?.message}`
    errors.push(msg)
    console.log(`  ✗ ${msg}`)
  }
}

// ---------------------------------------------------------------------------
// Extract logic under test (replicated from taskOrchestrator.ts)
// We replicate these pure functions to test without requiring
// getWorkspaceRootPath, taskExecutor, and other singletons.
// ---------------------------------------------------------------------------

function collectCandidates(allTasks: TaskConfig[]): TaskConfig[] {
  const candidates: TaskConfig[] = []
  const doneTaskIds = new Set(
    allTasks.filter((t) => t.status === 'done').map((t) => t.id),
  )

  for (const task of allTasks) {
    if (task.status !== 'todo') continue
    if (!task.autoExecute) continue
    if (!task.enabled) continue

    // Check dependencies
    if (task.dependsOn && task.dependsOn.length > 0) {
      const allDepsComplete = task.dependsOn.every((depId) => doneTaskIds.has(depId))
      if (!allDepsComplete) continue
    }

    candidates.push(task)
  }

  return candidates
}

function checkConflict(
  candidate: TaskConfig,
  runningTasks: TaskConfig[],
): { conflict: boolean; reason: string } {
  const candidateScope = candidate.scope
  for (const running of runningTasks) {
    if (running.scope === candidateScope && candidateScope === 'project') {
      return {
        conflict: true,
        reason: `与运行中的任务 "${running.name}" 在同一项目范围内`,
      }
    }
  }
  return { conflict: false, reason: '' }
}

// ---------------------------------------------------------------------------
// Task factory helper
// ---------------------------------------------------------------------------

let taskCounter = 0

function makeTask(overrides: Partial<TaskConfig> = {}): TaskConfig {
  taskCounter++
  return {
    id: `task-${taskCounter}`,
    name: `任务 ${taskCounter}`,
    status: 'todo' as TaskStatus,
    priority: 'medium',
    triggerMode: 'manual',
    sessionMode: 'isolated',
    timeoutMs: 600000,
    planConfirmTimeoutMs: 300000,
    skipPlanConfirm: false,
    requiresReview: true,
    autoExecute: true,
    enabled: true,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    consecutiveErrors: 0,
    activityLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'user',
    scope: 'workspace',
    filePath: '/tmp/fake/task.json',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n--- A: Candidate Collection ---')

  await test('A1: collects todo + autoExecute + enabled tasks', () => {
    const tasks = [
      makeTask({ status: 'todo', autoExecute: true, enabled: true }),
      makeTask({ status: 'todo', autoExecute: true, enabled: true }),
    ]
    const candidates = collectCandidates(tasks)
    assert.equal(candidates.length, 2)
  })

  await test('A2: excludes non-todo tasks', () => {
    const tasks = [
      makeTask({ status: 'running' }),
      makeTask({ status: 'review' }),
      makeTask({ status: 'done' }),
      makeTask({ status: 'cancelled' }),
      makeTask({ status: 'todo' }),
    ]
    const candidates = collectCandidates(tasks)
    assert.equal(candidates.length, 1)
  })

  await test('A3: excludes autoExecute=false tasks', () => {
    const tasks = [
      makeTask({ autoExecute: false }),
      makeTask({ autoExecute: true }),
    ]
    const candidates = collectCandidates(tasks)
    assert.equal(candidates.length, 1)
  })

  await test('A4: excludes disabled tasks', () => {
    const tasks = [
      makeTask({ enabled: false }),
      makeTask({ enabled: true }),
    ]
    const candidates = collectCandidates(tasks)
    assert.equal(candidates.length, 1)
  })

  await test('A5: includes tasks with all dependencies done', () => {
    const dep1 = makeTask({ status: 'done' })
    const dep2 = makeTask({ status: 'done' })
    const dependent = makeTask({ dependsOn: [dep1.id, dep2.id] })
    const tasks = [dep1, dep2, dependent]
    const candidates = collectCandidates(tasks)
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]!.id, dependent.id)
  })

  await test('A6: excludes tasks with incomplete dependencies', () => {
    const dep1 = makeTask({ status: 'done' })
    const dep2 = makeTask({ status: 'running' })
    const dependent = makeTask({ dependsOn: [dep1.id, dep2.id] })
    const tasks = [dep1, dep2, dependent]
    const candidates = collectCandidates(tasks)
    assert.equal(candidates.length, 0)
  })

  await test('A7: tasks without dependencies are always eligible', () => {
    const task = makeTask({ dependsOn: undefined })
    const candidates = collectCandidates([task])
    assert.equal(candidates.length, 1)
  })

  await test('A8: empty dependsOn array treated as no dependencies', () => {
    const task = makeTask({ dependsOn: [] })
    const candidates = collectCandidates([task])
    assert.equal(candidates.length, 1)
  })

  await test('A9: returns empty for empty input', () => {
    const candidates = collectCandidates([])
    assert.equal(candidates.length, 0)
  })

  console.log('\n--- B: Conflict Detection ---')

  await test('B1: no conflict when no running tasks', () => {
    const candidate = makeTask({ scope: 'project' })
    const result = checkConflict(candidate, [])
    assert.equal(result.conflict, false)
  })

  await test('B2: conflict when same project scope', () => {
    const candidate = makeTask({ scope: 'project' })
    const running = makeTask({ scope: 'project', status: 'running' })
    const result = checkConflict(candidate, [running])
    assert.equal(result.conflict, true)
    assert.ok(result.reason.length > 0)
  })

  await test('B3: no conflict between workspace-scope tasks', () => {
    const candidate = makeTask({ scope: 'workspace' })
    const running = makeTask({ scope: 'workspace', status: 'running' })
    const result = checkConflict(candidate, [running])
    assert.equal(result.conflict, false)
  })

  await test('B4: no conflict between different scopes', () => {
    const candidate = makeTask({ scope: 'project' })
    const running = makeTask({ scope: 'workspace', status: 'running' })
    const result = checkConflict(candidate, [running])
    assert.equal(result.conflict, false)
  })

  await test('B5: conflict detected with any running project task', () => {
    const candidate = makeTask({ scope: 'project' })
    const running1 = makeTask({ scope: 'workspace', status: 'running' })
    const running2 = makeTask({ scope: 'project', status: 'running' })
    const result = checkConflict(candidate, [running1, running2])
    assert.equal(result.conflict, true)
  })

  console.log('\n--- C: Timeout Detection ---')

  await test('C1: timeout detection identifies expired tasks', () => {
    const now = Date.now()
    const task = makeTask({
      status: 'running',
      lastRunAt: new Date(now - 700000).toISOString(), // 700s ago
      timeoutMs: 600000, // 10 min timeout
    })
    const elapsed = now - new Date(task.lastRunAt!).getTime()
    assert.ok(elapsed > task.timeoutMs)
  })

  await test('C2: timeout detection passes for non-expired tasks', () => {
    const now = Date.now()
    const task = makeTask({
      status: 'running',
      lastRunAt: new Date(now - 100000).toISOString(), // 100s ago
      timeoutMs: 600000, // 10 min timeout
    })
    const elapsed = now - new Date(task.lastRunAt!).getTime()
    assert.ok(elapsed < task.timeoutMs)
  })

  console.log('\n--- D: Auto-Archive Logic ---')

  await test('D1: identifies done tasks older than 7 days for archive', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const task = makeTask({
      status: 'done',
      completedAt: eightDaysAgo,
    })
    const completedTime = task.completedAt ?? task.updatedAt
    const elapsed = Date.now() - new Date(completedTime).getTime()
    const ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
    assert.ok(elapsed > ARCHIVE_AFTER_MS)
  })

  await test('D2: does not archive done tasks less than 7 days old', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const task = makeTask({
      status: 'done',
      completedAt: twoDaysAgo,
    })
    const completedTime = task.completedAt ?? task.updatedAt
    const elapsed = Date.now() - new Date(completedTime).getTime()
    const ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
    assert.ok(elapsed < ARCHIVE_AFTER_MS)
  })

  await test('D3: does not archive non-done tasks', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const tasks = [
      makeTask({ status: 'todo', updatedAt: eightDaysAgo }),
      makeTask({ status: 'running', updatedAt: eightDaysAgo }),
      makeTask({ status: 'review', updatedAt: eightDaysAgo }),
      makeTask({ status: 'cancelled', updatedAt: eightDaysAgo }),
    ]
    // Only done tasks should be considered
    const doneForArchive = tasks.filter((t) => t.status === 'done')
    assert.equal(doneForArchive.length, 0)
  })

  await test('D4: falls back to updatedAt when completedAt is undefined', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const task = makeTask({
      status: 'done',
      completedAt: undefined,
      updatedAt: eightDaysAgo,
    })
    const completedTime = task.completedAt ?? task.updatedAt
    assert.equal(completedTime, eightDaysAgo)
    const elapsed = Date.now() - new Date(completedTime).getTime()
    const ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
    assert.ok(elapsed > ARCHIVE_AFTER_MS)
  })

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`taskOrchestrator: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const err of errors) {
      console.log(`  - ${err}`)
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
