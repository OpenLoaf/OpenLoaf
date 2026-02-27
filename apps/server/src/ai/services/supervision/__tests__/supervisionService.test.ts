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
 * SupervisionService Tier-1 rule-based tests.
 *
 * Only tests tier1RuleCheck (pure sync logic, no LLM or network needed).
 * Tier-2 (LLM) and Tier-3 (human) require integration tests.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/services/supervision/__tests__/supervisionService.test.ts
 */
import assert from 'node:assert/strict'
import { SupervisionService, type SupervisionRequest } from '../supervisionService'

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
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(toolName: string, toolArgs: Record<string, unknown> = {}): SupervisionRequest {
  return {
    toolName,
    toolArgs,
    taskId: 'test-task-1',
    taskName: '测试任务',
    taskDescription: '用于测试的任务',
  }
}

/**
 * We test tier1RuleCheck indirectly through evaluate().
 * When no model is set (tier2 skipped) and tier1 approves,
 * evaluate() should return the tier1 result without reaching tier3.
 *
 * When tier1 returns null, evaluate() would proceed to tier2 (skipped) then tier3.
 * We can't test tier3 without mocking pendingRegistry, so we focus on tier1 results.
 */
function createTestService(): SupervisionService {
  return new SupervisionService()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {

  console.log('\n--- A: Read-only tools auto-approve ---')

  const readOnlyTools = [
    'read-file', 'list-dir', 'grep-files', 'time-now',
    'browser-snapshot', 'browser-observe', 'browser-extract',
    'project-query', 'calendar-query', 'email-query',
    'wait-agent', 'task-status',
  ]

  for (const toolName of readOnlyTools) {
    await test(`A: ${toolName} is auto-approved`, async () => {
      const svc = createTestService()
      const result = await svc.evaluate(makeRequest(toolName))
      assert.equal(result.decision, 'approve')
      assert.ok(result.reason.includes('只读'))
    })
  }

  console.log('\n--- B: Agent tools auto-approve ---')

  const agentTools = ['spawn-agent', 'send-input', 'abort-agent']

  for (const toolName of agentTools) {
    await test(`B: ${toolName} is auto-approved`, async () => {
      const svc = createTestService()
      const result = await svc.evaluate(makeRequest(toolName))
      assert.equal(result.decision, 'approve')
      assert.ok(result.reason.includes('Agent'))
    })
  }

  console.log('\n--- C: update-plan auto-approve ---')

  await test('C1: update-plan is auto-approved', async () => {
    const svc = createTestService()
    const result = await svc.evaluate(makeRequest('update-plan'))
    assert.equal(result.decision, 'approve')
    assert.ok(result.reason.includes('计划'))
  })

  console.log('\n--- D: Shell command checks ---')

  await test('D1: shell with safe read-only command auto-approves', async () => {
    const svc = createTestService()
    const result = await svc.evaluate(makeRequest('shell', { command: 'ls -la' }))
    assert.equal(result.decision, 'approve')
  })

  await test('D2: shell with cat command auto-approves', async () => {
    const svc = createTestService()
    const result = await svc.evaluate(makeRequest('shell', { command: 'cat package.json' }))
    assert.equal(result.decision, 'approve')
  })

  await test('D3: exec-command with safe command auto-approves', async () => {
    const svc = createTestService()
    const result = await svc.evaluate(makeRequest('exec-command', { cmd: 'ls -la' }))
    assert.equal(result.decision, 'approve')
  })

  console.log('\n--- E: Decision parsing ---')

  await test('E1: parseDecision handles valid JSON', () => {
    // Access the private method through evaluate behavior
    // We test this indirectly - the parseDecision is tested via tier2 behavior
    // For now, test that a service without model skips tier2
    const svc = createTestService()
    assert.equal(svc['model'], null)
  })

  await test('E2: parseDecision handles approve response', () => {
    const svc = createTestService() as any
    const result = svc.parseDecision('{"decision": "approve", "reason": "safe"}')
    assert.equal(result.decision, 'approve')
    assert.equal(result.reason, 'safe')
  })

  await test('E3: parseDecision handles reject response', () => {
    const svc = createTestService() as any
    const result = svc.parseDecision('{"decision": "reject", "reason": "dangerous"}')
    assert.equal(result.decision, 'reject')
    assert.equal(result.reason, 'dangerous')
  })

  await test('E4: parseDecision handles escalate response', () => {
    const svc = createTestService() as any
    const result = svc.parseDecision('{"decision": "escalate", "reason": "unsure"}')
    assert.equal(result.decision, 'escalate')
    assert.equal(result.reason, 'unsure')
  })

  await test('E5: parseDecision handles JSON wrapped in text', () => {
    const svc = createTestService() as any
    const result = svc.parseDecision('Here is my analysis:\n{"decision": "approve", "reason": "ok"}\nDone.')
    assert.equal(result.decision, 'approve')
  })

  await test('E6: parseDecision defaults to escalate on invalid input', () => {
    const svc = createTestService() as any
    const result = svc.parseDecision('I am not sure about this')
    assert.equal(result.decision, 'escalate')
  })

  await test('E7: parseDecision defaults to escalate on invalid JSON', () => {
    const svc = createTestService() as any
    const result = svc.parseDecision('{"invalid": true}')
    assert.equal(result.decision, 'escalate')
  })

  console.log('\n--- F: Prompt building ---')

  await test('F1: buildSupervisionPrompt includes task info', () => {
    const svc = createTestService() as any
    const prompt = svc.buildSupervisionPrompt(makeRequest('shell', { command: 'rm -rf /' }))
    assert.ok(prompt.includes('测试任务'))
    assert.ok(prompt.includes('shell'))
    assert.ok(prompt.includes('rm -rf /'))
  })

  await test('F2: buildSupervisionPrompt handles missing description', () => {
    const svc = createTestService() as any
    const req = makeRequest('shell')
    delete req.taskDescription
    const prompt = svc.buildSupervisionPrompt(req)
    assert.ok(prompt.includes('无'))
  })

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`supervisionService: ${passed} passed, ${failed} failed`)
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
