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
 * taskConfigService comprehensive tests.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/services/__tests__/taskConfigService.test.ts
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  createTask,
  getTask,
  listTasks,
  listTasksByStatus,
  updateTask,
  deleteTask,
  appendActivityLog,
  updateExecutionSummary,
  archiveTask,
  getTaskDir,
  type CreateTaskInput,
  type TaskConfig,
} from '../taskConfigService'

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
// Setup / teardown helpers
// ---------------------------------------------------------------------------

let tempDir: string

async function setup() {
  tempDir = path.join(os.tmpdir(), `task_config_test_${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
}

async function cleanup() {
  await fs.rm(tempDir, { recursive: true, force: true })
}

function createMinimalTask(overrides?: Partial<CreateTaskInput>): TaskConfig {
  return createTask(
    {
      name: '测试任务',
      triggerMode: 'manual',
      ...overrides,
    },
    tempDir,
    'workspace',
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  await setup()

  try {
    // ─── A layer: Create + Read ──────────────────────────────────────
    console.log('\n--- A: Create + Read ---')

    await test('A1: createTask generates valid task with defaults', () => {
      const task = createMinimalTask()
      assert.ok(task.id, 'ID should be generated')
      assert.equal(task.name, '测试任务')
      assert.equal(task.status, 'todo')
      assert.equal(task.priority, 'medium')
      assert.equal(task.triggerMode, 'manual')
      assert.equal(task.sessionMode, 'isolated')
      assert.equal(task.timeoutMs, 600000)
      assert.equal(task.planConfirmTimeoutMs, 300000)
      assert.equal(task.skipPlanConfirm, false)
      assert.equal(task.requiresReview, true)
      assert.equal(task.autoExecute, true)
      assert.equal(task.enabled, true)
      assert.equal(task.runCount, 0)
      assert.equal(task.consecutiveErrors, 0)
      assert.equal(task.scope, 'workspace')
      assert.equal(task.createdBy, 'user')
      assert.ok(task.createdAt)
      assert.ok(task.updatedAt)
      assert.equal(task.lastRunAt, null)
      assert.equal(task.lastStatus, null)
      assert.equal(task.lastError, null)
    })

    await test('A2: createTask respects custom values', () => {
      const task = createMinimalTask({
        name: '自定义任务',
        description: '详细描述',
        priority: 'urgent',
        triggerMode: 'scheduled',
        skipPlanConfirm: true,
        requiresReview: false,
        autoExecute: false,
        createdBy: 'agent',
        timeoutMs: 120000,
        planConfirmTimeoutMs: 60000,
        agentName: 'shell',
      })
      assert.equal(task.name, '自定义任务')
      assert.equal(task.description, '详细描述')
      assert.equal(task.priority, 'urgent')
      assert.equal(task.triggerMode, 'scheduled')
      assert.equal(task.skipPlanConfirm, true)
      assert.equal(task.requiresReview, false)
      assert.equal(task.autoExecute, false)
      assert.equal(task.createdBy, 'agent')
      assert.equal(task.timeoutMs, 120000)
      assert.equal(task.planConfirmTimeoutMs, 60000)
      assert.equal(task.agentName, 'shell')
    })

    await test('A3: createTask creates initial activity log entry', () => {
      const task = createMinimalTask()
      assert.equal(task.activityLog.length, 1)
      const entry = task.activityLog[0]!
      assert.equal(entry.from, 'todo')
      assert.equal(entry.to, 'todo')
      assert.equal(entry.actor, 'user')
      assert.equal(entry.reason, '任务创建')
      assert.ok(entry.timestamp)
    })

    await test('A4: createTask creates directory structure', async () => {
      const task = createMinimalTask()
      const taskDir = path.dirname(task.filePath)
      const stat = await fs.stat(taskDir)
      assert.ok(stat.isDirectory())
      const fileContent = await fs.readFile(task.filePath, 'utf8')
      const parsed = JSON.parse(fileContent)
      assert.equal(parsed.id, task.id)
    })

    await test('A5: getTask retrieves created task', () => {
      const task = createMinimalTask({ name: 'get-test' })
      const retrieved = getTask(task.id, tempDir)
      assert.ok(retrieved)
      assert.equal(retrieved!.id, task.id)
      assert.equal(retrieved!.name, 'get-test')
      assert.equal(retrieved!.scope, 'workspace')
    })

    await test('A6: getTask returns null for non-existent task', () => {
      const result = getTask('non-existent-id', tempDir)
      assert.equal(result, null)
    })

    // ─── B layer: List + Filter ──────────────────────────────────────
    console.log('\n--- B: List + Filter ---')

    // Create a fresh set of tasks for listing tests
    const listTestDir = path.join(tempDir, 'list_tests')
    await fs.mkdir(listTestDir, { recursive: true })

    const taskA = createTask({ name: 'A', triggerMode: 'manual' }, listTestDir, 'workspace')
    const taskB = createTask({ name: 'B', triggerMode: 'scheduled' }, listTestDir, 'workspace')
    const taskC = createTask({ name: 'C', triggerMode: 'condition' }, listTestDir, 'workspace')

    // Manually update B to running
    updateTask(taskB.id, { status: 'running' }, listTestDir)
    // Manually update C to done
    updateTask(taskC.id, { status: 'done', completedAt: new Date().toISOString() }, listTestDir)

    await test('B1: listTasks returns all tasks', () => {
      const tasks = listTasks(listTestDir)
      assert.equal(tasks.length, 3)
    })

    await test('B2: listTasks sorted by createdAt descending', () => {
      const tasks = listTasks(listTestDir)
      for (let i = 0; i < tasks.length - 1; i++) {
        assert.ok(tasks[i]!.createdAt >= tasks[i + 1]!.createdAt)
      }
    })

    await test('B3: listTasksByStatus filters by single status', () => {
      const running = listTasksByStatus('running', listTestDir)
      assert.equal(running.length, 1)
      assert.equal(running[0]!.name, 'B')
    })

    await test('B4: listTasksByStatus filters by multiple statuses', () => {
      const todoAndDone = listTasksByStatus(['todo', 'done'], listTestDir)
      assert.equal(todoAndDone.length, 2)
      const names = todoAndDone.map((t) => t.name).sort()
      assert.deepEqual(names, ['A', 'C'])
    })

    await test('B5: listTasksByStatus returns empty for no matches', () => {
      const cancelled = listTasksByStatus('cancelled', listTestDir)
      assert.equal(cancelled.length, 0)
    })

    // ─── C layer: Update ─────────────────────────────────────────────
    console.log('\n--- C: Update ---')

    await test('C1: updateTask updates fields', async () => {
      const task = createMinimalTask({ name: 'update-test' })
      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))
      const updated = updateTask(task.id, {
        status: 'running',
        priority: 'high',
      }, tempDir)
      assert.ok(updated)
      assert.equal(updated!.status, 'running')
      assert.equal(updated!.priority, 'high')
      assert.ok(updated!.updatedAt >= task.updatedAt)
    })

    await test('C2: updateTask preserves unchanged fields', () => {
      const task = createMinimalTask({
        name: 'preserve-test',
        description: '保持不变',
        priority: 'low',
      })
      const updated = updateTask(task.id, { status: 'running' }, tempDir)
      assert.ok(updated)
      assert.equal(updated!.name, 'preserve-test')
      assert.equal(updated!.description, '保持不变')
      assert.equal(updated!.priority, 'low')
    })

    await test('C3: updateTask returns null for non-existent task', () => {
      const result = updateTask('non-existent', { status: 'done' }, tempDir)
      assert.equal(result, null)
    })

    await test('C4: updateTask persists to disk', () => {
      const task = createMinimalTask({ name: 'persist-test' })
      updateTask(task.id, { status: 'done' }, tempDir)
      const retrieved = getTask(task.id, tempDir)
      assert.ok(retrieved)
      assert.equal(retrieved!.status, 'done')
    })

    // ─── D layer: Activity Log ───────────────────────────────────────
    console.log('\n--- D: Activity Log ---')

    await test('D1: appendActivityLog adds entry', () => {
      const task = createMinimalTask({ name: 'log-test' })
      const result = appendActivityLog(task.id, {
        from: 'todo',
        to: 'running',
        actor: 'system',
        reason: '开始执行',
      }, tempDir)
      assert.ok(result)

      const updated = getTask(task.id, tempDir)
      assert.ok(updated)
      assert.equal(updated!.activityLog.length, 2) // initial + new
      const lastEntry = updated!.activityLog[1]!
      assert.equal(lastEntry.from, 'todo')
      assert.equal(lastEntry.to, 'running')
      assert.equal(lastEntry.actor, 'system')
      assert.equal(lastEntry.reason, '开始执行')
      assert.ok(lastEntry.timestamp)
    })

    await test('D2: appendActivityLog with reviewType', () => {
      const task = createMinimalTask({ name: 'review-log-test' })
      appendActivityLog(task.id, {
        from: 'running',
        to: 'review',
        reviewType: 'plan',
        actor: 'system',
      }, tempDir)

      const updated = getTask(task.id, tempDir)
      assert.ok(updated)
      const lastEntry = updated!.activityLog[updated!.activityLog.length - 1]!
      assert.equal(lastEntry.reviewType, 'plan')
    })

    await test('D3: appendActivityLog returns false for non-existent task', () => {
      const result = appendActivityLog('non-existent', {
        from: 'todo',
        to: 'running',
        actor: 'system',
      }, tempDir)
      assert.equal(result, false)
    })

    await test('D4: multiple appendActivityLog calls accumulate entries', () => {
      const task = createMinimalTask({ name: 'multi-log-test' })
      appendActivityLog(task.id, { from: 'todo', to: 'running', actor: 'system' }, tempDir)
      appendActivityLog(task.id, { from: 'running', to: 'review', actor: 'system', reviewType: 'plan' }, tempDir)
      appendActivityLog(task.id, { from: 'review', to: 'running', actor: 'user', reason: '用户确认计划' }, tempDir)

      const updated = getTask(task.id, tempDir)
      assert.ok(updated)
      assert.equal(updated!.activityLog.length, 4) // initial + 3
    })

    // ─── E layer: Execution Summary ──────────────────────────────────
    console.log('\n--- E: Execution Summary ---')

    await test('E1: updateExecutionSummary sets summary', () => {
      const task = createMinimalTask({ name: 'summary-test' })
      const result = updateExecutionSummary(task.id, {
        currentStep: '安装依赖',
        totalSteps: 5,
        completedSteps: 1,
        lastAgentMessage: '正在执行 pnpm install...',
      }, tempDir)
      assert.ok(result)

      const updated = getTask(task.id, tempDir)
      assert.ok(updated?.executionSummary)
      assert.equal(updated!.executionSummary!.currentStep, '安装依赖')
      assert.equal(updated!.executionSummary!.totalSteps, 5)
      assert.equal(updated!.executionSummary!.completedSteps, 1)
      assert.equal(updated!.executionSummary!.lastAgentMessage, '正在执行 pnpm install...')
    })

    await test('E2: updateExecutionSummary merges partial updates', () => {
      const task = createMinimalTask({ name: 'summary-merge-test' })
      updateExecutionSummary(task.id, {
        currentStep: '步骤1',
        totalSteps: 3,
        completedSteps: 0,
      }, tempDir)

      updateExecutionSummary(task.id, {
        currentStep: '步骤2',
        completedSteps: 1,
      }, tempDir)

      const updated = getTask(task.id, tempDir)
      assert.ok(updated?.executionSummary)
      assert.equal(updated!.executionSummary!.currentStep, '步骤2')
      assert.equal(updated!.executionSummary!.totalSteps, 3) // preserved from first call
      assert.equal(updated!.executionSummary!.completedSteps, 1)
    })

    await test('E3: updateExecutionSummary returns false for non-existent', () => {
      const result = updateExecutionSummary('non-existent', {
        currentStep: 'test',
      }, tempDir)
      assert.equal(result, false)
    })

    // ─── F layer: Delete ─────────────────────────────────────────────
    console.log('\n--- F: Delete ---')

    await test('F1: deleteTask removes task and directory', async () => {
      const task = createMinimalTask({ name: 'delete-test' })
      const taskDir = path.dirname(task.filePath)
      const result = deleteTask(task.id, tempDir)
      assert.ok(result)
      const exists = await fs.stat(taskDir).catch(() => null)
      assert.equal(exists, null)
      assert.equal(getTask(task.id, tempDir), null)
    })

    await test('F2: deleteTask returns false for non-existent', () => {
      const result = deleteTask('non-existent', tempDir)
      assert.equal(result, false)
    })

    // ─── G layer: Archive ────────────────────────────────────────────
    console.log('\n--- G: Archive ---')

    await test('G1: archiveTask moves done task to archive', async () => {
      const archiveTestDir = path.join(tempDir, 'archive_test')
      await fs.mkdir(archiveTestDir, { recursive: true })

      const task = createTask({ name: 'archive-test' }, archiveTestDir, 'workspace')
      const completedAt = '2026-02-27T10:00:00.000Z'
      updateTask(task.id, {
        status: 'done',
        completedAt,
      }, archiveTestDir)

      const result = archiveTask(task.id, archiveTestDir)
      assert.ok(result)

      // Original location should be gone
      assert.equal(getTask(task.id, archiveTestDir), null)

      // Should exist in archive
      const archivePath = path.join(
        archiveTestDir, '.openloaf', 'tasks', 'archive', '2026-02-27', task.id, 'task.json',
      )
      const stat = await fs.stat(archivePath).catch(() => null)
      assert.ok(stat, 'Archive file should exist')
    })

    await test('G2: archiveTask rejects non-done tasks', () => {
      const task = createMinimalTask({ name: 'archive-reject' })
      const result = archiveTask(task.id, tempDir)
      assert.equal(result, false)
    })

    await test('G3: archiveTask returns false for non-existent', () => {
      const result = archiveTask('non-existent', tempDir)
      assert.equal(result, false)
    })

    // ─── H layer: getTaskDir ─────────────────────────────────────────
    console.log('\n--- H: getTaskDir ---')

    await test('H1: getTaskDir returns correct path', () => {
      const task = createMinimalTask({ name: 'dir-test' })
      const dir = getTaskDir(task.id, tempDir)
      assert.ok(dir)
      assert.equal(dir, path.dirname(task.filePath))
    })

    await test('H2: getTaskDir returns null for non-existent', () => {
      const dir = getTaskDir('non-existent', tempDir)
      assert.equal(dir, null)
    })

    // ─── I layer: Project scope ──────────────────────────────────────
    console.log('\n--- I: Project scope ---')

    await test('I1: tasks in different scopes are independent', async () => {
      const wsDir = path.join(tempDir, 'ws_scope')
      const projDir = path.join(tempDir, 'proj_scope')
      await fs.mkdir(wsDir, { recursive: true })
      await fs.mkdir(projDir, { recursive: true })

      const wsTask = createTask({ name: 'ws-task' }, wsDir, 'workspace')
      const projTask = createTask({ name: 'proj-task' }, projDir, 'project')

      assert.equal(wsTask.scope, 'workspace')
      assert.equal(projTask.scope, 'project')

      // listTasks with both roots
      const allTasks = listTasks(wsDir, projDir)
      assert.equal(allTasks.length, 2)

      // getTask searches project first
      const found = getTask(projTask.id, wsDir, projDir)
      assert.ok(found)
      assert.equal(found!.scope, 'project')
    })

    // ─── J layer: Dependencies ───────────────────────────────────────
    console.log('\n--- J: Dependencies ---')

    await test('J1: task with dependsOn is created correctly', () => {
      const dep1 = createMinimalTask({ name: 'dep1' })
      const dep2 = createMinimalTask({ name: 'dep2' })
      const dependent = createMinimalTask({
        name: 'dependent',
        dependsOn: [dep1.id, dep2.id],
      })
      assert.ok(dependent.dependsOn)
      assert.equal(dependent.dependsOn!.length, 2)
      assert.ok(dependent.dependsOn!.includes(dep1.id))
      assert.ok(dependent.dependsOn!.includes(dep2.id))
    })

    await test('J2: task with parentTaskId is created correctly', () => {
      const parent = createMinimalTask({ name: 'parent' })
      const child = createMinimalTask({
        name: 'child',
        parentTaskId: parent.id,
      })
      assert.equal(child.parentTaskId, parent.id)
    })

  } finally {
    await cleanup()
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`taskConfigService: ${passed} passed, ${failed} failed`)
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
