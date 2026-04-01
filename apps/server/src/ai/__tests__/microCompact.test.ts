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
 * microCompact 单元测试
 *
 * 验证：
 *   A. microcompactMessages — 无时间戳时跳过
 *   B. microcompactMessages — 间隔 < 30min 跳过
 *   C. microcompactMessages — 间隔 > 30min 触发清除
 *   D. 保留最近 3 个工具结果、清除其余
 *   E. 不修改原始消息（immutability）
 *   F. 非可压缩工具不受影响
 *   G. extractLastAssistantTimestamp — 找到最后 assistant 消息时间戳
 *   H. extractLastAssistantTimestamp — 没有时间戳返回 null
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/microCompact.test.ts
 */
import assert from 'node:assert/strict'
import {
  microcompactMessages,
  extractLastAssistantTimestamp,
} from '@/ai/shared/microCompact'
import type { ModelMessage } from 'ai'

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
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLEARED_MESSAGE = '[旧工具结果已清除]'

/** Create a tool-result message for a compactable tool. */
function toolResultMsg(toolName: string, result: string): ModelMessage {
  return {
    role: 'tool' as any,
    content: [
      { type: 'tool-result', toolName, result } as any,
    ],
  } as ModelMessage
}

/** Create a user text message. */
function userMsg(text: string): ModelMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
  } as ModelMessage
}

/** Create an assistant text message. */
function assistantMsg(text: string): ModelMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
  } as ModelMessage
}

/** Minutes to milliseconds. */
function minutesAgo(minutes: number): number {
  return Date.now() - minutes * 60 * 1000
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== microCompact Tests ===\n')

  // ── Section A: 无时间戳时跳过 ─────────────────────────────────────────────

  console.log('  --- A. Skip when no timestamp ---')

  await test('lastAssistantTimestamp 为 undefined 时跳过', () => {
    const msgs = [
      userMsg('hello'),
      toolResultMsg('Read', 'file content'),
      assistantMsg('done'),
    ]
    const result = microcompactMessages(msgs, undefined)
    assert.equal(result.toolsCleared, 0)
    assert.equal(result.messages.length, msgs.length)
  })

  await test('lastAssistantTimestamp 为 null 时跳过', () => {
    const msgs = [userMsg('hi'), toolResultMsg('Read', 'data')]
    const result = microcompactMessages(msgs, null)
    assert.equal(result.toolsCleared, 0)
  })

  // ── Section B: 间隔 < 30min 跳过 ──────────────────────────────────────────

  console.log('\n  --- B. Skip when gap < 30 min ---')

  await test('间隔 5 分钟 — 不清除', () => {
    const msgs = [
      userMsg('q1'),
      toolResultMsg('Read', 'content1'),
      toolResultMsg('Bash', 'output1'),
      toolResultMsg('Grep', 'matches1'),
      toolResultMsg('Read', 'content2'),
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(5))
    assert.equal(result.toolsCleared, 0)
    assert.equal(result.toolsKept, 0)
  })

  await test('间隔 29 分钟 — 仍不清除', () => {
    const msgs = [
      userMsg('q1'),
      toolResultMsg('Read', 'content'),
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(29))
    assert.equal(result.toolsCleared, 0)
  })

  // ── Section C: 间隔 > 30min 触发清除 ──────────────────────────────────────

  console.log('\n  --- C. Trigger clearing when gap > 30 min ---')

  await test('间隔 31 分钟 + 5 个工具结果 → 清除前 2 个、保留后 3 个', () => {
    const msgs = [
      userMsg('q1'),
      toolResultMsg('Read', 'content1'),     // index 1 → cleared
      toolResultMsg('Bash', 'output1'),      // index 2 → cleared
      toolResultMsg('Grep', 'matches1'),     // index 3 → kept
      toolResultMsg('Read', 'content2'),     // index 4 → kept
      toolResultMsg('Bash', 'output2'),      // index 5 → kept
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(31))
    assert.equal(result.toolsCleared, 2)
    assert.equal(result.toolsKept, 3)
    assert.equal(result.messages.length, msgs.length)
  })

  await test('间隔 60 分钟 + 10 个工具结果 → 清除 7 个', () => {
    const msgs: ModelMessage[] = [userMsg('start')]
    for (let i = 0; i < 10; i++) {
      msgs.push(toolResultMsg('Read', `content_${i}`))
    }
    msgs.push(assistantMsg('done'))

    const result = microcompactMessages(msgs, minutesAgo(60))
    assert.equal(result.toolsCleared, 7)
    assert.equal(result.toolsKept, 3)
  })

  await test('estimatedTokensSaved > 0 when clearing long results', () => {
    const msgs: ModelMessage[] = [userMsg('start')]
    for (let i = 0; i < 5; i++) {
      msgs.push(toolResultMsg('Read', 'x'.repeat(5000)))
    }
    msgs.push(assistantMsg('done'))

    const result = microcompactMessages(msgs, minutesAgo(60))
    assert.equal(result.toolsCleared, 2)
    assert.ok(result.estimatedTokensSaved > 0, `expected tokens saved > 0, got ${result.estimatedTokensSaved}`)
  })

  // ── Section D: 保留最近 3 个工具结果 ────────────────────────────────────────

  console.log('\n  --- D. Keep recent 3, clear rest ---')

  await test('保留的工具结果内容不变', () => {
    const msgs = [
      userMsg('q1'),
      toolResultMsg('Read', 'OLD_CONTENT'),    // cleared
      toolResultMsg('Bash', 'KEPT_1'),         // kept (3rd from end)
      toolResultMsg('Grep', 'KEPT_2'),         // kept (2nd from end)
      toolResultMsg('Read', 'KEPT_3'),         // kept (1st from end)
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(60))
    assert.equal(result.toolsCleared, 1)
    assert.equal(result.toolsKept, 3)

    // Check kept messages are unchanged
    const keptResult2 = (result.messages[2] as any).content[0].result
    assert.equal(keptResult2, 'KEPT_1')
    const keptResult3 = (result.messages[3] as any).content[0].result
    assert.equal(keptResult3, 'KEPT_2')
    const keptResult4 = (result.messages[4] as any).content[0].result
    assert.equal(keptResult4, 'KEPT_3')
  })

  await test('被清除的工具结果替换为 CLEARED_MESSAGE', () => {
    const msgs = [
      userMsg('q1'),
      toolResultMsg('Read', 'TO_BE_CLEARED'),  // cleared
      toolResultMsg('Read', 'k1'),
      toolResultMsg('Read', 'k2'),
      toolResultMsg('Read', 'k3'),
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(60))
    const clearedResult = (result.messages[1] as any).content[0].result
    assert.equal(clearedResult, CLEARED_MESSAGE)
  })

  await test('仅 3 个或更少工具结果时不清除（无需压缩）', () => {
    const msgs = [
      userMsg('q1'),
      toolResultMsg('Read', 'c1'),
      toolResultMsg('Bash', 'c2'),
      toolResultMsg('Grep', 'c3'),
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(60))
    assert.equal(result.toolsCleared, 0)
    assert.equal(result.toolsKept, 0)
  })

  await test('自定义 keepRecent 为 1 — 只保留最后 1 个', () => {
    const msgs = [
      userMsg('q1'),
      toolResultMsg('Read', 'c1'),
      toolResultMsg('Read', 'c2'),
      toolResultMsg('Read', 'c3'),
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(60), { keepRecent: 1 })
    assert.equal(result.toolsCleared, 2)
    assert.equal(result.toolsKept, 1)
  })

  // ── Section E: 不修改原始消息（immutability）─────────────────────────────

  console.log('\n  --- E. Immutability ---')

  await test('原始消息数组不被修改', () => {
    const original = [
      userMsg('q1'),
      toolResultMsg('Read', 'ORIGINAL_CONTENT'),
      toolResultMsg('Read', 'k1'),
      toolResultMsg('Read', 'k2'),
      toolResultMsg('Read', 'k3'),
      assistantMsg('answer'),
    ]
    // Deep clone to compare later
    const snapshot = JSON.parse(JSON.stringify(original))

    microcompactMessages(original, minutesAgo(60))

    // Original should be unchanged
    assert.deepEqual(JSON.parse(JSON.stringify(original)), snapshot, 'original messages should not be mutated')
  })

  await test('返回的消息数组是新引用', () => {
    const original = [
      userMsg('q1'),
      toolResultMsg('Read', 'c1'),
      toolResultMsg('Read', 'c2'),
      toolResultMsg('Read', 'c3'),
      toolResultMsg('Read', 'c4'),
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(original, minutesAgo(60))
    assert.notEqual(result.messages, original, 'should return a new array reference')
  })

  // ── Section F: 非可压缩工具不受影响 ─────────────────────────────────────

  console.log('\n  --- F. Non-compactable tools unaffected ---')

  await test('非可压缩工具的结果不被清除', () => {
    const msgs = [
      userMsg('q1'),
      toolResultMsg('Read', 'c1'),           // compactable → cleared
      toolResultMsg('Read', 'c2'),           // compactable → cleared
      // Non-compactable tool
      {
        role: 'tool' as any,
        content: [{ type: 'tool-result', toolName: 'tool-search', result: 'tool list' } as any],
      } as ModelMessage,
      toolResultMsg('Read', 'k1'),           // compactable → kept
      toolResultMsg('Bash', 'k2'),           // compactable → kept
      toolResultMsg('Grep', 'k3'),           // compactable → kept
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(60))
    assert.equal(result.toolsCleared, 2)
    // Non-compactable tool-search result should be unchanged
    const toolSearchResult = (result.messages[3] as any).content[0].result
    assert.equal(toolSearchResult, 'tool list', 'non-compactable tool result should be unchanged')
  })

  await test('只有非可压缩工具时不清除任何内容', () => {
    const msgs = [
      userMsg('q1'),
      {
        role: 'tool' as any,
        content: [{ type: 'tool-result', toolName: 'tool-search', result: 'r1' } as any],
      } as ModelMessage,
      {
        role: 'tool' as any,
        content: [{ type: 'tool-result', toolName: 'spawn-agent', result: 'r2' } as any],
      } as ModelMessage,
      assistantMsg('answer'),
    ]
    const result = microcompactMessages(msgs, minutesAgo(60))
    assert.equal(result.toolsCleared, 0)
  })

  // ── Section G: extractLastAssistantTimestamp ─────────────────────────────

  console.log('\n  --- G. extractLastAssistantTimestamp ---')

  await test('找到最后 assistant 消息的 Date 时间戳', () => {
    const now = new Date()
    const messages = [
      { role: 'user', createdAt: new Date(Date.now() - 60000) },
      { role: 'assistant', createdAt: new Date(Date.now() - 30000) },
      { role: 'user', createdAt: now },
    ]
    const ts = extractLastAssistantTimestamp(messages)
    assert.ok(ts !== null)
    assert.equal(ts, messages[1]!.createdAt!.getTime())
  })

  await test('找到最后 assistant 消息的 string 时间戳', () => {
    const isoString = '2024-06-15T10:30:00.000Z'
    const messages = [
      { role: 'user' },
      { role: 'assistant', createdAt: isoString },
      { role: 'user' },
    ]
    const ts = extractLastAssistantTimestamp(messages)
    assert.ok(ts !== null)
    assert.equal(ts, new Date(isoString).getTime())
  })

  await test('多个 assistant 消息 — 返回最后一个的时间戳', () => {
    const messages = [
      { role: 'assistant', createdAt: new Date('2024-01-01T00:00:00Z') },
      { role: 'user' },
      { role: 'assistant', createdAt: new Date('2024-06-01T00:00:00Z') },
      { role: 'user' },
    ]
    const ts = extractLastAssistantTimestamp(messages)
    assert.equal(ts, new Date('2024-06-01T00:00:00Z').getTime())
  })

  // ── Section H: extractLastAssistantTimestamp 返回 null ──────────────────

  console.log('\n  --- H. extractLastAssistantTimestamp returns null ---')

  await test('没有 assistant 消息时返回 null', () => {
    const messages = [
      { role: 'user', createdAt: new Date() },
      { role: 'user', createdAt: new Date() },
    ]
    const ts = extractLastAssistantTimestamp(messages)
    assert.equal(ts, null)
  })

  await test('assistant 消息没有 createdAt 时返回 null', () => {
    const messages = [
      { role: 'user', createdAt: new Date() },
      { role: 'assistant' },
    ]
    const ts = extractLastAssistantTimestamp(messages)
    assert.equal(ts, null)
  })

  await test('空消息数组返回 null', () => {
    const ts = extractLastAssistantTimestamp([])
    assert.equal(ts, null)
  })

  await test('无效 createdAt 字符串返回 null', () => {
    const messages = [
      { role: 'assistant', createdAt: 'not-a-date' },
    ]
    const ts = extractLastAssistantTimestamp(messages)
    assert.equal(ts, null)
  })

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
  if (errors.length > 0) {
    console.log('Failures:')
    for (const e of errors) console.log(`  - ${e}`)
  }
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
