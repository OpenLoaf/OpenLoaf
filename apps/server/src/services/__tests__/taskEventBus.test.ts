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
 * taskEventBus tests.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/services/__tests__/taskEventBus.test.ts
 */
import assert from 'node:assert/strict'
import { taskEventBus, type TaskStatusChangeEvent, type TaskSummaryUpdateEvent } from '../taskEventBus'

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
// Tests
// ---------------------------------------------------------------------------

async function main() {
  // Clean up any existing listeners from module-level singleton
  taskEventBus.removeAllListeners()

  console.log('\n--- A: Status Change Events ---')

  await test('A1: onStatusChange receives emitted events', () => {
    let received: TaskStatusChangeEvent | null = null
    const cleanup = taskEventBus.onStatusChange((event) => {
      received = event
    })

    const event: TaskStatusChangeEvent = {
      taskId: 'task-1',
      status: 'running',
      previousStatus: 'todo',
      title: '测试任务',
      updatedAt: new Date().toISOString(),
    }
    taskEventBus.emitStatusChange(event)

    assert.ok(received)
    const ev = received as TaskStatusChangeEvent
    assert.equal(ev.taskId, 'task-1')
    assert.equal(ev.status, 'running')
    assert.equal(ev.previousStatus, 'todo')
    assert.equal(ev.title, '测试任务')

    cleanup()
  })

  await test('A2: onStatusChange with reviewType', () => {
    let received: TaskStatusChangeEvent | null = null
    const cleanup = taskEventBus.onStatusChange((event) => {
      received = event
    })

    taskEventBus.emitStatusChange({
      taskId: 'task-2',
      status: 'review',
      previousStatus: 'running',
      reviewType: 'plan',
      title: '计划确认',
      updatedAt: new Date().toISOString(),
    })

    assert.ok(received)
    assert.equal((received as TaskStatusChangeEvent).reviewType, 'plan')

    cleanup()
  })

  await test('A3: cleanup function unsubscribes listener', () => {
    let callCount = 0
    const cleanup = taskEventBus.onStatusChange(() => {
      callCount++
    })

    taskEventBus.emitStatusChange({
      taskId: 't', status: 'todo', previousStatus: 'todo',
      title: 't', updatedAt: new Date().toISOString(),
    })
    assert.equal(callCount, 1)

    cleanup()

    taskEventBus.emitStatusChange({
      taskId: 't', status: 'running', previousStatus: 'todo',
      title: 't', updatedAt: new Date().toISOString(),
    })
    assert.equal(callCount, 1) // Should not increase
  })

  await test('A4: multiple listeners receive the same event', () => {
    let count1 = 0
    let count2 = 0
    const cleanup1 = taskEventBus.onStatusChange(() => { count1++ })
    const cleanup2 = taskEventBus.onStatusChange(() => { count2++ })

    taskEventBus.emitStatusChange({
      taskId: 't', status: 'todo', previousStatus: 'todo',
      title: 't', updatedAt: new Date().toISOString(),
    })

    assert.equal(count1, 1)
    assert.equal(count2, 1)

    cleanup1()
    cleanup2()
  })

  console.log('\n--- B: Summary Update Events ---')

  await test('B1: onSummaryUpdate receives emitted events', () => {
    let received: TaskSummaryUpdateEvent | null = null
    const cleanup = taskEventBus.onSummaryUpdate((event) => {
      received = event
    })

    taskEventBus.emitSummaryUpdate({
      taskId: 'task-3',
      summary: {
        currentStep: '安装依赖',
        totalSteps: 5,
        completedSteps: 1,
        lastAgentMessage: 'pnpm install 执行中...',
      },
    })

    assert.ok(received)
    const ev = received as TaskSummaryUpdateEvent
    assert.equal(ev.taskId, 'task-3')
    assert.equal(ev.summary.currentStep, '安装依赖')
    assert.equal(ev.summary.totalSteps, 5)
    assert.equal(ev.summary.completedSteps, 1)

    cleanup()
  })

  await test('B2: status and summary events are independent', () => {
    let statusCount = 0
    let summaryCount = 0
    const cleanup1 = taskEventBus.onStatusChange(() => { statusCount++ })
    const cleanup2 = taskEventBus.onSummaryUpdate(() => { summaryCount++ })

    taskEventBus.emitStatusChange({
      taskId: 't', status: 'running', previousStatus: 'todo',
      title: 't', updatedAt: new Date().toISOString(),
    })

    taskEventBus.emitSummaryUpdate({
      taskId: 't', summary: { currentStep: 'test' },
    })

    assert.equal(statusCount, 1)
    assert.equal(summaryCount, 1)

    cleanup1()
    cleanup2()
  })

  // Clean up
  taskEventBus.removeAllListeners()

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`taskEventBus: ${passed} passed, ${failed} failed`)
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
