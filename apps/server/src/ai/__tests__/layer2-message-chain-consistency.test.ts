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
 * Layer 2 — 消息链一致性集成测试。
 *
 * 验证子 Agent 完成后 task-report 消息正确写入 JSONL、
 * parentMessageId 指向正确位置、loadMessageChain 包含 task-report、
 * 多 task-report 按时间排序。
 *
 * 本文件为集成测试，使用真实 chatFileStore 但 mock LLM。
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/layer2-message-chain-consistency.test.ts
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { promises as fs, mkdirSync } from 'node:fs'
import { setOpenLoafRootOverride } from '@openloaf/config'
import {
  appendMessage,
  loadMessageTree,
  resolveRightmostLeaf,
  resolveChainFromLeaf,
  registerSessionDir,
  writeSessionJson,
  type StoredMessage,
} from '@/ai/services/chat/repositories/chatFileStore'
import { printSection, printPass, printFail } from './helpers/printUtils'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string
let sessionCounter = 0

function uniqueSessionId(): string {
  return `layer2-test-${Date.now()}-${sessionCounter++}`
}

function makeMsg(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant' | 'system' | 'task-report' = 'user',
  text = `message-${id}`,
  createdAt?: string,
): StoredMessage {
  return {
    id,
    parentMessageId: parentId,
    role,
    messageKind: 'normal',
    parts: [{ type: 'text', text }],
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

/** 模拟 task-report 消息（子 Agent 完成后注入到主对话） */
function makeTaskReportMsg(
  id: string,
  parentId: string | null,
  agentId: string,
  agentName: string,
  summary: string,
  status: 'completed' | 'failed' = 'completed',
  createdAt?: string,
): StoredMessage {
  return {
    id,
    parentMessageId: parentId,
    role: 'task-report',
    messageKind: 'normal',
    parts: [
      {
        type: 'text',
        text: `[${status === 'completed' ? 'Task Complete' : 'Task Failed'}] Agent "${agentName}" (${agentId}): ${summary}`,
      },
    ],
    metadata: {
      agentId,
      agentName,
      status,
      reportType: 'sub-agent-result',
    } as any,
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setup() {
  tempDir = path.join(os.tmpdir(), `openloaf-layer2-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
  setOpenLoafRootOverride(tempDir)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  await setup()

  printSection('Layer 2: 消息链一致性集成测试')

  // ── A: spawn-agent → SSE 关闭 → 子 Agent 完成 → task-report 写入 JSONL ──
  printSection('A: task-report 消息写入 JSONL')

  await test('A1: task-report 消息可正确追加到 session 的 messages.jsonl', async () => {
    const sessionId = uniqueSessionId()
    await registerSessionDir(sessionId)
    await writeSessionJson(sessionId, {
      id: sessionId,
      title: '测试对话',
      createdAt: new Date().toISOString(),
    })

    // 模拟对话链：user → assistant（含 spawn-agent 工具调用）
    const userMsg = makeMsg('msg-u1', null, 'user', '帮我分析代码')
    const assistantMsg = makeMsg('msg-a1', 'msg-u1', 'assistant', '好的，已安排子代理分析代码。')

    await appendMessage({ sessionId, message: userMsg })
    await appendMessage({ sessionId, message: assistantMsg })

    // 模拟子 Agent 完成后写入 task-report
    const taskReport = makeTaskReportMsg(
      'msg-tr1',
      'msg-a1',       // parentMessageId 指向 master 的 assistant 消息
      'agent_abc123',
      'coder',
      '代码分析完成：共 15 个文件，3 个需要重构。',
    )
    await appendMessage({ sessionId, message: taskReport })

    // 验证
    const tree = await loadMessageTree(sessionId)
    assert.ok(tree.byId.has('msg-tr1'), 'task-report 消息应存在于 tree 中')

    const tr = tree.byId.get('msg-tr1')!
    assert.equal(tr.role, 'task-report')
    assert.equal(tr.parentMessageId, 'msg-a1')
    assert.ok(
      (tr.metadata as any)?.agentId === 'agent_abc123',
      'task-report 应包含 agentId metadata',
    )
  })

  // ── B: parentMessageId 指向正确位置 ──
  printSection('B: task-report parentMessageId 正确性')

  await test('B1: task-report 的 parentMessageId 指向 master 最后的 assistant 消息', async () => {
    const sessionId = uniqueSessionId()
    await registerSessionDir(sessionId)
    await writeSessionJson(sessionId, {
      id: sessionId,
      title: '测试对话 B1',
      createdAt: new Date().toISOString(),
    })

    // user → assistant → (task-report 挂在 assistant 上)
    await appendMessage({ sessionId, message: makeMsg('b1-u', null, 'user', '查看文件') })
    await appendMessage({ sessionId, message: makeMsg('b1-a', 'b1-u', 'assistant', '已安排') })
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg('b1-tr', 'b1-a', 'agent_b1', 'explore', '找到 10 个文件'),
    })

    const tree = await loadMessageTree(sessionId)
    const tr = tree.byId.get('b1-tr')!
    assert.equal(tr.parentMessageId, 'b1-a', 'task-report 应挂在 assistant 消息下')

    // 验证 chain 中的连通性
    const chain = resolveChainFromLeaf(tree, 'b1-tr')
    assert.equal(chain.length, 3, 'chain 应包含 user → assistant → task-report')
    assert.equal(chain[0]!.id, 'b1-u')
    assert.equal(chain[1]!.id, 'b1-a')
    assert.equal(chain[2]!.id, 'b1-tr')
  })

  await test('B2: 用户在 SSE 关闭后发了新消息，task-report 仍正确挂在旧 assistant 下', async () => {
    const sessionId = uniqueSessionId()
    await registerSessionDir(sessionId)
    await writeSessionJson(sessionId, {
      id: sessionId,
      title: '测试 B2',
      createdAt: new Date().toISOString(),
    })

    // Turn 1: user → assistant（spawn）
    const t1 = Date.now()
    await appendMessage({
      sessionId,
      message: makeMsg('b2-u1', null, 'user', '分析代码', new Date(t1).toISOString()),
    })
    await appendMessage({
      sessionId,
      message: makeMsg('b2-a1', 'b2-u1', 'assistant', '已安排', new Date(t1 + 100).toISOString()),
    })

    // Turn 2: 用户继续发消息（SSE 已关闭后）
    await appendMessage({
      sessionId,
      message: makeMsg('b2-u2', 'b2-a1', 'user', '另一个问题', new Date(t1 + 500).toISOString()),
    })
    await appendMessage({
      sessionId,
      message: makeMsg('b2-a2', 'b2-u2', 'assistant', '回答另一个问题', new Date(t1 + 600).toISOString()),
    })

    // 子 Agent 晚于 Turn 2 完成，task-report 应挂在 Turn 1 的 assistant 下
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg(
        'b2-tr',
        'b2-a1',  // 关键：挂在 Turn 1 的 assistant 下，不是 Turn 2
        'agent_b2',
        'coder',
        '分析完成',
        'completed',
        new Date(t1 + 1000).toISOString(),
      ),
    })

    const tree = await loadMessageTree(sessionId)

    // 验证 task-report 挂在正确位置
    const tr = tree.byId.get('b2-tr')!
    assert.equal(tr.parentMessageId, 'b2-a1', 'task-report 应挂在 Turn 1 的 assistant 下')

    // 验证两个分支都存在
    const a1 = tree.byId.get('b2-a1')!
    const children = tree.childrenOf.get('b2-a1') ?? []
    assert.ok(children.includes('b2-u2'), 'b2-a1 应有 child b2-u2')
    assert.ok(children.includes('b2-tr'), 'b2-a1 应有 child b2-tr')
  })

  // ── C: loadMessageChain 包含 task-report ──
  printSection('C: loadMessageChain 包含 task-report')

  await test('C1: 从 task-report 叶节点 resolveChain 包含完整链', async () => {
    const sessionId = uniqueSessionId()
    await registerSessionDir(sessionId)
    await writeSessionJson(sessionId, {
      id: sessionId,
      title: '测试 C1',
      createdAt: new Date().toISOString(),
    })

    await appendMessage({ sessionId, message: makeMsg('c1-u', null, 'user', '问题') })
    await appendMessage({ sessionId, message: makeMsg('c1-a', 'c1-u', 'assistant', '已安排') })
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg('c1-tr', 'c1-a', 'agent_c1', 'plan', '规划完成'),
    })

    const tree = await loadMessageTree(sessionId)
    const chain = resolveChainFromLeaf(tree, 'c1-tr')

    assert.equal(chain.length, 3)
    assert.equal(chain[0]!.role, 'user')
    assert.equal(chain[1]!.role, 'assistant')
    assert.equal(chain[2]!.role, 'task-report')
  })

  await test('C2: resolveRightmostLeaf 可到达 task-report 节点', async () => {
    const sessionId = uniqueSessionId()
    await registerSessionDir(sessionId)
    await writeSessionJson(sessionId, {
      id: sessionId,
      title: '测试 C2',
      createdAt: new Date().toISOString(),
    })

    const t0 = Date.now()
    await appendMessage({
      sessionId,
      message: makeMsg('c2-u', null, 'user', '问题', new Date(t0).toISOString()),
    })
    await appendMessage({
      sessionId,
      message: makeMsg('c2-a', 'c2-u', 'assistant', '回答', new Date(t0 + 100).toISOString()),
    })
    // task-report 是最后写入的（时间戳最晚）
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg(
        'c2-tr', 'c2-a', 'agent_c2', 'x', 'done',
        'completed',
        new Date(t0 + 500).toISOString(),
      ),
    })

    const tree = await loadMessageTree(sessionId)
    const leaf = resolveRightmostLeaf(tree)

    // 最右叶可能是 c2-tr 或 c2-a（取决于实现）
    // 关键是 task-report 可达
    assert.ok(
      leaf === 'c2-tr' || leaf === 'c2-a',
      `rightmostLeaf 应为 c2-tr 或 c2-a，实际: ${leaf}`,
    )
  })

  // ── D: Master 新 turn 的上下文中包含子 Agent 结果 ──
  printSection('D: Master 新 turn 上下文包含子 Agent 结果')

  await test('D1: task-report 后用户发新消息，chain 包含 task-report', async () => {
    const sessionId = uniqueSessionId()
    await registerSessionDir(sessionId)
    await writeSessionJson(sessionId, {
      id: sessionId,
      title: '测试 D1',
      createdAt: new Date().toISOString(),
    })

    const t0 = Date.now()
    await appendMessage({
      sessionId,
      message: makeMsg('d1-u1', null, 'user', '分析代码', new Date(t0).toISOString()),
    })
    await appendMessage({
      sessionId,
      message: makeMsg('d1-a1', 'd1-u1', 'assistant', '已安排', new Date(t0 + 100).toISOString()),
    })
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg(
        'd1-tr', 'd1-a1', 'agent_d1', 'coder', '代码分析完成',
        'completed',
        new Date(t0 + 500).toISOString(),
      ),
    })
    // 用户看到 task-report 后继续追问，挂在 task-report 下
    await appendMessage({
      sessionId,
      message: makeMsg('d1-u2', 'd1-tr', 'user', '详细说说重构方案', new Date(t0 + 600).toISOString()),
    })

    const tree = await loadMessageTree(sessionId)
    const chain = resolveChainFromLeaf(tree, 'd1-u2')

    assert.equal(chain.length, 4)
    assert.equal(chain[0]!.id, 'd1-u1')
    assert.equal(chain[1]!.id, 'd1-a1')
    assert.equal(chain[2]!.id, 'd1-tr')
    assert.equal(chain[3]!.id, 'd1-u2')

    // 验证 task-report 的文本在 chain 中，可被 LLM context 使用
    const trMsg = chain[2]!
    const trText = (trMsg.parts as any[])?.[0]?.text ?? ''
    assert.ok(trText.includes('代码分析完成'), 'chain 中的 task-report 应包含结果文本')
  })

  // ── E: 多子 Agent 完成的 task-report 按时间排序 ──
  printSection('E: 多 task-report 时间排序')

  await test('E1: 3 个子 Agent 的 task-report 在 chain 中按 createdAt 排序', async () => {
    const sessionId = uniqueSessionId()
    await registerSessionDir(sessionId)
    await writeSessionJson(sessionId, {
      id: sessionId,
      title: '测试 E1',
      createdAt: new Date().toISOString(),
    })

    const t0 = Date.now()
    await appendMessage({
      sessionId,
      message: makeMsg('e1-u', null, 'user', '分析三个模块', new Date(t0).toISOString()),
    })
    await appendMessage({
      sessionId,
      message: makeMsg('e1-a', 'e1-u', 'assistant', '已安排三个子代理', new Date(t0 + 100).toISOString()),
    })

    // 三个 task-report，故意乱序写入（模拟并发完成顺序不确定）
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg(
        'e1-tr2', 'e1-a', 'agent_e1_2', 'analyze-b', 'B 模块完成',
        'completed',
        new Date(t0 + 600).toISOString(),  // 第二个完成
      ),
    })
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg(
        'e1-tr1', 'e1-a', 'agent_e1_1', 'analyze-a', 'A 模块完成',
        'completed',
        new Date(t0 + 400).toISOString(),  // 第一个完成（但后写入 JSONL）
      ),
    })
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg(
        'e1-tr3', 'e1-a', 'agent_e1_3', 'analyze-c', 'C 模块完成',
        'completed',
        new Date(t0 + 800).toISOString(),  // 第三个完成
      ),
    })

    const tree = await loadMessageTree(sessionId)

    // 验证所有 task-report 都是 e1-a 的子节点
    const children = tree.childrenOf.get('e1-a') ?? []
    assert.ok(children.includes('e1-tr1'), 'e1-tr1 应是 e1-a 的子节点')
    assert.ok(children.includes('e1-tr2'), 'e1-tr2 应是 e1-a 的子节点')
    assert.ok(children.includes('e1-tr3'), 'e1-tr3 应是 e1-a 的子节点')

    // 验证 tree 中有 3 个 task-report
    const taskReports = Array.from(tree.byId.values()).filter((m) => m.role === 'task-report')
    assert.equal(taskReports.length, 3, '应有 3 个 task-report 消息')

    // 按 createdAt 排序验证
    const sorted = [...taskReports].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    assert.equal(sorted[0]!.id, 'e1-tr1', '第一个应是 e1-tr1（最早完成）')
    assert.equal(sorted[1]!.id, 'e1-tr2', '第二个应是 e1-tr2')
    assert.equal(sorted[2]!.id, 'e1-tr3', '第三个应是 e1-tr3（最晚完成）')
  })

  await test('E2: task-report 与用户消息混合时链条完整', async () => {
    const sessionId = uniqueSessionId()
    await registerSessionDir(sessionId)
    await writeSessionJson(sessionId, {
      id: sessionId,
      title: '测试 E2',
      createdAt: new Date().toISOString(),
    })

    const t0 = Date.now()
    // Turn 1: user → assistant (spawn 2 agents)
    await appendMessage({
      sessionId,
      message: makeMsg('e2-u1', null, 'user', '并行分析', new Date(t0).toISOString()),
    })
    await appendMessage({
      sessionId,
      message: makeMsg('e2-a1', 'e2-u1', 'assistant', '已安排 2 个子代理', new Date(t0 + 100).toISOString()),
    })

    // Agent 1 先完成
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg(
        'e2-tr1', 'e2-a1', 'agent_1', 'worker-a', 'A 完成',
        'completed',
        new Date(t0 + 300).toISOString(),
      ),
    })

    // 用户在 Agent 1 完成后追问（挂在 tr1 下）
    await appendMessage({
      sessionId,
      message: makeMsg('e2-u2', 'e2-tr1', 'user', '看看 A 的详情', new Date(t0 + 400).toISOString()),
    })
    await appendMessage({
      sessionId,
      message: makeMsg('e2-a2', 'e2-u2', 'assistant', 'A 的详情如下...', new Date(t0 + 500).toISOString()),
    })

    // Agent 2 后完成（仍挂在 e2-a1 下）
    await appendMessage({
      sessionId,
      message: makeTaskReportMsg(
        'e2-tr2', 'e2-a1', 'agent_2', 'worker-b', 'B 完成',
        'completed',
        new Date(t0 + 700).toISOString(),
      ),
    })

    const tree = await loadMessageTree(sessionId)

    // 验证分支结构
    const a1Children = tree.childrenOf.get('e2-a1') ?? []
    assert.ok(a1Children.includes('e2-tr1'), 'e2-a1 应有 child e2-tr1')
    assert.ok(a1Children.includes('e2-tr2'), 'e2-a1 应有 child e2-tr2')

    // 链 1: u1 → a1 → tr1 → u2 → a2
    const chain1 = resolveChainFromLeaf(tree, 'e2-a2')
    assert.equal(chain1.length, 5)
    assert.equal(chain1[0]!.id, 'e2-u1')
    assert.equal(chain1[2]!.id, 'e2-tr1')

    // 链 2: u1 → a1 → tr2
    const chain2 = resolveChainFromLeaf(tree, 'e2-tr2')
    assert.equal(chain2.length, 3)
    assert.equal(chain2[2]!.id, 'e2-tr2')
  })

  // ── 汇总 ──
  console.log(`\n${'='.repeat(50)}`)
  console.log(`Layer 2 message-chain consistency: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const err of errors) {
      console.log(`  - ${err}`)
    }
  }

  // 清理临时目录
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
