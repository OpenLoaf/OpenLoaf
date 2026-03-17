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
 * P1 回归测试 — transport-async SSE 消费逻辑。
 *
 * TDD 先行：修复前应失败（证明 bug 存在），修复后应通过。
 *
 * P1-3: attempt 成功读取数据后不重置，长流多次断线后耗尽重连次数
 *
 * 用法：
 *   pnpm --filter web run test:run -- src/lib/ai/__tests__/transport-async-p1.vitest.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { consumeSseStream, createChunkStream } from '../transport-async'

// ── Helpers ──

/** 创建正常完成的 SSE Response（fetch mock 用）。 */
function createSseResponse(chunks: unknown[]): Response {
  const data = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(data))
        controller.close()
      },
    }),
    { status: 200 },
  )
}

/**
 * 创建先返回数据、然后抛错的 SSE Response。
 *
 * 模拟网络中途断开：reader.read() 先返回数据，再 reject。
 * 使用 pull-based ReadableStream：第一次 pull 返回数据，第二次 pull 抛错。
 */
function createErroringSseResponse(chunks: unknown[], error: Error): Response {
  const encoder = new TextEncoder()
  let pulled = false
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (!pulled) {
          pulled = true
          const data = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
          controller.enqueue(encoder.encode(data))
        } else {
          controller.error(error)
        }
      },
    }),
    { status: 200 },
  )
}

// ── Tests ──

describe('consumeSseStream — P1 regression', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  // ─── 基本功能回归 ───

  it('回归: 正常 SSE 流应正确消费所有 chunk', async () => {
    const chunks = [
      { type: 'start', messageId: 'msg-1' },
      { type: 'text-delta', delta: 'Hello' },
      { type: 'finish', finishReason: 'stop' },
    ]
    globalThis.fetch = vi.fn(async () => createSseResponse(chunks))

    const received: unknown[] = []
    let done = false

    await consumeSseStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
      attempt: 0,
      onChunk(chunk) {
        received.push(chunk)
      },
      onDone() {
        done = true
      },
      onError() {},
    })

    expect(received).toEqual(chunks)
    expect(done).toBe(true)
  })

  // ─── P1-3: 断线重连 ───

  it('P1-3a: 断线后应自动重连并继续消费', async () => {
    const fetchUrls: string[] = []

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      fetchUrls.push(url)

      if (fetchUrls.length === 1) {
        // 第一次：返回 3 个 chunk 然后断开
        return createErroringSseResponse(
          [
            { type: 'start', messageId: 'msg-1' },
            { type: 'text-delta', delta: 'A' },
            { type: 'text-delta', delta: 'B' },
          ],
          new Error('network drop'),
        )
      }
      // 第二次：正常完成
      return createSseResponse([
        { type: 'text-delta', delta: 'C' },
        { type: 'finish', finishReason: 'stop' },
      ])
    })

    const received: unknown[] = []
    let done = false

    await consumeSseStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
      attempt: 0,
      onChunk(chunk) {
        received.push(chunk)
      },
      onDone() {
        done = true
      },
      onError() {},
    })

    expect(fetchUrls.length).toBe(2)
    // 重连 URL 不含 offset（已移除 offset 逻辑）
    expect(fetchUrls[1]).not.toContain('offset')
    expect(received.length).toBe(5)
    expect(done).toBe(true)
  })

  // ─── P1-3: attempt 应在成功读取数据后重置 ───

  it('P1-3b: 连续多次断线重连应成功（attempt 应重置）', async () => {
    const TOTAL_ERROR_STREAMS = 7 // 超过 MAX_RECONNECT_ATTEMPTS (5)
    let fetchCallCount = 0

    globalThis.fetch = vi.fn(async () => {
      fetchCallCount++

      if (fetchCallCount <= TOTAL_ERROR_STREAMS) {
        // 每次返回 1 个 chunk 然后断开
        return createErroringSseResponse(
          [{ type: 'text-delta', delta: `chunk-${fetchCallCount}` }],
          new Error('network drop'),
        )
      }
      // 最后一次正常完成
      return createSseResponse([{ type: 'finish', finishReason: 'stop' }])
    })

    const received: unknown[] = []
    let done = false
    let error: Error | null = null

    await consumeSseStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
      attempt: 0,
      onChunk(chunk) {
        received.push(chunk)
      },
      onDone() {
        done = true
      },
      onError(err) {
        error = err
      },
    })

    // 修复后：所有 7 次断线都成功重连 + 1 次正常完成 = 8 次 fetch
    // 当前 bug：第 6 次断线 (attempt=5) 时 onError 被调用，仅 6 次 fetch
    expect(error).toBeNull()
    expect(done).toBe(true)
    expect(fetchCallCount).toBe(TOTAL_ERROR_STREAMS + 1)
    expect(received.length).toBe(TOTAL_ERROR_STREAMS + 1) // 7 partial + 1 finish
  }, 30_000) // generous timeout for real delays

  it('P1-3c: 连续 fetch 失败（无数据）应仍遵守 MAX_RECONNECT_ATTEMPTS', async () => {
    let fetchCallCount = 0

    globalThis.fetch = vi.fn(async () => {
      fetchCallCount++
      // 每次 fetch 都直接失败（模拟服务器不可达）
      throw new Error('ECONNREFUSED')
    })

    let error: Error | null = null

    await consumeSseStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
      attempt: 0,
      onChunk() {},
      onDone() {},
      onError(err) {
        error = err
      },
    })

    // 即使修复 attempt 重置，连续失败（无数据）仍应在 MAX_RECONNECT_ATTEMPTS 后放弃
    // 初始 1 次 + 5 次重试 = 6 次
    expect(error).not.toBeNull()
    expect(error!.message).toBe('ECONNREFUSED')
    expect(fetchCallCount).toBe(6) // 1 initial + 5 retries
  }, 30_000)

  it('P1-3d: 成功读取后 attempt 重置 → 又一轮连续失败仍有完整重试次数', async () => {
    let fetchCallCount = 0

    globalThis.fetch = vi.fn(async () => {
      fetchCallCount++

      if (fetchCallCount === 1) {
        // 第一次：成功返回数据，然后断开
        return createErroringSseResponse(
          [{ type: 'text-delta', delta: 'data' }],
          new Error('drop after data'),
        )
      }
      // 后续：连续 fetch 失败
      throw new Error('ECONNREFUSED')
    })

    let error: Error | null = null
    const received: unknown[] = []

    await consumeSseStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
      attempt: 0,
      onChunk(chunk) {
        received.push(chunk)
      },
      onDone() {},
      onError(err) {
        error = err
      },
    })

    // 1 次成功 + 断线后 attempt 重置 + 6 次连续失败 (1 initial + 5 retries) = 7 次 fetch
    // 当前 bug: attempt 未重置，连续失败只有 5 次重试 = 6 次 fetch
    expect(received.length).toBe(1) // 第一次读到的数据
    expect(error).not.toBeNull()
    expect(fetchCallCount).toBe(7) // 1 success + 6 fails (1 initial + 5 retries)
  }, 30_000)

  // ─── AbortError 处理 ───

  it('回归: AbortError 在 fetch 阶段应调用 onDone', async () => {
    // 使用 Error + name 而非 DOMException（jsdom 中 DOMException 不继承 Error）
    const abortError = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
    globalThis.fetch = vi.fn(async () => {
      throw abortError
    })

    let done = false

    await consumeSseStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
      attempt: 0,
      onChunk() {},
      onDone() {
        done = true
      },
      onError() {},
    })

    expect(done).toBe(true)
  })

  it('回归: 404 响应应调用 onError', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 404 }))

    let error: Error | null = null

    await consumeSseStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
      attempt: 0,
      onChunk() {},
      onDone() {},
      onError(err) {
        error = err
      },
    })

    expect(error).not.toBeNull()
    expect(error!.message).toBe('Session not found')
  })
})

// ── createChunkStream — 错误检测 ──

describe('createChunkStream — error finish detection', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('finish(finishReason: "error") 应使 ReadableStream 报错，错误消息取自 text-delta', async () => {
    const errorText = '请求失败：模型服务商未配置'
    const chunks = [
      { type: 'start', messageId: 'msg-1' },
      { type: 'text-start', id: 'msg-1' },
      { type: 'text-delta', id: 'msg-1', delta: errorText },
      { type: 'text-end', id: 'msg-1' },
      { type: 'finish', finishReason: 'error' },
    ]
    globalThis.fetch = vi.fn(async () => createSseResponse(chunks))

    const stream = createChunkStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
    })

    const reader = stream.getReader()
    const received: unknown[] = []
    let caughtError: Error | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received.push(value)
      }
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err))
    }

    // finish(finishReason: "error") 不应被 enqueue，而是触发 stream error
    expect(caughtError).not.toBeNull()
    expect(caughtError!.message).toBe(errorText)
    // finish 之前的 chunk 被 enqueue，但 controller.error() 后 stream 进入 errored 状态，
    // 后续 read() 立即 reject，所以实际读取数量取决于 JS 事件循环时序。
    // 关键断言：error 被正确捕获且消息内容正确。
    expect(received.length).toBeGreaterThanOrEqual(1)
  })

  it('正常 finish(finishReason: "stop") 不应触发 stream error', async () => {
    const chunks = [
      { type: 'start', messageId: 'msg-1' },
      { type: 'text-start', id: 'msg-1' },
      { type: 'text-delta', id: 'msg-1', delta: 'Hello world' },
      { type: 'text-end', id: 'msg-1' },
      { type: 'finish', finishReason: 'stop' },
    ]
    globalThis.fetch = vi.fn(async () => createSseResponse(chunks))

    const stream = createChunkStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
    })

    const reader = stream.getReader()
    const received: unknown[] = []
    let caughtError: Error | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received.push(value)
      }
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err))
    }

    // 正常完成，所有 5 个 chunk 都应 enqueue
    expect(caughtError).toBeNull()
    expect(received.length).toBe(5)
  })

  it('无 text-delta 的 error finish 应使用 fallback 错误消息', async () => {
    const chunks = [
      { type: 'start', messageId: 'msg-1' },
      { type: 'finish', finishReason: 'error' },
    ]
    globalThis.fetch = vi.fn(async () => createSseResponse(chunks))

    const stream = createChunkStream({
      asyncBase: 'http://test',
      sessionId: 's1',
      headers: {},
    })

    const reader = stream.getReader()
    let caughtError: Error | null = null

    try {
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err))
    }

    expect(caughtError).not.toBeNull()
    expect(caughtError!.message).toBe('AI request failed')
  })
})
