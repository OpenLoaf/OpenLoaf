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
 * P0 回归测试 — TDD 先行模式。
 *
 * 这些测试针对架构审查发现的 4 个 P0 级问题编写。
 * **修复前应当失败**（证明 bug 存在），**修复后应当通过**。
 *
 * P0-1: executeFn 异常时 session 泄漏（status 永远为 streaming）
 * P0-2: streaming session 无超时保护（cleanup 跳过所有 streaming session）
 * P0-3: 重放与订阅缺少原子性 API（防御性需求）
 * P0-4: assistantMessageId 超时/缺失时返回空字符串
 *
 * 用法：
 *   pnpm --filter server run test:p0-regression
 */
import assert from 'node:assert/strict'
import { streamSessionManager } from '@/ai/services/chat/streamSessionManager'
import type { StreamEvent } from '@/ai/services/chat/streamSessionManager'
import { startChatStreamAsync } from '@/ai/services/chat/async/chatStreamAsyncService'

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
  return `p0-test-${Date.now()}-${testIdx++}`
}

function buildMockSseResponse(chunks: unknown[]): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 5000,
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
  console.log('\n═══ P0 Regression Tests (TDD — expect failures before fix) ═══\n')

  // ──────────────────────────────────────────────────────────────
  // P0-1: executeFn 异常时 session 泄漏
  //
  // BUG: startChatStreamAsync 在 line 54 创建 session（status=streaming），
  //      然后 line 57 await executeFn。如果 executeFn 抛异常，
  //      session 永远留在 streaming 状态，无人 complete/fail，造成内存泄漏。
  // ──────────────────────────────────────────────────────────────
  console.log('─── P0-1: executeFn 异常时 session 泄漏 ───\n')

  await test('P0-1a: executeFn 抛异常后 session.status 应为 error（非 streaming）', async () => {
    const sessionId = uniqueId()

    const throwingExecuteFn = async (_input: any) => {
      throw new Error('LLM provider connection refused')
    }

    try {
      await startChatStreamAsync({
        request: { sessionId, messages: [] },
        cookies: {},
        executeFn: throwingExecuteFn,
      })
    } catch {
      // startChatStreamAsync 可以选择抛出或内部处理，两种都可接受
    }

    const session = streamSessionManager.get(sessionId)
    assert.ok(session, 'session 应存在（已通过 create 创建）')
    assert.equal(
      session!.status,
      'error',
      `session.status 应为 "error"，实际为 "${session!.status}"（bug: 永远留在 streaming）`,
    )
  })

  await test('P0-1b: executeFn 抛异常后 session.errorMessage 应包含错误信息', async () => {
    const sessionId = uniqueId()

    const throwingExecuteFn = async (_input: any) => {
      throw new Error('rate limit exceeded')
    }

    try {
      await startChatStreamAsync({
        request: { sessionId, messages: [] },
        cookies: {},
        executeFn: throwingExecuteFn,
      })
    } catch {}

    const session = streamSessionManager.get(sessionId)
    assert.ok(session, 'session 应存在')
    assert.ok(
      session!.errorMessage,
      `errorMessage 应被设置（当前为 undefined，bug: executeFn 异常未被 catch）`,
    )
  })

  await test('P0-1c: executeFn 抛异常不应导致 activeCount 虚增', async () => {
    const baseCount = streamSessionManager.activeCount
    const sessionId = uniqueId()

    const throwingExecuteFn = async (_input: any) => {
      throw new Error('boom')
    }

    try {
      await startChatStreamAsync({
        request: { sessionId, messages: [] },
        cookies: {},
        executeFn: throwingExecuteFn,
      })
    } catch {}

    assert.equal(
      streamSessionManager.activeCount,
      baseCount,
      `activeCount 应回到 ${baseCount}（bug: 泄漏的 streaming session 导致 +1）`,
    )
  })

  // ──────────────────────────────────────────────────────────────
  // P0-2: streaming session 无超时保护
  //
  // BUG: cleanup() 无条件跳过 status=streaming 的 session。
  //      如果 LLM 流卡住或网络异常导致 consumeResponseStream 挂起，
  //      session 永远不会被清理，最终耗尽内存。
  // ──────────────────────────────────────────────────────────────
  console.log('\n─── P0-2: streaming session 无超时保护 ───\n')

  await test('P0-2a: 超时 streaming session 应被 cleanup 清理', () => {
    const sessionId = uniqueId()
    const session = streamSessionManager.create(sessionId, 'msg-stuck')

    // 模拟 session 创建于 10 分钟前（远超任何合理的流超时阈值）
    session.createdAt = Date.now() - 600_000

    // 手动触发 cleanup
    ;(streamSessionManager as any).cleanup()

    const afterCleanup = streamSessionManager.get(sessionId)
    assert.equal(
      afterCleanup,
      undefined,
      'streaming 超时 session 应被清理（bug: cleanup() 跳过所有 streaming session）',
    )
  })

  await test('P0-2b: 正常时长 streaming session 不应被 cleanup 清理', () => {
    const sessionId = uniqueId()
    streamSessionManager.create(sessionId, 'msg-active')

    // session.createdAt 是刚创建的，不应被清理
    ;(streamSessionManager as any).cleanup()

    const afterCleanup = streamSessionManager.get(sessionId)
    assert.ok(afterCleanup, '新创建的 streaming session 不应被清理')
    assert.equal(afterCleanup!.status, 'streaming')

    // 清理测试 session
    streamSessionManager.abort(sessionId)
  })

  await test('P0-2c: 超时清理应触发 AbortController（让卡住的 LLM 流停止）', () => {
    const sessionId = uniqueId()
    const session = streamSessionManager.create(sessionId, 'msg-stuck-abort')

    // 模拟过期
    session.createdAt = Date.now() - 600_000

    ;(streamSessionManager as any).cleanup()

    assert.equal(
      session.abortController.signal.aborted,
      true,
      '超时清理应触发 AbortController.abort()（bug: cleanup 从不 abort streaming session）',
    )
  })

  await test('P0-2d: 超时清理应通知所有 listeners', () => {
    const sessionId = uniqueId()
    const session = streamSessionManager.create(sessionId, 'msg-stuck-notify')
    const received: StreamEvent[] = []
    streamSessionManager.subscribe(sessionId, (event) => received.push(event))

    // 模拟过期
    session.createdAt = Date.now() - 600_000

    ;(streamSessionManager as any).cleanup()

    assert.ok(
      received.length > 0,
      '超时清理应通知 listeners（bug: cleanup 不通知任何 listener）',
    )
    // 通知类型应为 aborted 或 error
    assert.ok(
      received[0]!.type === 'aborted' || received[0]!.type === 'error',
      `通知类型应为 aborted 或 error（实际: ${received[0]?.type}）`,
    )
  })

  // ──────────────────────────────────────────────────────────────
  // P0-3: 重放与订阅缺少原子性 API
  //
  // 当前 route 中 GET /stream 的实现是：先遍历 chunks[offset:]
  // 重放，再调用 subscribe 订阅新事件。虽然在 Node.js 单线程中
  // 同步执行是安全的，但缺少原子 API 意味着：
  // - 如果未来代码引入 await（如 auth 校验），竞态会被激活
  // - 调用者需要了解内部实现细节才能正确使用
  //
  // 应提供 subscribeFromOffset(id, offset, listener) 原子方法。
  // ──────────────────────────────────────────────────────────────
  console.log('\n─── P0-3: 重放与订阅原子性保障 ───\n')

  await test('P0-3a: StreamSessionManager 应提供 subscribeFromOffset 原子方法', () => {
    const hasAtomicApi = typeof (streamSessionManager as any).subscribeFromOffset === 'function'
    assert.ok(
      hasAtomicApi,
      'StreamSessionManager 应提供 subscribeFromOffset(sessionId, offset, listener) 原子方法',
    )
  })

  await test('P0-3b: subscribeFromOffset 应先重放再订阅，保证无遗漏', () => {
    const sessionId = uniqueId()
    streamSessionManager.create(sessionId, 'msg-atomic')

    // 预填充 3 个 chunks
    streamSessionManager.pushChunk(sessionId, { type: 'start', messageId: 'msg-atomic' })
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: 'A' })
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: 'B' })

    const allReceived: StreamEvent[] = []

    // 使用原子 API 从 offset=1 开始订阅
    const subscribeFromOffset = (streamSessionManager as any).subscribeFromOffset
    assert.ok(subscribeFromOffset, 'subscribeFromOffset 方法不存在')

    const unsub = subscribeFromOffset.call(
      streamSessionManager,
      sessionId,
      1,
      (event: StreamEvent) => allReceived.push(event),
    )

    // 推送新 chunk
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: 'C' })

    // 应收到：重放的 chunks[1]、chunks[2] + 实时的 chunk C
    assert.equal(allReceived.length, 3, `应收到 3 个事件（重放 2 + 实时 1），实际 ${allReceived.length}`)

    // 验证顺序正确
    assert.equal((allReceived[0] as any).chunk?.delta, 'A', '第 1 个应为重放的 A')
    assert.equal((allReceived[1] as any).chunk?.delta, 'B', '第 2 个应为重放的 B')
    assert.equal((allReceived[2] as any).chunk?.delta, 'C', '第 3 个应为实时的 C')

    unsub()
    streamSessionManager.abort(sessionId)
  })

  // ──────────────────────────────────────────────────────────────
  // P0-4: assistantMessageId 超时/缺失返回空字符串
  //
  // BUG: waitForAssistantMessageId 在超时或流结束但无 start chunk 时
  //      resolve 空字符串。这导致前端拿到无意义的空 ID，无法关联
  //      消息。应当预生成 UUID 或抛出明确错误。
  // ──────────────────────────────────────────────────────────────
  console.log('\n─── P0-4: assistantMessageId 空字符串问题 ───\n')

  await test('P0-4a: 无 start chunk 时应返回有意义的 ID 或抛出错误', async () => {
    const sessionId = uniqueId()

    // executeFn 返回没有 start chunk 的响应（模拟异常的 LLM 流）
    const noStartChunks = [
      { type: 'text-delta', delta: 'orphan text' },
      { type: 'finish', finishReason: 'stop' },
    ]
    const executeFn = async (_input: any) => buildMockSseResponse(noStartChunks)

    let result: any
    let threw = false
    try {
      result = await startChatStreamAsync({
        request: { sessionId, messages: [] },
        cookies: {},
        executeFn,
      })
    } catch {
      threw = true
    }

    // 等待流消费完毕
    await waitFor(() => streamSessionManager.get(sessionId)?.status !== 'streaming', 3000)

    // 正确行为：要么抛出错误，要么返回非空 assistantMessageId（预生成 UUID）
    assert.ok(
      threw || (result?.assistantMessageId && result.assistantMessageId.length > 0),
      `无 start chunk 时应抛错或返回预生成 ID（bug: 当前返回空字符串 "${result?.assistantMessageId}"）`,
    )
  })

  await test('P0-4b: 正常 start chunk 仍应正确获取 assistantMessageId', async () => {
    const sessionId = uniqueId()

    const chunks = [
      { type: 'start', messageId: 'expected-msg-id' },
      { type: 'text-delta', delta: 'Hello' },
      { type: 'finish', finishReason: 'stop' },
    ]
    const executeFn = async (_input: any) => buildMockSseResponse(chunks)

    const result = await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn,
    })

    assert.equal(
      result.assistantMessageId,
      'expected-msg-id',
      '正常 start chunk 应返回正确的 assistantMessageId',
    )

    await waitFor(() => streamSessionManager.get(sessionId)?.status !== 'streaming')
  })

  await test('P0-4c: 延迟到达的 start chunk 仍应被正确捕获', async () => {
    const sessionId = uniqueId()

    // 创建慢响应：先发 text-delta，100ms 后才发 start chunk
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const enc = new TextEncoder()

    const executeFn = async (_input: any) => {
      // 异步延迟发送 chunks（模拟慢 provider）
      setTimeout(async () => {
        try {
          await writer.write(enc.encode(
            `data: ${JSON.stringify({ type: 'text-delta', delta: 'early' })}\n\n`,
          ))
          setTimeout(async () => {
            try {
              await writer.write(enc.encode(
                `data: ${JSON.stringify({ type: 'start', messageId: 'delayed-id' })}\n\n`,
              ))
              await writer.write(enc.encode(
                `data: ${JSON.stringify({ type: 'finish', finishReason: 'stop' })}\n\n`,
              ))
              await writer.close()
            } catch {}
          }, 100)
        } catch {}
      }, 50)

      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    const result = await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn,
    })

    assert.equal(
      result.assistantMessageId,
      'delayed-id',
      `延迟到达的 start chunk 应被正确捕获（实际: "${result.assistantMessageId}"）`,
    )

    await waitFor(() => streamSessionManager.get(sessionId)?.status !== 'streaming')
  })

  // ═══ 综合验证：修复不应破坏现有功能 ═══
  console.log('\n─── 回归保护：现有功能不应被破坏 ───\n')

  await test('回归: 正常流程仍应完整工作', async () => {
    const sessionId = uniqueId()
    const chunks = [
      { type: 'start', messageId: 'reg-msg-1' },
      { type: 'text-delta', delta: 'Hello World' },
      { type: 'finish', finishReason: 'stop' },
    ]
    const executeFn = async (_input: any) => buildMockSseResponse(chunks)

    const result = await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn,
    })

    assert.equal(result.sessionId, sessionId)
    assert.equal(result.assistantMessageId, 'reg-msg-1')

    await waitFor(() => streamSessionManager.get(sessionId)?.status === 'completed')

    const session = streamSessionManager.get(sessionId)!
    assert.equal(session.status, 'completed')
  })

  await test('回归: 幂等性仍应生效', async () => {
    const sessionId = uniqueId()

    // 使用不会自动结束的流
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const enc = new TextEncoder()

    let execCount = 0
    const executeFn = async (_input: any) => {
      execCount++
      void writer.write(enc.encode(
        `data: ${JSON.stringify({ type: 'start', messageId: 'idem-msg' })}\n\n`,
      ))
      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    const r1 = await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn,
    })

    await waitFor(() => streamSessionManager.get(sessionId)?.status === 'streaming')

    const r2 = await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn,
    })

    assert.equal(execCount, 1, 'executeFn 只应调用一次')
    assert.equal(r1.sessionId, r2.sessionId)
    assert.equal(r1.assistantMessageId, r2.assistantMessageId)

    // 清理
    streamSessionManager.abort(sessionId)
    writer.close().catch(() => {})
  })

  await test('回归: abort 仍应正常工作', async () => {
    const sessionId = uniqueId()
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const enc = new TextEncoder()

    let capturedSignal: AbortSignal | undefined
    const executeFn = async (input: any) => {
      capturedSignal = input.requestSignal
      void writer.write(enc.encode(
        `data: ${JSON.stringify({ type: 'start', messageId: 'abort-msg' })}\n\n`,
      ))
      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    await startChatStreamAsync({
      request: { sessionId, messages: [] },
      cookies: {},
      executeFn,
    })

    await waitFor(() => streamSessionManager.get(sessionId)?.status === 'streaming')

    assert.ok(capturedSignal)
    assert.equal(capturedSignal!.aborted, false)

    streamSessionManager.abort(sessionId)
    assert.equal(capturedSignal!.aborted, true)

    writer.close().catch(() => {})
  })

  // ── 打印结果 ──
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(`    P0 Results: ${passed} passed, ${failed} failed`)
  console.log('═══════════════════════════════════════════════════════════')
  if (failed > 0) {
    console.log('\n  预期行为：修复前 P0 测试应当失败（证明 bug 存在）')
    console.log('  修复后请重新运行，确认全部通过\n')
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Test runner error:', err)
  process.exit(1)
})
