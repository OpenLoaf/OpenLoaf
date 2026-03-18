/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * Chat branching bug verification tests.
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/chatBranch-bugs.test.ts
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setOpenLoafRootOverride } from '@openloaf/config'
import { prisma } from '@openloaf/db'
import {
  appendMessage,
  buildSiblingNavForChain,
  clearSessionDirCache,
  deleteMessageSubtree,
  deleteSessionFiles,
  getChatViewFromFile,
  loadMessageTree,
  registerSessionDir,
  resolveChainFromLeaf,
  resolveLatestLeafInSubtree,
  resolveRightmostLeaf,
  type StoredMessage,
  type MessageTreeIndex,
} from '@/ai/services/chat/repositories/chatFileStore'

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

let tempDir: string
const base = Date.now()
let timeCounter = 0

function msg(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant' | 'system' | 'subagent' | 'task-report' = 'user',
  opts?: Partial<StoredMessage>,
): StoredMessage {
  timeCounter++
  return {
    id,
    parentMessageId: parentId,
    role,
    messageKind: 'normal',
    parts: [{ type: 'text', text: `msg-${id}` }],
    createdAt: new Date(base + timeCounter * 1000).toISOString(),
    ...opts,
  }
}

async function createSession(): Promise<string> {
  const sid = `test_branch_${crypto.randomUUID()}`
  await prisma.chatSession.create({ data: { id: sid, messageCount: 0 } })
  registerSessionDir(sid)
  return sid
}

async function cleanupSession(sid: string) {
  await deleteSessionFiles(sid)
  await prisma.chatSession.delete({ where: { id: sid } }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  tempDir = path.join(os.tmpdir(), `chatBranch_bugs_${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
  setOpenLoafRootOverride(tempDir)
  clearSessionDirCache()

  try {
    // =======================================================================
    // BRANCH 1: 分支删除后的回退逻辑
    //
    // 场景：用户有多个分支，删除当前分支后应回退到兄弟分支。
    // 当前代码（chat.ts:309-318）在删除后使用 parentMessageId 作为 anchor，
    // 但未指定 strategy，默认 latestLeafInSubtree，可能跳到错误分支。
    // =======================================================================
    console.log('\n--- BRANCH 1: 删除分支后的回退 ---')

    await test('B1a: 删除分支后应回退到兄弟分支', async () => {
      const sid = await createSession()
      // 构建树：
      //   u1 (user) -> a1 (assistant) -> u2 (user) -> a2 (assistant)  [分支 A]
      //                               -> u3 (user) -> a3 (assistant)  [分支 B]
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u2', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u3', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a3', 'u3', 'assistant') })

      // 确认分支 B (a3) 是最右叶子
      const viewBefore = await getChatViewFromFile({ sessionId: sid })
      assert.equal(viewBefore.leafMessageId, 'a3', 'before delete: leaf should be a3')

      // 删除分支 B (u3 子树: u3 + a3)
      const result = await deleteMessageSubtree({ sessionId: sid, messageId: 'u3' })
      assert.equal(result.deletedCount, 2)
      assert.equal(result.parentMessageId, 'a1')

      // 模拟 chat.ts:309-318 的回退逻辑（使用 parentMessageId 作为 anchor，不指定 strategy）
      const snapshotDefault = await getChatViewFromFile({
        sessionId: sid,
        window: { limit: 50 },
        ...(result.parentMessageId
          ? { anchor: { messageId: String(result.parentMessageId) } }
          : {}),
      })

      // 删除 B 分支后，从 a1 的子树中找最新叶子
      // 应该是 a2（分支 A 的叶子）
      assert.equal(
        snapshotDefault.leafMessageId,
        'a2',
        '删除 B 分支后应回退到分支 A 的叶子 a2',
      )
      assert.ok(
        snapshotDefault.branchMessageIds.includes('u2'),
        '回退后的链应包含 u2',
      )

      await cleanupSession(sid)
    })

    await test('B1b: 删除唯一子分支后应回退到 parent 本身', async () => {
      const sid = await createSession()
      //   u1 -> a1 -> u2 -> a2
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u2', 'assistant') })

      // 删除 u2 子树（u2 + a2），parent 是 a1
      const result = await deleteMessageSubtree({ sessionId: sid, messageId: 'u2' })
      assert.equal(result.deletedCount, 2)

      // 回退：从 a1 找 latestLeafInSubtree → a1 自己是叶子
      const snapshot = await getChatViewFromFile({
        sessionId: sid,
        ...(result.parentMessageId
          ? { anchor: { messageId: String(result.parentMessageId) } }
          : {}),
      })

      assert.equal(snapshot.leafMessageId, 'a1', '应回退到 a1 本身')
      assert.ok(snapshot.branchMessageIds.includes('a1'))
      assert.ok(snapshot.branchMessageIds.includes('u1'))

      await cleanupSession(sid)
    })

    // =======================================================================
    // BRANCH 2: Cursor 指向已删除消息的分页行为
    //
    // getChatViewFromFile 中，如果 cursor.beforeMessageId 指向的消息已被删除，
    // cursorMsg 为 null，leafFromCursor 保持 null，分页请求被静默忽略，
    // 回退到默认 anchor（最右叶子），导致分页跳跃。
    // =======================================================================
    console.log('\n--- BRANCH 2: Cursor 指向已删除消息 ---')

    await test('B2a: cursor 指向已删除消息时分页静默失效', async () => {
      const sid = await createSession()
      // 构建长链：u1 -> a1 -> u2 -> a2 -> u3 -> a3
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u2', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u3', 'a2') })
      await appendMessage({ sessionId: sid, message: msg('a3', 'u3', 'assistant') })

      // 先分页加载最新 2 条，获取 cursor
      const page1 = await getChatViewFromFile({
        sessionId: sid,
        window: { limit: 2 },
      })
      assert.equal(page1.messages!.length, 2, 'page1 should have 2 messages')
      assert.ok(page1.pageInfo.hasMore, 'should have more pages')
      const cursor = page1.pageInfo.nextCursor!.beforeMessageId

      // 删除 cursor 指向的消息
      await deleteMessageSubtree({ sessionId: sid, messageId: cursor })

      // 使用已失效的 cursor 请求下一页
      const page2 = await getChatViewFromFile({
        sessionId: sid,
        window: { limit: 2, cursor: { beforeMessageId: cursor } },
      })

      // 预期：应该有某种合理的回退行为
      // 实际：cursor 被忽略，返回最右叶子的最后 2 条
      // 这导致分页跳跃，可能重复显示消息

      // 检查 page2 是否返回了与 page1 完全不同的结果（证明 cursor 被忽略）
      const page1Ids = new Set(page1.messages!.map((m) => m.id))
      const page2Ids = page2.messages!.map((m) => m.id)
      const overlap = page2Ids.filter((id) => page1Ids.has(id))

      if (overlap.length > 0) {
        console.log(
          `    [BUG CONFIRMED] cursor 失效后分页重复: page1 和 page2 重叠了 ${overlap.length} 条消息 [${overlap.join(', ')}]`,
        )
      } else {
        console.log('    [BUG NOT REPRODUCED] 无重叠，可能删除改变了链结构')
      }

      // 这里只验证 cursor 失效的行为是否静默（不抛错）
      assert.ok(page2.leafMessageId, 'should still return a valid leaf')

      await cleanupSession(sid)
    })

    // =======================================================================
    // BRANCH 3: resolveLatestRenderableLeafInSubtree 的正确性
    //
    // 当最右路径上的叶子不可渲染（subagent/compact_prompt/空 assistant），
    // 算法应该正确回溯到可渲染的替代叶子。
    // =======================================================================
    console.log('\n--- BRANCH 3: 不可渲染叶子的回溯 ---')

    await test('B3a: 最右叶子是 subagent 时应回溯', async () => {
      const sid = await createSession()
      //   u1 -> a1 -> u2 (renderable leaf)
      //            -> sub1 (subagent, NOT renderable, created later)
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('sub1', 'a1', 'subagent') })

      const view = await getChatViewFromFile({ sessionId: sid })
      // sub1 是最右子节点但不可渲染，应回溯到 u2
      assert.equal(view.leafMessageId, 'u2', '应选择可渲染的 u2 而非 subagent sub1')

      await cleanupSession(sid)
    })

    await test('B3b: 最右叶子是 compact_prompt 时应回溯', async () => {
      const sid = await createSession()
      //   u1 -> a1 -> u2 -> a2 (renderable)
      //            -> cp1 (compact_prompt, NOT renderable, created later)
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u2', 'assistant') })
      await appendMessage({
        sessionId: sid,
        message: msg('cp1', 'a1', 'user', { messageKind: 'compact_prompt' }),
      })

      const view = await getChatViewFromFile({ sessionId: sid })
      assert.equal(view.leafMessageId, 'a2', '应选择可渲染的 a2 而非 compact_prompt')

      await cleanupSession(sid)
    })

    await test('B3c: 空 assistant（parts=[]）叶子应被跳过', async () => {
      const sid = await createSession()
      //   u1 -> a_empty (assistant, parts=[], NOT renderable, created earlier)
      //      -> u2 -> a2 (renderable, created later)
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({
        sessionId: sid,
        message: msg('a_empty', 'u1', 'assistant', { parts: [] }),
      })
      await appendMessage({ sessionId: sid, message: msg('u2', 'u1') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u2', 'assistant') })

      const view = await getChatViewFromFile({ sessionId: sid })
      // a_empty 不可渲染（空 parts），应该选 a2
      assert.equal(view.leafMessageId, 'a2', '空 assistant 应被跳过')

      await cleanupSession(sid)
    })

    await test('B3d: 多层不可渲染叶子应正确穿透', async () => {
      const sid = await createSession()
      // 复杂场景：
      //   u1 -> a1 -> u2 -> a2 (renderable)
      //                   -> sub2 (subagent, NOT renderable)
      //            -> sub1 (subagent, NOT renderable)
      //                   -> sub3 (subagent under subagent)
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u2', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('sub2', 'u2', 'subagent') })
      await appendMessage({ sessionId: sid, message: msg('sub1', 'a1', 'subagent') })
      await appendMessage({ sessionId: sid, message: msg('sub3', 'sub1', 'subagent') })

      const view = await getChatViewFromFile({ sessionId: sid })
      // 最右路径: u1 -> a1 -> sub1 -> sub3（全不可渲染）
      // 回溯应找到 a2
      assert.equal(view.leafMessageId, 'a2', '应穿透多层不可渲染节点找到 a2')

      // 链不应包含 subagent 消息
      const ids = view.messages!.map((m) => m.id)
      assert.ok(!ids.includes('sub1'), '链不应包含 sub1')
      assert.ok(!ids.includes('sub2'), '链不应包含 sub2')
      assert.ok(!ids.includes('sub3'), '链不应包含 sub3')

      await cleanupSession(sid)
    })

    // =======================================================================
    // BRANCH 4: siblingNav 正确性
    //
    // 验证分支导航（前一个/下一个兄弟）在各种场景下的正确性。
    // =======================================================================
    console.log('\n--- BRANCH 4: siblingNav 正确性 ---')

    await test('B4a: 基础分支导航', async () => {
      const sid = await createSession()
      //   u1 -> a1 (sibling 1)
      //      -> a2 (sibling 2)
      //      -> a3 (sibling 3)
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('a3', 'u1', 'assistant') })

      // 默认显示链应包含最右叶子 a3
      const view = await getChatViewFromFile({ sessionId: sid })
      assert.equal(view.leafMessageId, 'a3')
      assert.ok(view.siblingNav)

      const navA3 = view.siblingNav!['a3']
      assert.ok(navA3, 'a3 should have siblingNav')
      assert.equal(navA3.siblingTotal, 3, 'a3 should have 3 siblings')
      assert.equal(navA3.siblingIndex, 3, 'a3 should be index 3')
      assert.equal(navA3.prevSiblingId, 'a2', 'a3 prev should be a2')
      assert.equal(navA3.nextSiblingId, null, 'a3 next should be null')

      await cleanupSession(sid)
    })

    await test('B4b: 分支切换到非当前链的兄弟', async () => {
      const sid = await createSession()
      //   u1 -> a1 -> u2 (分支 A)
      //      -> a2 -> u3 (分支 B，默认显示)
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u3', 'a2') })

      // 默认链: u1 -> a2 -> u3（最右路径）
      const viewB = await getChatViewFromFile({ sessionId: sid })
      assert.equal(viewB.leafMessageId, 'u3')

      // siblingNav 中 a2 应该知道有兄弟 a1
      const navA2 = viewB.siblingNav!['a2']
      assert.ok(navA2, 'a2 should have siblingNav')
      assert.equal(navA2.siblingTotal, 2, 'a2 should have 2 siblings')
      assert.equal(navA2.prevSiblingId, 'a1', 'a2 prev should be a1')

      // 切换到 a1（分支 A）
      const viewA = await getChatViewFromFile({
        sessionId: sid,
        anchor: { messageId: 'a1', strategy: 'latestLeafInSubtree' },
      })
      assert.equal(viewA.leafMessageId, 'u2', '分支 A 叶子应为 u2')
      assert.ok(viewA.branchMessageIds.includes('a1'))
      assert.ok(!viewA.branchMessageIds.includes('a2'), '分支 A 不应包含 a2')

      await cleanupSession(sid)
    })

    await test('B4c: 删除兄弟分支后 siblingNav 应更新', async () => {
      const sid = await createSession()
      //   u1 -> a1 (sibling 1)
      //      -> a2 (sibling 2)
      //      -> a3 (sibling 3)
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('a3', 'u1', 'assistant') })

      // 删除 a2
      await deleteMessageSubtree({ sessionId: sid, messageId: 'a2' })

      // 重新获取视图
      const view = await getChatViewFromFile({ sessionId: sid })
      assert.equal(view.leafMessageId, 'a3')

      const navA3 = view.siblingNav!['a3']!
      assert.equal(navA3.siblingTotal, 2, '删除 a2 后应只剩 2 个兄弟')
      assert.equal(navA3.prevSiblingId, 'a1', 'a3 的 prev 应变为 a1')

      await cleanupSession(sid)
    })

    // =======================================================================
    // BRANCH 5: 深层分支场景
    //
    // 测试多层嵌套分支的正确性。
    // =======================================================================
    console.log('\n--- BRANCH 5: 深层分支 ---')

    await test('B5a: 三层分支嵌套', async () => {
      const sid = await createSession()
      // 层级 1: u1 -> a1 / a1b
      // 层级 2: a1 -> u2 / u2b
      // 层级 3: u2 -> a3 / a3b
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('a1b', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('u2b', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a3', 'u2', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('a3b', 'u2', 'assistant') })

      // 最右路径: u1 -> a1b（因为 a1b 比 a1 晚创建）
      // 但 a1b 没有子节点，所以叶子就是 a1b
      const view = await getChatViewFromFile({ sessionId: sid })

      // 验证可以导航到每个层级的不同分支
      // 切换到 a1（从 a1b 切换）
      const viewA1 = await getChatViewFromFile({
        sessionId: sid,
        anchor: { messageId: 'a1', strategy: 'latestLeafInSubtree' },
      })
      // a1 的子树：a1 -> u2/u2b -> a3/a3b
      // 最右: a1 -> u2b（u2b 比 u2 晚）但 u2b 没有子节点
      // 或 a1 -> u2 -> a3b（a3b 是 u2 的最右子节点）
      // 取决于 u2 vs u2b 哪个更晚
      assert.ok(viewA1.leafMessageId, 'should find a renderable leaf in a1 subtree')

      // 切换到 a3（从 a3b 切换）
      const viewA3 = await getChatViewFromFile({
        sessionId: sid,
        anchor: { messageId: 'a3', strategy: 'self' },
      })
      assert.equal(viewA3.leafMessageId, 'a3')
      assert.ok(viewA3.branchMessageIds.includes('u2'))
      assert.ok(viewA3.branchMessageIds.includes('a1'))

      await cleanupSession(sid)
    })

    // =======================================================================
    // BRANCH 6: 边界情况
    // =======================================================================
    console.log('\n--- BRANCH 6: 边界情况 ---')

    await test('B6a: 单条消息的会话', async () => {
      const sid = await createSession()
      await appendMessage({ sessionId: sid, message: msg('only1', null) })

      const view = await getChatViewFromFile({ sessionId: sid })
      assert.equal(view.leafMessageId, 'only1')
      assert.equal(view.branchMessageIds.length, 1)
      assert.equal(view.messages!.length, 1)

      const nav = view.siblingNav!['only1']!
      assert.equal(nav.siblingTotal, 1)
      assert.equal(nav.prevSiblingId, null)
      assert.equal(nav.nextSiblingId, null)

      await cleanupSession(sid)
    })

    await test('B6b: 空会话', async () => {
      const sid = await createSession()

      const view = await getChatViewFromFile({ sessionId: sid })
      assert.equal(view.leafMessageId, null)
      assert.equal(view.branchMessageIds.length, 0)
      assert.equal(view.messages!.length, 0)

      await cleanupSession(sid)
    })

    await test('B6c: anchor 指向不存在的消息', async () => {
      const sid = await createSession()
      await appendMessage({ sessionId: sid, message: msg('x1', null) })

      const view = await getChatViewFromFile({
        sessionId: sid,
        anchor: { messageId: 'nonexistent', strategy: 'latestLeafInSubtree' },
      })

      // 不存在的 anchor 应该返回空结果（因为 resolveLatestRenderableLeafInSubtree 返回 null）
      // 或者返回默认叶子
      // 当前实现: baseAnchorId = 'nonexistent', leafMessageId = null → emptyResult
      assert.equal(view.leafMessageId, null, 'anchor 不存在时应返回 null leaf')

      await cleanupSession(sid)
    })

    await test('B6d: 删除所有消息后的视图', async () => {
      const sid = await createSession()
      await appendMessage({ sessionId: sid, message: msg('del1', null) })
      await appendMessage({ sessionId: sid, message: msg('del2', 'del1', 'assistant') })

      // 删除根消息（删除全部）
      await deleteMessageSubtree({ sessionId: sid, messageId: 'del1' })

      const view = await getChatViewFromFile({ sessionId: sid })
      assert.equal(view.leafMessageId, null, '全部删除后 leaf 应为 null')
      assert.equal(view.branchMessageIds.length, 0)
      assert.equal(view.messages!.length, 0)

      await cleanupSession(sid)
    })

    await test('B6e: task-report 消息不影响分支导航', async () => {
      const sid = await createSession()
      //   u1 -> a1 -> tr1 (task-report)
      //            -> u2 -> a2
      await appendMessage({ sessionId: sid, message: msg('u1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'u1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('tr1', 'a1', 'task-report') })
      await appendMessage({ sessionId: sid, message: msg('u2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'u2', 'assistant') })

      const view = await getChatViewFromFile({ sessionId: sid })
      // task-report 是可渲染的（isRenderable 返回 true，因为有 parts）
      // 需要确认 leafMessageId 选择是否正确
      assert.ok(view.leafMessageId, 'should have a valid leaf')

      // 链中应包含正确的消息
      const ids = view.messages!.map((m) => m.id)
      assert.ok(ids.includes('u1'), '应包含 u1')

      await cleanupSession(sid)
    })
  } finally {
    setOpenLoafRootOverride(null)
    clearSessionDirCache()
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }

  // ---- Summary ----
  console.log(`\n${'='.repeat(60)}`)
  console.log(`结果: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\n失败的测试 (确认的 bug):')
    for (const e of errors) console.log(`  - ${e}`)
  }
  console.log()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
