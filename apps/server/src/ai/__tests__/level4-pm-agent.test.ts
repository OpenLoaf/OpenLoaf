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
 * Level 4: PM Agent integration tests.
 *
 * Tests PM agent creation, frame construction, and prompt loading.
 * Model-dependent tests are skipped if OPENLOAF_TEST_CHAT_MODEL_ID is not set.
 *
 * 用法:
 *   cd apps/server
 *   node --env-file=.env --enable-source-maps --import tsx/esm \
 *     --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/level4-pm-agent.test.ts
 */
import assert from 'node:assert/strict'
import { printSection, printPass, printFail } from './helpers/printUtils'
import { resolveTestModel, setMinimalRequestContext, getTestChatModelId, setupE2eTestEnv } from './helpers/testEnv'

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
let skipped = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    printPass(name)
  } catch (err: any) {
    failed++
    const msg = `${name}: ${err?.message}`
    errors.push(msg)
    printFail(name, err)
  }
}

function skip(name: string, reason: string) {
  skipped++
  console.log(`  SKIP  ${name} (${reason})`)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  printSection('A: PM Prompt Loading')

  // Import after setup
  const { getPMPrompt } = await import('@/ai/agent-templates/templates/pm')

  await test('A1: getPMPrompt() returns Chinese prompt by default', () => {
    const prompt = getPMPrompt()
    assert.ok(prompt.length > 100, `Prompt should be substantial, got ${prompt.length} chars`)
    assert.ok(prompt.includes('项目经理') || prompt.includes('PM'), 'Chinese prompt should contain "项目经理" or "PM"')
  })

  await test('A2: getPMPrompt("en") returns English prompt', () => {
    const prompt = getPMPrompt('en')
    assert.ok(prompt.length > 100, `Prompt should be substantial, got ${prompt.length} chars`)
    assert.ok(prompt.includes('Project Manager') || prompt.includes('PM'),
      'English prompt should contain "Project Manager" or "PM"')
  })

  await test('A3: getPMPrompt("zh") returns Chinese prompt', () => {
    const prompt = getPMPrompt('zh')
    assert.ok(prompt.includes('项目经理') || prompt.includes('PM'))
  })

  await test('A4: getPMPrompt("en-US") returns English prompt', () => {
    const prompt = getPMPrompt('en-US')
    assert.ok(prompt.includes('Project Manager') || prompt.includes('PM'))
  })

  printSection('B: PM Agent Frame')

  // Setup E2E env for model resolution
  setupE2eTestEnv()
  setMinimalRequestContext()

  const { createPMAgentFrame } = await import('@/ai/services/agentFactory')

  await test('B1: createPMAgentFrame → kind is "pm"', () => {
    const frame = createPMAgentFrame({
      model: { provider: 'openai', modelId: 'gpt-4o' },
    })
    assert.equal(frame.kind, 'pm')
  })

  await test('B2: createPMAgentFrame with taskId → agentId contains taskId', () => {
    const frame = createPMAgentFrame({
      model: { provider: 'openai', modelId: 'gpt-4o' },
      taskId: 'task-abc-123',
    })
    assert.ok(frame.agentId.includes('task-abc-123'),
      `agentId should contain taskId, got: ${frame.agentId}`)
  })

  await test('B3: createPMAgentFrame without taskId → agentId has timestamp', () => {
    const frame = createPMAgentFrame({
      model: { provider: 'openai', modelId: 'gpt-4o' },
    })
    assert.ok(frame.agentId.startsWith('pm-agent-'),
      `agentId should start with "pm-agent-", got: ${frame.agentId}`)
  })

  await test('B4: createPMAgentFrame → name is PMAgent', () => {
    const frame = createPMAgentFrame({
      model: { provider: 'openai', modelId: 'gpt-4o' },
    })
    assert.equal(frame.name, 'PMAgent')
  })

  await test('B5: createPMAgentFrame with projectId → frame includes projectId', () => {
    const frame = createPMAgentFrame({
      model: { provider: 'openai', modelId: 'gpt-4o' },
      projectId: 'proj-xyz',
    })
    assert.equal(frame.projectId, 'proj-xyz')
  })

  printSection('C: PM Agent Creation (model-dependent)')

  const chatModelId = getTestChatModelId()
  if (!chatModelId) {
    skip('C1: createPMAgent → returns agent object', 'OPENLOAF_TEST_CHAT_MODEL_ID not set')
    skip('C2: createPMAgentRunner → returns runner with agent + frame', 'OPENLOAF_TEST_CHAT_MODEL_ID not set')
  } else {
    const { createPMAgent } = await import('@/ai/services/agentFactory')
    const { createPMAgentRunner } = await import('@/ai/services/masterAgentRunner')

    const resolved = await resolveTestModel()

    await test('C1: createPMAgent → returns agent object', () => {
      const agent = createPMAgent({ model: resolved.model })
      assert.ok(agent, 'Agent should be created')
      assert.ok(typeof agent === 'object', 'Agent should be an object')
    })

    await test('C2: createPMAgentRunner → returns runner with agent + frame', () => {
      const runner = createPMAgentRunner({
        model: resolved.model,
        modelInfo: {
          provider: resolved.modelInfo.provider,
          modelId: resolved.modelInfo.modelId,
        },
      })
      assert.ok(runner.agent, 'Runner should have agent')
      assert.ok(runner.frame, 'Runner should have frame')
      assert.equal(runner.frame.kind, 'pm')
    })
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`level4-pm-agent: ${passed} passed, ${failed} failed, ${skipped} skipped`)
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
