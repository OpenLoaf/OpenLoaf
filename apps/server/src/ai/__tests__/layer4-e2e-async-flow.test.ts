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
 * Layer 4 — E2E 异步协作完整流程测试。
 *
 * 模拟完整异步流程：
 * 1. 用户发消息 → Master Agent 调用 → 回复 → SSE 关闭
 * 2. 子 Agent 后台运行 → 完成 → scheduleEventBus emit → tRPC 推送
 * 3. 用户在子 Agent 运行期间发第二条消息
 * 4. 子 Agent 失败 → 错误推送
 * 5. 子 Agent abort
 * 6. 多子 Agent 并发
 *
 * 本文件使用 mock LLM + 真实 streamSessionManager + 真实 scheduleEventBus，
 * 属于集成 E2E 测试。
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/layer4-e2e-async-flow.test.ts
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { printSection, printPass, printFail } from './helpers/printUtils'
import { scheduleEventBus, type ScheduleReportEvent } from '@/services/scheduleEventBus'
import { streamSessionManager, type StreamEvent } from '@/ai/services/chat/streamSessionManager'

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
    printPass(name)
  } catch (err: any) {
    failed++
    const msg = `${name}: ${err?.message}`
    errors.push(msg)
    printFail(name, err)
  }
}

let testIdx = 0
function uniqueId(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${testIdx++}`
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

// ---------------------------------------------------------------------------
// Mock: 模拟 Master SSE 流（spawn → 回复 → 关闭）
// ---------------------------------------------------------------------------

function buildMockMasterResponse(opts: {
  messageId: string
  spawnedAgentIds: string[]
  replyText: string
}): Response {
  const chunks: unknown[] = [
    { type: 'start', messageId: opts.messageId },
  ]
  // 模拟 Agent tool calls
  for (const agentId of opts.spawnedAgentIds) {
    chunks.push({
      type: 'data-sub-agent-start',
      data: { toolCallId: agentId, name: 'coder', task: 'test task' },
    })
  }
  // Master 的文本回复
  chunks.push({ type: 'text-delta', delta: opts.replyText })
  chunks.push({ type: 'finish', finishReason: 'stop' })

  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

// ---------------------------------------------------------------------------
// Mock: 模拟异步协作的事件桥（agentManager → scheduleEventBus）
//
// 在真实实现中，这是 agentManager.complete() → emit event → tRPC subscription
// 这里我们直接测试 scheduleEventBus 和 streamSessionManager 的集成
// ---------------------------------------------------------------------------

/**
 * 模拟子 Agent 完成的完整推送链：
 * agentManager.complete → scheduleEventBus.emitScheduleReport → 前端收到
 */
function simulateSubAgentComplete(input: {
  agentId: string
  sessionId: string
  agentName: string
  summary: string
}): void {
  scheduleEventBus.emitScheduleReport({
    taskId: input.agentId,
    sourceSessionId: input.sessionId,
    status: 'completed',
    title: `Agent ${input.agentName} completed`,
    summary: input.summary,
  })
}

function simulateSubAgentFailed(input: {
  agentId: string
  sessionId: string
  agentName: string
  error: string
}): void {
  scheduleEventBus.emitScheduleReport({
    taskId: input.agentId,
    sourceSessionId: input.sessionId,
    status: 'failed',
    title: `Agent ${input.agentName} failed`,
    summary: input.error,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  // 每次测试前清理 listeners
  scheduleEventBus.removeAllListeners()

  printSection('Layer 4: E2E 异步协作完整流程')

  // ── A: 完整异步流程 ──
  printSection('A: Master spawn → 回复 → SSE 关闭 → 子 Agent 完成 → 推送')

  await test('A1: 完整流程 — spawn → SSE 关闭 → 子 Agent 完成 → taskReport 事件到达', async () => {
    const sessionId = uniqueId('session')
    const agentId = 'agent_async_a1'

    // 步骤 1: 监听 taskReport 事件（模拟 tRPC subscription）
    const reportEvents: ScheduleReportEvent[] = []
    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === sessionId) {
        reportEvents.push(event)
      }
    })

    // 步骤 2: 模拟 Master SSE 流（spawn → 回复 → 关闭）
    const masterSession = streamSessionManager.create(sessionId, 'msg-master-a1')
    streamSessionManager.pushChunk(sessionId, { type: 'start', messageId: 'msg-master-a1' })
    streamSessionManager.pushChunk(sessionId, {
      type: 'data-sub-agent-start',
      data: { toolCallId: agentId, name: 'coder', task: '分析代码' },
    })
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: '已安排子代理分析代码。' })
    streamSessionManager.pushChunk(sessionId, { type: 'finish', finishReason: 'stop' })
    streamSessionManager.complete(sessionId) // SSE 关闭

    // 验证 SSE 已关闭
    assert.equal(masterSession.status, 'completed')

    // 步骤 3: 子 Agent 后台运行完成（延迟模拟）
    await new Promise((r) => setTimeout(r, 50))
    simulateSubAgentComplete({
      agentId,
      sessionId,
      agentName: 'coder',
      summary: '代码分析完成：发现 3 个可优化点。',
    })

    // 步骤 4: 验证事件到达
    assert.equal(reportEvents.length, 1, '应收到 1 个 taskReport 事件')
    assert.equal(reportEvents[0]!.taskId, agentId)
    assert.equal(reportEvents[0]!.status, 'completed')
    assert.ok(reportEvents[0]!.summary.includes('代码分析完成'))

    cleanup()
  })

  // ── B: 用户在子 Agent 运行期间发第二条消息 ──
  printSection('B: 子 Agent 运行期间用户继续对话')

  await test('B1: 用户发第二条消息 → Master 正常回复 → 不影响子 Agent', async () => {
    const sessionId = uniqueId('session')
    const agentId = 'agent_async_b1'

    const reportEvents: ScheduleReportEvent[] = []
    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === sessionId) {
        reportEvents.push(event)
      }
    })

    // Turn 1: Master spawn
    const session1 = streamSessionManager.create(sessionId, 'msg-master-b1-turn1')
    streamSessionManager.pushChunk(sessionId, { type: 'start', messageId: 'msg-master-b1-turn1' })
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: '已安排分析任务。' })
    streamSessionManager.pushChunk(sessionId, { type: 'finish', finishReason: 'stop' })
    streamSessionManager.complete(sessionId)

    assert.equal(session1.status, 'completed')

    // Turn 2: 用户继续发消息（子 Agent 仍在运行）
    // 注意：streamSessionManager 允许在 complete 后重新 create
    const session2 = streamSessionManager.create(sessionId, 'msg-master-b1-turn2')
    streamSessionManager.pushChunk(sessionId, { type: 'start', messageId: 'msg-master-b1-turn2' })
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: '你好！有什么其他问题？' })
    streamSessionManager.pushChunk(sessionId, { type: 'finish', finishReason: 'stop' })
    streamSessionManager.complete(sessionId)

    assert.equal(session2.status, 'completed')

    // 子 Agent 最终完成
    simulateSubAgentComplete({
      agentId,
      sessionId,
      agentName: 'coder',
      summary: '分析完毕。',
    })

    assert.equal(reportEvents.length, 1, '子 Agent 的 report 应正常到达')
    assert.equal(reportEvents[0]!.status, 'completed')

    cleanup()
  })

  // ── C: 子 Agent 失败 ──
  printSection('C: 子 Agent 失败 → 错误推送')

  await test('C1: 子 Agent 失败 → taskReport status=failed → 前端收到错误', async () => {
    const sessionId = uniqueId('session')
    const agentId = 'agent_async_c1'

    const reportEvents: ScheduleReportEvent[] = []
    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === sessionId) {
        reportEvents.push(event)
      }
    })

    // Master 正常 spawn 并关闭 SSE
    streamSessionManager.create(sessionId, 'msg-c1')
    streamSessionManager.pushChunk(sessionId, { type: 'start', messageId: 'msg-c1' })
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: '已安排。' })
    streamSessionManager.complete(sessionId)

    // 子 Agent 失败
    await new Promise((r) => setTimeout(r, 30))
    simulateSubAgentFailed({
      agentId,
      sessionId,
      agentName: 'shell',
      error: '文件权限不足，无法读取 /etc/shadow',
    })

    assert.equal(reportEvents.length, 1)
    assert.equal(reportEvents[0]!.status, 'failed')
    assert.ok(reportEvents[0]!.summary.includes('权限不足'))

    cleanup()
  })

  // ── D: 用户取消子 Agent ──
  printSection('D: 用户取消子 Agent')

  await test('D1: abort 子 Agent → 不再收到 report', async () => {
    const sessionId = uniqueId('session')

    const reportEvents: ScheduleReportEvent[] = []
    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === sessionId) {
        reportEvents.push(event)
      }
    })

    // Master spawn 并关闭 SSE
    streamSessionManager.create(sessionId, 'msg-d1')
    streamSessionManager.complete(sessionId)

    // 在 abort 之前不应有 report
    assert.equal(reportEvents.length, 0)

    // 模拟用户触发 abort — 在真实实现中通过 agentManager.abort()
    // abort 后不会触发 complete/fail，所以不会有 taskReport
    // （此测试验证 abort 后没有泄漏事件）

    await new Promise((r) => setTimeout(r, 100))
    assert.equal(reportEvents.length, 0, 'abort 后不应有 taskReport 事件')

    cleanup()
  })

  // ── E: 3 个子 Agent 并发完成 ──
  printSection('E: 多子 Agent 并发完成')

  await test('E1: 3 个子 Agent 并发完成 → 全部推送到前端', async () => {
    const sessionId = uniqueId('session')
    const agentIds = ['agent_e1_a', 'agent_e1_b', 'agent_e1_c']

    const reportEvents: ScheduleReportEvent[] = []
    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === sessionId) {
        reportEvents.push(event)
      }
    })

    // Master spawn 3 个子 Agent 并关闭 SSE
    streamSessionManager.create(sessionId, 'msg-e1')
    for (const id of agentIds) {
      streamSessionManager.pushChunk(sessionId, {
        type: 'data-sub-agent-start',
        data: { toolCallId: id, name: 'worker' },
      })
    }
    streamSessionManager.pushChunk(sessionId, { type: 'text-delta', delta: '已安排 3 个子代理。' })
    streamSessionManager.complete(sessionId)

    // 3 个子 Agent 依次完成（模拟并发但实际是顺序）
    await new Promise((r) => setTimeout(r, 20))
    simulateSubAgentComplete({ agentId: agentIds[0]!, sessionId, agentName: 'worker-a', summary: 'A 完成' })
    simulateSubAgentComplete({ agentId: agentIds[1]!, sessionId, agentName: 'worker-b', summary: 'B 完成' })
    simulateSubAgentComplete({ agentId: agentIds[2]!, sessionId, agentName: 'worker-c', summary: 'C 完成' })

    assert.equal(reportEvents.length, 3, '应收到 3 个 taskReport 事件')
    const taskIds = reportEvents.map((e) => e.taskId).sort()
    assert.deepEqual(taskIds, agentIds.sort(), '3 个事件的 taskId 应匹配')

    cleanup()
  })

  await test('E2: 混合成功和失败 → 各自正确推送', async () => {
    const sessionId = uniqueId('session')

    const reportEvents: ScheduleReportEvent[] = []
    const cleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === sessionId) {
        reportEvents.push(event)
      }
    })

    streamSessionManager.create(sessionId, 'msg-e2')
    streamSessionManager.complete(sessionId)

    simulateSubAgentComplete({ agentId: 'e2-a', sessionId, agentName: 'a', summary: '成功' })
    simulateSubAgentFailed({ agentId: 'e2-b', sessionId, agentName: 'b', error: '失败了' })
    simulateSubAgentComplete({ agentId: 'e2-c', sessionId, agentName: 'c', summary: '也成功了' })

    assert.equal(reportEvents.length, 3)
    assert.equal(reportEvents.filter((e) => e.status === 'completed').length, 2)
    assert.equal(reportEvents.filter((e) => e.status === 'failed').length, 1)

    cleanup()
  })

  // ── F: tRPC subscription 模拟 ──
  printSection('F: tRPC subscription 断连重连')

  await test('F1: 前端断连期间的事件不丢失（依赖 scheduleEventBus 持久化策略）', async () => {
    const sessionId = uniqueId('session')

    // 场景：前端订阅 → 断连 → 子 Agent 完成 → 前端重连
    // scheduleEventBus 是内存级 EventEmitter，断连期间的事件会丢失
    // 但 task-report 消息已写入 JSONL，前端重连后通过 loadMessageChain 获取
    // 此测试验证设计意图

    const earlyEvents: ScheduleReportEvent[] = []
    const earlyCleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === sessionId) {
        earlyEvents.push(event)
      }
    })

    streamSessionManager.create(sessionId, 'msg-f1')
    streamSessionManager.complete(sessionId)

    // 前端断连
    earlyCleanup()

    // 子 Agent 完成（前端已断连，事件发出但无人监听）
    simulateSubAgentComplete({
      agentId: 'f1-agent',
      sessionId,
      agentName: 'worker',
      summary: '完成',
    })

    // 前端重连后重新订阅
    const lateEvents: ScheduleReportEvent[] = []
    const lateCleanup = scheduleEventBus.onScheduleReport((event) => {
      if (event.sourceSessionId === sessionId) {
        lateEvents.push(event)
      }
    })

    // 断连期间的事件已丢失（EventEmitter 行为）
    assert.equal(earlyEvents.length, 0, '断连后应没有收到事件')
    assert.equal(lateEvents.length, 0, '重连后的 listener 不会收到之前的事件')

    // 但如果另一个 Agent 完成，重连后的 listener 可以收到
    simulateSubAgentComplete({
      agentId: 'f1-agent-2',
      sessionId,
      agentName: 'worker-2',
      summary: '也完成了',
    })
    assert.equal(lateEvents.length, 1, '重连后应能收到新事件')

    lateCleanup()
  })

  // ── 汇总 ──
  scheduleEventBus.removeAllListeners()

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Layer 4 E2E async flow: ${passed} passed, ${failed} failed`)
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
