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
 * chatStreamAsyncService + aiChatAsyncRoutes 集成测试。
 *
 * 模拟 LLM 流的 SSE Response，验证：
 * - startChatStreamAsync 正确消费流并推送 chunk 到 listeners
 * - 幂等性（重复发起同一 session）
 * - abort 中止
 * - 实时 subscribe
 *
 * 用法：
 *   pnpm --filter server run test:chat:async
 */
import assert from 'node:assert/strict'
import { streamSessionManager } from '@/ai/services/chat/streamSessionManager'
import { startChatStreamAsync } from '@/ai/services/chat/async/chatStreamAsyncService'
import type { StreamEvent } from '@/ai/services/chat/streamSessionManager'

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

let testIdx = 0
function uniqueId() {
  return `async-test-${Date.now()}-${testIdx++}`
}

/** 构建模拟的 SSE Response body。 */
function buildMockSseResponse(chunks: unknown[]): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** 构建模拟的 executeFn，返回预设的 SSE 流。 */
function createMockExecuteFn(chunks: unknown[]) {
  let callCount = 0
  let lastSignal: AbortSignal | undefined

  const fn = async (input: {
    request: any
    cookies: Record<string, string>
    requestSignal: AbortSignal
  }) => {
    callCount++
    lastSignal = input.requestSignal
    return buildMockSseResponse(chunks)
  }

  return {
    fn,
    get callCount() { return callCount },
    get lastSignal() { return lastSignal },
  }
}

/** 等待直到条件满足或超时。 */
async function waitFor(
  condition: () => boolean,
  timeoutMs = 3000,
  intervalMs = 10,
): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timeout after ${timeoutMs}ms`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

async function main() {
  console.log('\n─── chatStreamAsyncService Tests ───\n')

  // ── startChatStreamAsync 基本流程 ──
  await test('startChatStreamAsync: 返回 sessionId 和 assistantMessageId', async () => {
    const sessionId = uniqueId()
    const chunks = [
      { type: 'start', messageId: 'assistant-123' },
      { type: 'text-delta', delta: 'Hello' },
      { type: 'finish', finishReason: 'stop' },
    ]
    const mock = createMockExecuteFn(chunks)

    const result = await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn: mock.fn,
    })

    assert.equal(result.sessionId, sessionId)
    assert.equal(result.assistantMessageId, 'assistant-123')
    assert.equal(mock.callCount, 1)

    // 等待流消费完毕
    await waitFor(() => {
      const session = streamSessionManager.get(sessionId)
      return session?.status !== 'streaming'
    })

    const session = streamSessionManager.get(sessionId)!
    assert.equal(session.status, 'completed')
  })

  await test('startChatStreamAsync: chunks 正确推送给 listeners', async () => {
    const sessionId = uniqueId()
    const chunks = [
      { type: 'start', messageId: 'msg-42' },
      { type: 'text-start', id: 'msg-42' },
      { type: 'text-delta', id: 'msg-42', delta: 'foo' },
      { type: 'text-delta', id: 'msg-42', delta: 'bar' },
      { type: 'text-end', id: 'msg-42' },
      { type: 'finish', finishReason: 'stop' },
    ]
    const mock = createMockExecuteFn(chunks)

    // 先创建 session 并订阅，以捕获所有 chunk
    streamSessionManager.create(sessionId, 'pre')
    const received: StreamEvent[] = []
    streamSessionManager.subscribe(sessionId, (event) => received.push(event))

    await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn: mock.fn,
    })

    await waitFor(() => streamSessionManager.get(sessionId)?.status === 'completed')

    // 6 个 chunk events + 1 个 complete event
    assert.equal(received.length, 7)
    assert.equal(received[0]!.type, 'chunk')
    assert.deepEqual((received[0] as any).chunk, { type: 'start', messageId: 'msg-42' })
    assert.equal(received[6]!.type, 'complete')
  })

  // ── 幂等性 ──
  await test('startChatStreamAsync: 幂等 — 已有活跃流返回现有', async () => {
    const sessionId = uniqueId()

    // 第一次调用使用慢流（不会立即完成）
    const slowChunks = [{ type: 'start', messageId: 'msg-slow' }]
    const slowResponse = (() => {
      // 创建一个不会自动结束的流
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      writer.write(new TextEncoder().encode(`data: ${JSON.stringify(slowChunks[0])}\n\n`))
      // 不关闭 writer，保持流打开

      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })()

    let execCount = 0
    const slowExecuteFn = async () => {
      execCount++
      return slowResponse
    }

    const result1 = await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn: slowExecuteFn,
    })

    // 等待 session 进入 streaming 状态
    await waitFor(() => {
      const session = streamSessionManager.get(sessionId)
      return session?.status === 'streaming'
    })

    const result2 = await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn: slowExecuteFn,
    })

    assert.equal(execCount, 1, 'executeFn 只应调用一次')
    assert.equal(result1.sessionId, result2.sessionId)
    assert.equal(result1.assistantMessageId, result2.assistantMessageId)

    // 清理：中止这个不会自动结束的流
    streamSessionManager.abort(sessionId)
  })

  // ── abort ──
  await test('startChatStreamAsync: abort 使用 session 的 AbortController', async () => {
    const sessionId = uniqueId()
    const chunks = [
      { type: 'start', messageId: 'msg-abort' },
    ]
    const mock = createMockExecuteFn(chunks)

    await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn: mock.fn,
    })

    // 等待流消费
    await waitFor(() => {
      const session = streamSessionManager.get(sessionId)
      return session?.status !== 'streaming'
    })

    // 验证 signal 传递
    assert.ok(mock.lastSignal, 'requestSignal 应传入 executeFn')
    assert.ok(
      mock.lastSignal instanceof AbortSignal,
      'requestSignal 应为 AbortSignal',
    )
  })

  // ── 空 body 处理 ──
  await test('startChatStreamAsync: 空 Response body 触发 fail', async () => {
    const sessionId = uniqueId()
    const emptyExecuteFn = async () => new Response(null)

    await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn: emptyExecuteFn,
    })

    await waitFor(() => {
      const session = streamSessionManager.get(sessionId)
      return session?.status !== 'streaming'
    })

    const session = streamSessionManager.get(sessionId)!
    assert.equal(session.status, 'error')
    assert.equal(session.errorMessage, 'Response body is null')
  })

  // ── Listener / 实时订阅 ──
  console.log('\n─── 实时订阅 Tests ───\n')

  await test('实时 subscribe: 断连重连后只收到后续事件', () => {
    const sessionId = uniqueId()
    streamSessionManager.create(sessionId, 'msg-sub')

    // 先写入一些 chunks（无 listener，模拟前端断连）
    streamSessionManager.pushChunk(sessionId, { type: 'start', messageId: 'msg-sub' })
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: '1' })

    // 模拟客户端重连：只订阅新事件，不重放历史
    const liveEvents: StreamEvent[] = []
    const unsub = streamSessionManager.subscribe(sessionId, (event) => liveEvents.push(event))

    // 后续 chunk
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: '2' })
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: '3' })
    streamSessionManager.complete(sessionId)

    // 验证：只收到重连后的实时事件
    assert.equal(liveEvents.length, 3, '实时收到 2 个 chunk + 1 个 complete')
    assert.equal(liveEvents[0]!.type, 'chunk')
    assert.equal(liveEvents[1]!.type, 'chunk')
    assert.equal(liveEvents[2]!.type, 'complete')

    unsub()
  })

  // ── 多 client 并发消费同一 session ──
  await test('多 client: 共享 session 独立 listener', () => {
    const sessionId = uniqueId()
    streamSessionManager.create(sessionId, 'msg-multi')

    const client1: StreamEvent[] = []
    const client2: StreamEvent[] = []
    const unsub1 = streamSessionManager.subscribe(sessionId, (e) => client1.push(e))
    const unsub2 = streamSessionManager.subscribe(sessionId, (e) => client2.push(e))

    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: 'shared' })

    // client1 断连
    unsub1()
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: 'only-client2' })

    assert.equal(client1.length, 1, 'client1 只收到断连前的')
    assert.equal(client2.length, 2, 'client2 收到全部')

    unsub2()
    streamSessionManager.complete(sessionId)
  })

  // ── executeFn signal 绑定验证 ──
  await test('abort: streamSessionManager.abort 触发 executeFn 的 requestSignal', async () => {
    const sessionId = uniqueId()

    let capturedSignal: AbortSignal | undefined
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    const executeFn = async (input: any) => {
      capturedSignal = input.requestSignal
      void writer.write(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: 'start', messageId: 'msg-sig' })}\n\n`),
      )
      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn,
    })

    // 等待 session 进入 streaming 状态
    await waitFor(() => streamSessionManager.get(sessionId)?.status === 'streaming')

    assert.ok(capturedSignal, 'requestSignal 应传入')
    assert.equal(capturedSignal!.aborted, false, '初始未 abort')

    streamSessionManager.abort(sessionId)
    assert.equal(capturedSignal!.aborted, true, 'abort 后 signal 应 aborted')

    // 关闭 writer 避免泄漏
    writer.close().catch(() => {})
  })

  // ── 打印结果 ──
  console.log(`\n─── Results: ${passed} passed, ${failed} failed ───\n`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Test runner error:', err)
  process.exit(1)
})
