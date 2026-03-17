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
 * StreamSessionManager 单元测试。
 *
 * 用法：
 *   pnpm --filter server run test:stream-session
 */
import assert from 'node:assert/strict'
import {
  streamSessionManager,
  type StreamEvent,
  type StreamSession,
} from '@/ai/services/chat/streamSessionManager'

let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    console.log(`  ✗ ${name}: ${err?.message ?? err}`)
  }
}

// ── 每个测试使用唯一 sessionId 避免相互干扰 ──
let testIdx = 0
function uniqueId() {
  return `test-session-${Date.now()}-${testIdx++}`
}

async function main() {
  console.log('\n─── StreamSessionManager Tests ───\n')

  // ── create ──
  await test('create: 返回新 session', () => {
    const id = uniqueId()
    const session = streamSessionManager.create(id, 'msg-1')
    assert.equal(session.sessionId, id)
    assert.equal(session.assistantMessageId, 'msg-1')
    assert.equal(session.status, 'streaming')
    assert.equal(session.chunks.length, 0)
    assert.ok(session.abortController instanceof AbortController)
    assert.ok(session.listeners instanceof Set)
    assert.ok(session.createdAt > 0)
  })

  await test('create: 幂等 — 已有 streaming session 返回现有', () => {
    const id = uniqueId()
    const s1 = streamSessionManager.create(id, 'msg-1')
    const s2 = streamSessionManager.create(id, 'msg-2')
    assert.equal(s1, s2, '应返回同一个 session 实例')
    assert.equal(s2.assistantMessageId, 'msg-1', 'assistantMessageId 不变')
  })

  await test('create: 非 streaming 时允许重建', () => {
    const id = uniqueId()
    const s1 = streamSessionManager.create(id, 'msg-1')
    streamSessionManager.complete(id)
    const s2 = streamSessionManager.create(id, 'msg-2')
    assert.notEqual(s1, s2, '应创建新 session')
    assert.equal(s2.assistantMessageId, 'msg-2')
    assert.equal(s2.status, 'streaming')
  })

  // ── get ──
  await test('get: 存在时返回 session', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const session = streamSessionManager.get(id)
    assert.ok(session)
    assert.equal(session!.sessionId, id)
  })

  await test('get: 不存在时返回 undefined', () => {
    const session = streamSessionManager.get('non-existent-' + Date.now())
    assert.equal(session, undefined)
  })

  // ── pushChunk ──
  await test('pushChunk: 追加 chunk 到 session', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'hello' })
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: ' world' })
    const session = streamSessionManager.get(id)!
    assert.equal(session.chunks.length, 2)
    assert.deepEqual(session.chunks[0], { type: 'text-delta', delta: 'hello' })
    assert.deepEqual(session.chunks[1], { type: 'text-delta', delta: ' world' })
  })

  await test('pushChunk: 非 streaming 状态时忽略', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    streamSessionManager.complete(id)
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'ignored' })
    const session = streamSessionManager.get(id)!
    assert.equal(session.chunks.length, 0)
  })

  await test('pushChunk: 通知 listeners', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const received: StreamEvent[] = []
    streamSessionManager.subscribe(id, (event) => received.push(event))

    streamSessionManager.pushChunk(id, { type: 'start', messageId: 'msg-1' })
    assert.equal(received.length, 1)
    assert.equal(received[0]!.type, 'chunk')
    assert.equal((received[0]! as any).index, 0)
    assert.deepEqual((received[0]! as any).chunk, { type: 'start', messageId: 'msg-1' })
  })

  // ── subscribe / unsubscribe ──
  await test('subscribe: 返回 unsubscribe 函数', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const received: StreamEvent[] = []
    const unsub = streamSessionManager.subscribe(id, (event) => received.push(event))

    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: '1' })
    assert.equal(received.length, 1)

    unsub()
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: '2' })
    assert.equal(received.length, 1, 'unsubscribe 后不再收到事件')
  })

  await test('subscribe: 不存在的 session 返回空 unsub', () => {
    const unsub = streamSessionManager.subscribe('no-such-id', () => {})
    unsub() // 不抛异常
  })

  // ── complete ──
  await test('complete: 设置 status 为 completed', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    streamSessionManager.complete(id)
    const session = streamSessionManager.get(id)!
    assert.equal(session.status, 'completed')
    assert.ok(session.completedAt! > 0)
  })

  await test('complete: 通知 listeners 并清空', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const received: StreamEvent[] = []
    streamSessionManager.subscribe(id, (event) => received.push(event))
    streamSessionManager.complete(id)
    assert.equal(received.length, 1)
    assert.equal(received[0]!.type, 'complete')
    assert.equal(streamSessionManager.get(id)!.listeners.size, 0)
  })

  await test('complete: 重复调用无效', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    streamSessionManager.complete(id)
    streamSessionManager.complete(id) // 不抛异常
    assert.equal(streamSessionManager.get(id)!.status, 'completed')
  })

  // ── fail ──
  await test('fail: 设置 status 为 error 并记录消息', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    streamSessionManager.fail(id, 'Model timeout')
    const session = streamSessionManager.get(id)!
    assert.equal(session.status, 'error')
    assert.equal(session.errorMessage, 'Model timeout')
    assert.ok(session.completedAt! > 0)
  })

  await test('fail: 通知 listeners', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const received: StreamEvent[] = []
    streamSessionManager.subscribe(id, (event) => received.push(event))
    streamSessionManager.fail(id, 'oops')
    assert.equal(received.length, 1)
    assert.equal(received[0]!.type, 'error')
    assert.equal((received[0]! as any).message, 'oops')
  })

  // ── abort ──
  await test('abort: 设置 status 为 aborted 并触发 AbortController', () => {
    const id = uniqueId()
    const session = streamSessionManager.create(id, 'msg-1')
    assert.equal(session.abortController.signal.aborted, false)
    streamSessionManager.abort(id)
    assert.equal(session.status, 'aborted')
    assert.equal(session.abortController.signal.aborted, true)
    assert.ok(session.completedAt! > 0)
  })

  await test('abort: 通知 listeners', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const received: StreamEvent[] = []
    streamSessionManager.subscribe(id, (event) => received.push(event))
    streamSessionManager.abort(id)
    assert.equal(received.length, 1)
    assert.equal(received[0]!.type, 'aborted')
  })

  await test('abort: 非 streaming 时无操作', () => {
    const id = uniqueId()
    const session = streamSessionManager.create(id, 'msg-1')
    streamSessionManager.complete(id)
    streamSessionManager.abort(id) // 不改变状态
    assert.equal(session.status, 'completed')
  })

  // ── 多 listener 并发 ──
  await test('多 listener: pushChunk 通知所有 listener', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const received1: StreamEvent[] = []
    const received2: StreamEvent[] = []
    streamSessionManager.subscribe(id, (event) => received1.push(event))
    streamSessionManager.subscribe(id, (event) => received2.push(event))

    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'hi' })
    assert.equal(received1.length, 1)
    assert.equal(received2.length, 1)
  })

  await test('多 listener: complete 通知所有并清空', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const received1: StreamEvent[] = []
    const received2: StreamEvent[] = []
    streamSessionManager.subscribe(id, (event) => received1.push(event))
    streamSessionManager.subscribe(id, (event) => received2.push(event))

    streamSessionManager.complete(id)
    assert.equal(received1.length, 1)
    assert.equal(received2.length, 1)
    assert.equal(received1[0]!.type, 'complete')
    assert.equal(received2[0]!.type, 'complete')
  })

  // ── listener 异常容错 ──
  await test('listener 异常不影响其他 listener', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    const received: StreamEvent[] = []

    streamSessionManager.subscribe(id, () => {
      throw new Error('bad listener')
    })
    streamSessionManager.subscribe(id, (event) => received.push(event))

    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'ok' })
    assert.equal(received.length, 1, '第二个 listener 仍应收到事件')
  })

  // ── activeCount ──
  await test('activeCount: 只统计 streaming 状态', () => {
    const baseCount = streamSessionManager.activeCount
    const id1 = uniqueId()
    const id2 = uniqueId()
    const id3 = uniqueId()
    streamSessionManager.create(id1, 'msg-1')
    streamSessionManager.create(id2, 'msg-2')
    streamSessionManager.create(id3, 'msg-3')
    assert.equal(streamSessionManager.activeCount, baseCount + 3)

    streamSessionManager.complete(id1)
    assert.equal(streamSessionManager.activeCount, baseCount + 2)

    streamSessionManager.fail(id2, 'err')
    assert.equal(streamSessionManager.activeCount, baseCount + 1)

    streamSessionManager.abort(id3)
    assert.equal(streamSessionManager.activeCount, baseCount)
  })

  // ── 端到端模拟：完整流生命周期 ──
  await test('E2E: 完整流 → pushChunk → complete', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')

    const allEvents: StreamEvent[] = []
    streamSessionManager.subscribe(id, (event) => allEvents.push(event))

    // 模拟 SSE 流
    streamSessionManager.pushChunk(id, { type: 'start', messageId: 'msg-1' })
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'Hello' })
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: ' World' })
    streamSessionManager.pushChunk(id, { type: 'finish', finishReason: 'stop' })
    streamSessionManager.complete(id)

    // 验证 chunks 缓冲
    const session = streamSessionManager.get(id)!
    assert.equal(session.chunks.length, 4)
    assert.equal(session.status, 'completed')

    // 验证 events 完整
    assert.equal(allEvents.length, 5) // 4 chunks + 1 complete
    assert.equal(allEvents[0]!.type, 'chunk')
    assert.equal(allEvents[4]!.type, 'complete')
  })

  await test('E2E: 断连重放 — offset 续接', () => {
    const id = uniqueId()
    const session = streamSessionManager.create(id, 'msg-1')

    // 写入一些 chunks
    streamSessionManager.pushChunk(id, { type: 'start', messageId: 'msg-1' })
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'A' })
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'B' })

    // 模拟第一个 client 连接并消费了 offset=0..1
    // 第二个 client 从 offset=2 重连
    const replayChunks = session.chunks.slice(2)
    assert.equal(replayChunks.length, 1)
    assert.deepEqual(replayChunks[0], { type: 'text-delta', delta: 'B' })

    // 新 listener 从 offset=3 开始接收
    const lateEvents: StreamEvent[] = []
    streamSessionManager.subscribe(id, (event) => lateEvents.push(event))

    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'C' })
    assert.equal(lateEvents.length, 1)
    assert.equal((lateEvents[0] as any).index, 3)
  })

  await test('E2E: abort 后 pushChunk 无效', () => {
    const id = uniqueId()
    streamSessionManager.create(id, 'msg-1')
    streamSessionManager.pushChunk(id, { type: 'start', messageId: 'msg-1' })

    streamSessionManager.abort(id)
    streamSessionManager.pushChunk(id, { type: 'text-delta', delta: 'ignored' })

    const session = streamSessionManager.get(id)!
    assert.equal(session.chunks.length, 1, 'abort 后不再追加 chunk')
  })

  // ── 打印结果 ──
  console.log(`\n─── Results: ${passed} passed, ${failed} failed ───\n`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Test runner error:', err)
  process.exit(1)
})
