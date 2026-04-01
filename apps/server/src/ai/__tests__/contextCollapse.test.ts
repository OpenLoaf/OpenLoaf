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
 * contextCollapse 单元测试
 *
 * 验证：
 *   A. applyIfNeeded — 消息数少于 keepRecent 跳过
 *   B. applyIfNeeded — token < commitThreshold 跳过
 *   C. 无 model 时 fallback 到硬裁剪
 *   D. LLM 返回空摘要时保持原消息
 *   E. 折叠后消息包含 [Context Collapse] 标记
 *   F. 段落累积（多次折叠）
 *   G. clear() 清除所有段落
 *   H. 折叠后仍超 hardLimit 时应用 trimToContextWindow
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/contextCollapse.test.ts
 */
import assert from 'node:assert/strict'
import type { ModelMessage } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import {
  ContextCollapseManager,
} from '@/ai/shared/contextCollapse'
import {
  estimateMessagesTokens,
  getModelContextSize,
  computeHardLimit,
} from '@/ai/shared/contextWindowManager'

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0
let failed = 0
const errorsList: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errorsList.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a string of N characters. */
function chars(n: number, ch = 'a'): string {
  return ch.repeat(n)
}

/** Create a simple user text message (ModelMessage format). */
function userMsg(text: string): ModelMessage {
  return { role: 'user', content: [{ type: 'text', text }] } as ModelMessage
}

/** Create a simple assistant text message. */
function assistantMsg(text: string): ModelMessage {
  return { role: 'assistant', content: [{ type: 'text', text }] } as ModelMessage
}

/** Generate N alternating user/assistant message pairs. */
function generateConversation(pairs: number, charsPerMsg: number): ModelMessage[] {
  const msgs: ModelMessage[] = []
  for (let i = 0; i < pairs; i++) {
    msgs.push(userMsg(chars(charsPerMsg, 'a')))
    msgs.push(assistantMsg(chars(charsPerMsg, 'b')))
  }
  return msgs
}

/**
 * Create a MockLanguageModelV3 that returns a given summary text.
 */
function createMockModel(summaryText: string) {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text: summaryText }],
      finishReason: 'stop',
      usage: { inputTokens: { total: 100 }, outputTokens: { total: 50 } },
    } as any,
  })
}

/** Create a mock model that returns empty text. */
function createEmptySummaryModel() {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text: '' }],
      finishReason: 'stop',
      usage: { inputTokens: { total: 100 }, outputTokens: { total: 0 } },
    } as any,
  })
}

/** Create a mock model that throws an error. */
function createFailingModel() {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error('Mock LLM failure')
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== contextCollapse Tests ===\n')

  // ── Section A: 消息数少于 keepRecent 跳过 ─────────────────────────────────

  console.log('  --- A. Skip when messages < keepRecent ---')

  await test('消息数 <= keepRecentMessages 时跳过（默认 10）', async () => {
    const manager = new ContextCollapseManager()
    const msgs = generateConversation(4, 100) // 8 messages
    const result = await manager.applyIfNeeded(msgs)
    assert.equal(result.collapsed, false)
    assert.equal(result.messages.length, msgs.length)
    assert.equal(result.tokensSaved, 0)
  })

  await test('刚好 10 条消息时跳过', async () => {
    const manager = new ContextCollapseManager()
    const msgs = generateConversation(5, 100) // 10 messages
    const result = await manager.applyIfNeeded(msgs)
    assert.equal(result.collapsed, false)
  })

  await test('自定义 keepRecentMessages = 5，6 条消息不跳过（但可能因 token 不够跳过）', async () => {
    const manager = new ContextCollapseManager({ keepRecentMessages: 5 })
    // 6 messages with small content — won't exceed threshold
    const msgs = generateConversation(3, 100) // 6 messages
    const result = await manager.applyIfNeeded(msgs)
    // Should still not collapse because token count is below threshold
    assert.equal(result.collapsed, false)
  })

  // ── Section B: token < commitThreshold 跳过 ────────────────────────────

  console.log('\n  --- B. Skip when tokens < commitThreshold ---')

  await test('11 条小消息 token 低于 commitThreshold — 跳过', async () => {
    const manager = new ContextCollapseManager()
    // 12 messages but very small content — far below 80% of 128K
    const msgs = generateConversation(6, 50) // 12 messages, ~24 tokens each
    const result = await manager.applyIfNeeded(msgs)
    assert.equal(result.collapsed, false)
    assert.equal(result.tokensSaved, 0)
  })

  await test('自定义 commitThreshold = 0.01 — 即使少量 token 也触发', async () => {
    const model = createMockModel('## 摘要\n测试摘要内容')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    // 20 messages with some content — should exceed 0.01 * 128K = 1280 tokens
    const msgs = generateConversation(10, 500) // 20 messages, ~230 tokens each ≈ 4600 total
    const result = await manager.applyIfNeeded(msgs, model)
    // With such a low threshold, it should collapse
    assert.equal(result.collapsed, true)
  })

  // ── Section C: 无 model 时 fallback 到硬裁剪 ────────────────────────────

  console.log('\n  --- C. Fallback to hard trim without model ---')

  await test('无 model 且 token > commitThreshold — fallback 到 trimToContextWindow', async () => {
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    // Generate messages that exceed low threshold
    const msgs = generateConversation(10, 500)
    const result = await manager.applyIfNeeded(msgs, undefined)
    // Should collapse via hard trim
    assert.equal(result.collapsed, true)
  })

  await test('无 model 且 token > blockingThreshold — 也 fallback 到硬裁剪', async () => {
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      blockingThreshold: 0.02,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500)
    const result = await manager.applyIfNeeded(msgs, undefined)
    assert.equal(result.collapsed, true)
  })

  // ── Section D: LLM 返回空摘要时保持原消息 ──────────────────────────────

  console.log('\n  --- D. Empty summary keeps original messages ---')

  await test('模型返回空摘要 — collapsed=false, 保持原消息', async () => {
    const model = createEmptySummaryModel()
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500)
    const result = await manager.applyIfNeeded(msgs, model)
    assert.equal(result.collapsed, false)
    assert.equal(result.messages.length, msgs.length)
    assert.equal(result.tokensSaved, 0)
  })

  await test('模型抛出错误 — fallback 到 trimToContextWindow', async () => {
    const model = createFailingModel()
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500)
    const result = await manager.applyIfNeeded(msgs, model)
    // Should fallback to trim, not crash
    assert.equal(result.collapsed, true)
  })

  // ── Section E: 折叠后消息包含 [Context Collapse] 标记 ──────────────────

  console.log('\n  --- E. Collapsed messages contain [Context Collapse] marker ---')

  await test('折叠后第一条消息包含 [Context Collapse] 标记', async () => {
    const model = createMockModel('## 摘要\n这是一个测试摘要\n## 关键决策\n无\n## 待办\n无')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500) // 20 messages
    const result = await manager.applyIfNeeded(msgs, model)
    assert.equal(result.collapsed, true)

    // First message should be the summary with collapse marker
    const firstMsg = result.messages[0]!
    assert.equal(firstMsg.role, 'user')
    const content = (firstMsg as any).content
    assert.ok(Array.isArray(content))
    const text = content[0]?.text ?? ''
    assert.ok(
      text.includes('[Context Collapse'),
      `first message should contain [Context Collapse] marker, got: ${text.slice(0, 100)}`,
    )
  })

  await test('折叠后保留最近 keepRecentMessages 条消息', async () => {
    const model = createMockModel('## 摘要\n摘要内容')
    const keepRecent = 5
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: keepRecent,
    })
    const msgs = generateConversation(10, 500) // 20 messages
    const result = await manager.applyIfNeeded(msgs, model)
    assert.equal(result.collapsed, true)
    // Should be: 1 summary + keepRecent recent messages
    assert.equal(result.messages.length, 1 + keepRecent)
  })

  await test('摘要消息的 role 是 user', async () => {
    const model = createMockModel('## 摘要\n内容')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500)
    const result = await manager.applyIfNeeded(msgs, model)
    assert.equal(result.messages[0]!.role, 'user')
  })

  // ── Section F: 段落累积（多次折叠）─────────────────────────────────────

  console.log('\n  --- F. Segment accumulation across collapses ---')

  await test('第一次折叠后创建 1 个段落', async () => {
    const model = createMockModel('## 摘要\n第一次摘要')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500)
    await manager.applyIfNeeded(msgs, model)

    const segments = manager.getSegments()
    assert.equal(segments.length, 1)
    assert.ok(segments[0]!.summary.includes('第一次摘要'))
    assert.ok(segments[0]!.originalTokens > 0)
    assert.ok(segments[0]!.summaryTokens > 0)
    assert.ok(segments[0]!.createdAt > 0)
  })

  await test('第二次折叠后段落被合并为 1 个（不是累加为 2 个）', async () => {
    const model = createMockModel('## 摘要\n合并后的摘要')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })

    // First collapse
    const msgs1 = generateConversation(10, 500)
    await manager.applyIfNeeded(msgs1, model)
    assert.equal(manager.getSegments().length, 1)

    // Second collapse with more messages
    const msgs2 = generateConversation(10, 500)
    await manager.applyIfNeeded(msgs2, model)

    // Segments should be merged — still 1 segment
    assert.equal(manager.getSegments().length, 1)
    assert.ok(manager.getSegments()[0]!.summary.includes('合并后的摘要'))
  })

  await test('段落包含正确的 range 信息', async () => {
    const model = createMockModel('## 摘要\n测试')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500) // 20 messages
    await manager.applyIfNeeded(msgs, model)

    const seg = manager.getSegments()[0]!
    // range[0] should be 0 (start of old messages)
    assert.equal(seg.range[0], 0)
    // range[1] should be total - keepRecent = 20 - 3 = 17
    assert.equal(seg.range[1], 17)
  })

  // ── Section G: clear() 清除所有段落 ─────────────────────────────────────

  console.log('\n  --- G. clear() removes all segments ---')

  await test('clear() 后段落为空', async () => {
    const model = createMockModel('## 摘要\n测试')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500)
    await manager.applyIfNeeded(msgs, model)
    assert.ok(manager.getSegments().length > 0)

    manager.clear()
    assert.equal(manager.getSegments().length, 0)
  })

  await test('clear() 后可以重新折叠', async () => {
    const model = createMockModel('## 摘要\n重新折叠')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500)

    // First collapse + clear
    await manager.applyIfNeeded(msgs, model)
    manager.clear()
    assert.equal(manager.getSegments().length, 0)

    // Second collapse should work normally
    await manager.applyIfNeeded(msgs, model)
    assert.equal(manager.getSegments().length, 1)
    assert.ok(manager.getSegments()[0]!.summary.includes('重新折叠'))
  })

  // ── Section H: 折叠后仍超 hardLimit 时应用 trim ──────────────────────────

  console.log('\n  --- H. Apply trim when collapsed still exceeds hardLimit ---')

  await test('折叠后 token 不超过 hardLimit', async () => {
    const model = createMockModel('## 摘要\n简短摘要')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 5,
      modelId: 'gpt-4o',
    })

    // Generate large conversation
    const msgs = generateConversation(50, 2000)
    const result = await manager.applyIfNeeded(msgs, model)

    assert.equal(result.collapsed, true)
    const afterTokens = estimateMessagesTokens(result.messages)
    const contextSize = getModelContextSize('gpt-4o')
    const hardLimit = computeHardLimit(contextSize)
    assert.ok(
      afterTokens <= hardLimit,
      `collapsed tokens ${afterTokens} should not exceed hard limit ${hardLimit}`,
    )
  })

  await test('当摘要本身很短但 keepRecent 消息很大时，仍做 trim 保护', async () => {
    // Use a model with small context (like gpt-4 with 8K)
    const model = createMockModel('简短')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 5,
      modelId: 'gpt-4', // 8192 tokens
    })

    // Generate messages where even keepRecent messages exceed hardLimit
    // gpt-4 hardLimit = min(120K, 8192 - 2000) = 6192
    // 5 messages * 5000 chars each ≈ 5 * 2300 tokens = 11500 > 6192
    const msgs = generateConversation(10, 5000) // 20 messages
    const result = await manager.applyIfNeeded(msgs, model)

    assert.equal(result.collapsed, true)
    // The result should be trimmed to fit
    const afterTokens = estimateMessagesTokens(result.messages)
    const hardLimit = computeHardLimit(getModelContextSize('gpt-4'))
    assert.ok(
      afterTokens <= hardLimit,
      `tokens ${afterTokens} should be within hard limit ${hardLimit}`,
    )
  })

  // ── Immutability check ──────────────────────────────────────────────────

  console.log('\n  --- Immutability ---')

  await test('原始消息数组不被修改', async () => {
    const model = createMockModel('## 摘要\n测试')
    const manager = new ContextCollapseManager({
      commitThreshold: 0.01,
      keepRecentMessages: 3,
    })
    const msgs = generateConversation(10, 500)
    const originalLength = msgs.length
    const firstMsgSnapshot = JSON.stringify(msgs[0])

    await manager.applyIfNeeded(msgs, model)

    assert.equal(msgs.length, originalLength, 'original array length should not change')
    assert.equal(JSON.stringify(msgs[0]), firstMsgSnapshot, 'first message should not be mutated')
  })

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
  if (errorsList.length > 0) {
    console.log('Failures:')
    for (const e of errorsList) console.log(`  - ${e}`)
  }
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
