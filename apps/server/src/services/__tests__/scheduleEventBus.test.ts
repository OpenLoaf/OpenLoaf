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
 * scheduleEventBus tests.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/services/__tests__/scheduleEventBus.test.ts
 */
import assert from 'node:assert/strict'
import { scheduleEventBus, type ScheduleStatusChangeEvent, type ScheduleSummaryUpdateEvent, type ScheduleReportEvent } from '../scheduleEventBus'

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
  scheduleEventBus.removeAllListeners()

  console.log('\n--- A: Status Change Events ---')

  await test('A1: onStatusChange receives emitted events', () => {
    let received: ScheduleStatusChangeEvent | null = null
    const cleanup = scheduleEventBus.onStatusChange((event) => {
      received = event
    })

    const event: ScheduleStatusChangeEvent = {
      taskId: 'task-1',
      status: 'running',
      previousStatus: 'todo',
      title: '测试任务',
      updatedAt: new Date().toISOString(),
    }
    scheduleEventBus.emitStatusChange(event)

    assert.ok(received)
    const ev = received as ScheduleStatusChangeEvent
    assert.equal(ev.taskId, 'task-1')
    assert.equal(ev.status, 'running')
    assert.equal(ev.previousStatus, 'todo')
    assert.equal(ev.title, '测试任务')

    cleanup()
  })

  await test('A2: onStatusChange with reviewType', () => {
    let received: ScheduleStatusChangeEvent | null = null
    const cleanup = scheduleEventBus.onStatusChange((event) => {
      received = event
    })

    scheduleEventBus.emitStatusChange({
      taskId: 'task-2',
      status: 'review',
      previousStatus: 'running',
      reviewType: 'plan',
      title: '计划确认',
      updatedAt: new Date().toISOString(),
    })

    assert.ok(received)
    assert.equal((received as ScheduleStatusChangeEvent).reviewType, 'plan')

    cleanup()
  })

  await test('A3: cleanup function unsubscribes listener', () => {
    let callCount = 0
    const cleanup = scheduleEventBus.onStatusChange(() => {
      callCount++
    })

    scheduleEventBus.emitStatusChange({
      taskId: 't', status: 'todo', previousStatus: 'todo',
      title: 't', updatedAt: new Date().toISOString(),
    })
    assert.equal(callCount, 1)

    cleanup()

    scheduleEventBus.emitStatusChange({
      taskId: 't', status: 'running', previousStatus: 'todo',
      title: 't', updatedAt: new Date().toISOString(),
    })
    assert.equal(callCount, 1) // Should not increase
  })

  await test('A4: multiple listeners receive the same event', () => {
    let count1 = 0
    let count2 = 0
    const cleanup1 = scheduleEventBus.onStatusChange(() => { count1++ })
    const cleanup2 = scheduleEventBus.onStatusChange(() => { count2++ })

    scheduleEventBus.emitStatusChange({
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
    let received: ScheduleSummaryUpdateEvent | null = null
    const cleanup = scheduleEventBus.onSummaryUpdate((event) => {
      received = event
    })

    scheduleEventBus.emitSummaryUpdate({
      taskId: 'task-3',
      summary: {
        currentStep: '安装依赖',
        totalSteps: 5,
        completedSteps: 1,
        lastAgentMessage: 'pnpm install 执行中...',
      },
    })

    assert.ok(received)
    const ev = received as ScheduleSummaryUpdateEvent
    assert.equal(ev.taskId, 'task-3')
    assert.equal(ev.summary.currentStep, '安装依赖')
    assert.equal(ev.summary.totalSteps, 5)
    assert.equal(ev.summary.completedSteps, 1)

    cleanup()
  })

  await test('B2: status and summary events are independent', () => {
    let statusCount = 0
    let summaryCount = 0
    const cleanup1 = scheduleEventBus.onStatusChange(() => { statusCount++ })
    const cleanup2 = scheduleEventBus.onSummaryUpdate(() => { summaryCount++ })

    scheduleEventBus.emitStatusChange({
      taskId: 't', status: 'running', previousStatus: 'todo',
      title: 't', updatedAt: new Date().toISOString(),
    })

    scheduleEventBus.emitSummaryUpdate({
      taskId: 't', summary: { currentStep: 'test' },
    })

    assert.equal(statusCount, 1)
    assert.equal(summaryCount, 1)

    cleanup1()
    cleanup2()
  })

  console.log('\n--- C: Task Report Events ---')

  await test('C1: onScheduleReport receives emitted events', () => {
    let received: ScheduleReportEvent | null = null
    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      received = event
    })

    const event: ScheduleReportEvent = {
      taskId: 'task-report-1',
      sourceSessionId: 'session-abc',
      status: 'completed',
      title: '开发邮件功能',
      summary: '已完成邮件 API 实现',
    }
    scheduleEventBus.emitScheduleReport(event)

    assert.ok(received)
    const ev = received as ScheduleReportEvent
    assert.equal(ev.taskId, 'task-report-1')
    assert.equal(ev.sourceSessionId, 'session-abc')
    assert.equal(ev.status, 'completed')
    assert.equal(ev.title, '开发邮件功能')
    assert.equal(ev.summary, '已完成邮件 API 实现')

    cleanup()
  })

  await test('C2: onScheduleReport with failed status', () => {
    let received: ScheduleReportEvent | null = null
    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      received = event
    })

    scheduleEventBus.emitScheduleReport({
      taskId: 'task-report-2',
      sourceSessionId: 'session-def',
      status: 'failed',
      title: '数据库迁移',
      summary: '迁移脚本执行失败',
    })

    assert.ok(received)
    assert.equal((received as ScheduleReportEvent).status, 'failed')

    cleanup()
  })

  await test('C3: onScheduleReport cleanup stops receiving events', () => {
    let callCount = 0
    const cleanup = scheduleEventBus.onScheduleReport(() => {
      callCount++
    })

    scheduleEventBus.emitScheduleReport({
      taskId: 't', sourceSessionId: 's', status: 'completed',
      title: 't', summary: 's',
    })
    assert.equal(callCount, 1)

    cleanup()

    scheduleEventBus.emitScheduleReport({
      taskId: 't', sourceSessionId: 's', status: 'completed',
      title: 't', summary: 's',
    })
    assert.equal(callCount, 1) // Should not increase
  })

  await test('C4: sourceSessionId can be used for filtering', () => {
    const eventsForSession: ScheduleReportEvent[] = []
    const targetSession = 'filter-target'

    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === targetSession) {
        eventsForSession.push(event)
      }
    })

    scheduleEventBus.emitScheduleReport({
      taskId: 't1', sourceSessionId: targetSession, status: 'completed',
      title: 't1', summary: 's1',
    })
    scheduleEventBus.emitScheduleReport({
      taskId: 't2', sourceSessionId: 'other-session', status: 'completed',
      title: 't2', summary: 's2',
    })
    scheduleEventBus.emitScheduleReport({
      taskId: 't3', sourceSessionId: targetSession, status: 'failed',
      title: 't3', summary: 's3',
    })

    assert.equal(eventsForSession.length, 2)
    assert.equal(eventsForSession[0]!.taskId, 't1')
    assert.equal(eventsForSession[1]!.taskId, 't3')

    cleanup()
  })

  await test('C5: task report events are independent of status/summary events', () => {
    let statusCount = 0
    let reportCount = 0
    const cleanup1 = scheduleEventBus.onStatusChange(() => { statusCount++ })
    const cleanup2 = scheduleEventBus.onScheduleReport(() => { reportCount++ })

    scheduleEventBus.emitStatusChange({
      taskId: 't', status: 'running', previousStatus: 'todo',
      title: 't', updatedAt: new Date().toISOString(),
    })

    scheduleEventBus.emitScheduleReport({
      taskId: 't', sourceSessionId: 's', status: 'completed',
      title: 't', summary: 's',
    })

    assert.equal(statusCount, 1)
    assert.equal(reportCount, 1)

    cleanup1()
    cleanup2()
  })

  // Clean up
  scheduleEventBus.removeAllListeners()

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`scheduleEventBus: ${passed} passed, ${failed} failed`)
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
