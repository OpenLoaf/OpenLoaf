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
 * TaskExecutor unit tests.
 *
 * Tests the confirmation mechanism, running state tracking,
 * and instruction building without requiring AI services.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/services/__tests__/taskExecutor.test.ts
 */
import assert from 'node:assert/strict'
import { taskExecutor } from '../taskExecutor'
import type { TaskConfig } from '../taskConfigService'

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
  console.log('\n--- A: Running State ---')

  await test('A1: isRunning returns false for unknown task', () => {
    assert.equal(taskExecutor.isRunning('non-existent'), false)
  })

  await test('A2: getRunningTaskIds returns empty initially', () => {
    const ids = taskExecutor.getRunningTaskIds()
    assert.equal(ids.length, 0)
  })

  await test('A3: abort returns false for unknown task', () => {
    assert.equal(taskExecutor.abort('non-existent'), false)
  })

  console.log('\n--- B: Plan Confirmation ---')

  await test('B1: resolvePlanConfirmation returns false for unknown task', () => {
    assert.equal(taskExecutor.resolvePlanConfirmation('unknown', 'approved'), false)
  })

  await test('B2: waitForConfirmation resolves on approval', async () => {
    // Access the private method via bracket notation
    const waitFn = (taskExecutor as any).waitForConfirmation.bind(taskExecutor)
    const confirmResolvers = (taskExecutor as any).confirmationResolvers as Map<string, Function>

    const promise = waitFn('test-confirm-1', 5000)

    // Simulate user approval
    assert.ok(confirmResolvers.has('test-confirm-1'))
    taskExecutor.resolvePlanConfirmation('test-confirm-1', 'approved')

    const result = await promise
    assert.equal(result, 'approved')
    assert.equal(confirmResolvers.has('test-confirm-1'), false) // cleaned up
  })

  await test('B3: waitForConfirmation resolves on cancellation', async () => {
    const waitFn = (taskExecutor as any).waitForConfirmation.bind(taskExecutor)

    const promise = waitFn('test-confirm-2', 5000)
    taskExecutor.resolvePlanConfirmation('test-confirm-2', 'cancelled')

    const result = await promise
    assert.equal(result, 'cancelled')
  })

  await test('B4: waitForConfirmation times out', async () => {
    const waitFn = (taskExecutor as any).waitForConfirmation.bind(taskExecutor)

    // Use very short timeout
    const promise = waitFn('test-confirm-3', 50)
    const result = await promise
    assert.equal(result, 'timeout')
  })

  await test('B5: resolvePlanConfirmation clears from resolver map', () => {
    const confirmResolvers = (taskExecutor as any).confirmationResolvers as Map<string, Function>

    // Manually register a resolver
    confirmResolvers.set('test-clear', () => {})
    assert.ok(confirmResolvers.has('test-clear'))

    taskExecutor.resolvePlanConfirmation('test-clear', 'approved')
    assert.equal(confirmResolvers.has('test-clear'), false)
  })

  console.log('\n--- C: Instruction Building ---')

  await test('C1: buildPlanInstruction includes task name', () => {
    const buildFn = (taskExecutor as any).buildPlanInstruction.bind(taskExecutor)
    const task = {
      name: '开发邮件功能',
      description: '实现发送邮件的 API',
    } as TaskConfig

    const instruction = buildFn(task)
    assert.ok(instruction.includes('开发邮件功能'))
    assert.ok(instruction.includes('实现发送邮件的 API'))
    assert.ok(instruction.includes('update-plan'))
    assert.ok(instruction.includes('spawn-agent'))
  })

  await test('C2: buildPlanInstruction handles missing description', () => {
    const buildFn = (taskExecutor as any).buildPlanInstruction.bind(taskExecutor)
    const task = { name: '简单任务' } as TaskConfig

    const instruction = buildFn(task)
    assert.ok(instruction.includes('简单任务'))
    assert.ok(!instruction.includes('任务描述'))
  })

  await test('C3: buildPlanInstruction includes payload message', () => {
    const buildFn = (taskExecutor as any).buildPlanInstruction.bind(taskExecutor)
    const task = {
      name: '用户任务',
      payload: { message: '帮我重构登录模块' },
    } as unknown as TaskConfig

    const instruction = buildFn(task)
    assert.ok(instruction.includes('帮我重构登录模块'))
  })

  console.log('\n--- D: SSE Parsing ---')

  await test('D1: extractLastMessage parses text-delta', () => {
    const extractFn = (taskExecutor as any).extractLastMessage.bind(taskExecutor)
    const chunk = 'data: {"type":"text-delta","textDelta":"正在安装依赖"}\n\n'
    const result = extractFn(chunk, 'fallback')
    assert.equal(result, '正在安装依赖')
  })

  await test('D2: extractLastMessage returns fallback for non-text data', () => {
    const extractFn = (taskExecutor as any).extractLastMessage.bind(taskExecutor)
    const chunk = 'data: {"type":"tool-call","toolName":"shell"}\n\n'
    const result = extractFn(chunk, '之前的消息')
    assert.equal(result, '之前的消息')
  })

  await test('D3: extractLastMessage handles malformed data', () => {
    const extractFn = (taskExecutor as any).extractLastMessage.bind(taskExecutor)
    const chunk = 'data: not-json\n\n'
    const result = extractFn(chunk, 'fallback')
    assert.equal(result, 'fallback')
  })

  await test('D4: extractLastMessage uses last text-delta in multi-line chunk', () => {
    const extractFn = (taskExecutor as any).extractLastMessage.bind(taskExecutor)
    const chunk = [
      'data: {"type":"text-delta","textDelta":"第一条"}',
      '',
      'data: {"type":"text-delta","textDelta":"第二条"}',
      '',
    ].join('\n')
    const result = extractFn(chunk, 'fallback')
    assert.equal(result, '第二条')
  })

  await test('D5: extractLastMessage handles empty chunk', () => {
    const extractFn = (taskExecutor as any).extractLastMessage.bind(taskExecutor)
    const result = extractFn('', 'fallback')
    assert.equal(result, 'fallback')
  })

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`taskExecutor: ${passed} passed, ${failed} failed`)
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
