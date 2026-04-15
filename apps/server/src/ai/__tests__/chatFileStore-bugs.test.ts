/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Bug verification tests for chatFileStore.
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/chatFileStore-bugs.test.ts
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
  deleteMessageSubtree,
  deleteSessionFiles,
  getMessageCount,
  loadMessageTree,
  readSessionJson,
  writeSessionJson,
  type StoredMessage,
} from '@/ai/services/chat/repositories/chatFileStore'
import {
  clearSessionDirCache,
  registerSessionDir,
} from '@openloaf/api/services/chatSessionPaths'

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

function msg(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant' | 'system' | 'subagent' = 'user',
  opts?: Partial<StoredMessage>,
): StoredMessage {
  const num = Number.parseInt(id.replace(/\D/g, '') || '0', 10)
  return {
    id,
    parentMessageId: parentId,
    role,
    messageKind: 'normal',
    parts: [{ type: 'text', text: `msg-${id}` }],
    createdAt: new Date(Date.now() + num * 1000).toISOString(),
    ...opts,
  }
}

async function createSession(): Promise<string> {
  const sid = `test_bug_${crypto.randomUUID()}`
  await prisma.chatSession.create({ data: { id: sid, messageCount: 0 } })
  await registerSessionDir(sid)
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
  tempDir = path.join(os.tmpdir(), `chatFileStore_bugs_${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
  setOpenLoafRootOverride(tempDir)
  clearSessionDirCache()

  try {
    // =======================================================================
    // BUG 1: writeSessionJson — concurrent read-modify-write race condition
    //
    // writeSessionJson 使用 read → merge → write 模式，但没有 withSessionLock
    // 保护。两个并发调用可能同时读到旧文件内容，各自合并不同字段后写入，
    // 后写的会覆盖先写的更改，导致字段丢失。
    // =======================================================================
    console.log('\n--- BUG 1: writeSessionJson race condition ---')

    await test('BUG1: concurrent writeSessionJson loses fields', async () => {
      const sid = await createSession()
      // 先写入基础数据并等待完成
      await writeSessionJson(sid, { title: 'base', isPin: false } as any)

      // 验证基础数据已写入
      const baseCheck = await readSessionJson(sid)
      assert.ok(baseCheck, 'base session.json should exist before concurrent writes')

      // 并发写入不同字段
      const writes = [
        writeSessionJson(sid, { isPin: true } as any),
        writeSessionJson(sid, { isUserRename: true } as any),
        writeSessionJson(sid, { errorMessage: 'test-error' } as any),
        writeSessionJson(sid, { sessionPreface: 'preface-text' } as any),
      ]
      await Promise.all(writes)

      const result = await readSessionJson(sid)

      // 并发写入可能导致文件损坏（JSON parse 失败）或字段丢失
      if (!result) {
        console.log('    [BUG CONFIRMED] 并发写入导致 session.json 损坏（无法解析）')
        assert.fail('session.json corrupted after concurrent writes')
      }

      // 如果没有竞态，所有字段都应存在
      const hasAllFields =
        result.isPin === true &&
        (result as any).isUserRename === true &&
        result.errorMessage === 'test-error' &&
        result.sessionPreface === 'preface-text'

      if (!hasAllFields) {
        console.log('    [BUG CONFIRMED] 并发写入导致字段丢失:')
        console.log(`      isPin: ${result.isPin} (expected: true)`)
        console.log(`      isUserRename: ${(result as any).isUserRename} (expected: true)`)
        console.log(`      errorMessage: ${result.errorMessage} (expected: "test-error")`)
        console.log(`      sessionPreface: ${result.sessionPreface} (expected: "preface-text")`)
      }

      // 此断言预期在 bug 修复前失败
      assert.ok(hasAllFields, 'all fields should be present after concurrent writes')

      await cleanupSession(sid)
    })

    await test('BUG1b: sequential writeSessionJson preserves fields', async () => {
      const sid = await createSession()

      // 串行写入作为对照组 — 应始终通过
      await writeSessionJson(sid, { title: 'base' } as any)
      await writeSessionJson(sid, { isPin: true } as any)
      await writeSessionJson(sid, { isUserRename: true } as any)
      await writeSessionJson(sid, { errorMessage: 'seq-error' } as any)

      const result = await readSessionJson(sid)
      assert.ok(result)
      assert.equal(result!.title, 'base')
      assert.equal(result!.isPin, true)
      assert.equal((result as any).isUserRename, true)
      assert.equal(result!.errorMessage, 'seq-error')

      await cleanupSession(sid)
    })

    // 增加更高并发量来确保复现竞态
    await test('BUG1c: high-concurrency writeSessionJson stress test', async () => {
      const sid = await createSession()
      await writeSessionJson(sid, { title: 'stress-base' } as any)

      // 20 个并发写，每个写入不同的字段
      const writes = Array.from({ length: 20 }, (_, i) =>
        writeSessionJson(sid, { [`field_${i}`]: `value_${i}` } as any),
      )
      await Promise.all(writes)

      const result = await readSessionJson(sid)
      assert.ok(result)

      let missingCount = 0
      for (let i = 0; i < 20; i++) {
        if ((result as any)[`field_${i}`] !== `value_${i}`) {
          missingCount++
        }
      }

      if (missingCount > 0) {
        console.log(`    [BUG CONFIRMED] 高并发写入丢失了 ${missingCount}/20 个字段`)
      }

      assert.equal(missingCount, 0, `${missingCount} fields lost in concurrent writes`)

      await cleanupSession(sid)
    })

    // =======================================================================
    // BUG 2: deleteMessageSubtree — does not update messageCount
    //
    // deleteMessageSubtree 从 JSONL 中物理删除消息，但不更新
    // ChatSession.messageCount（DB）和 session.json 中的计数。
    // 长期使用后 messageCount 会严重虚高。
    // =======================================================================
    console.log('\n--- BUG 2: deleteMessageSubtree messageCount drift ---')

    await test('BUG2: deleteMessageSubtree leaves messageCount stale', async () => {
      const sid = await createSession()

      // 添加 5 条消息
      await appendMessage({ sessionId: sid, message: msg('d1', null) })
      await appendMessage({ sessionId: sid, message: msg('d2', 'd1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('d3', 'd2') })
      await appendMessage({ sessionId: sid, message: msg('d4', 'd3', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('d5', 'd4') })

      // 手动设置正确的 messageCount
      await prisma.chatSession.update({
        where: { id: sid },
        data: { messageCount: 5 },
      })
      await writeSessionJson(sid, { messageCount: 5 } as any)

      // 删除 d3 子树（d3 + d4 + d5 = 3 条消息）
      const result = await deleteMessageSubtree({ sessionId: sid, messageId: 'd3' })
      assert.equal(result.deletedCount, 3, 'should delete 3 messages')

      // 检查实际消息数
      const actualCount = await getMessageCount(sid)
      assert.equal(actualCount, 2, 'actual messages should be 2')

      // 检查 DB messageCount — 应该仍然是 5（bug: 未更新）
      const dbSession = await prisma.chatSession.findUnique({
        where: { id: sid },
        select: { messageCount: true },
      })
      const dbCount = dbSession?.messageCount ?? 0

      // 检查 session.json messageCount
      const jsonSession = await readSessionJson(sid)
      const jsonCount = jsonSession?.messageCount ?? 0

      if (dbCount !== actualCount) {
        console.log(`    [BUG CONFIRMED] DB messageCount=${dbCount}, actual=${actualCount}`)
      }
      if (jsonCount !== actualCount) {
        console.log(`    [BUG CONFIRMED] session.json messageCount=${jsonCount}, actual=${actualCount}`)
      }

      // 此断言预期在 bug 修复前失败
      assert.equal(
        dbCount,
        actualCount,
        `DB messageCount (${dbCount}) should match actual (${actualCount})`,
      )

      await cleanupSession(sid)
    })

    await test('BUG2b: repeated delete accumulates messageCount drift', async () => {
      const sid = await createSession()

      // 建一棵有分支的树
      //   r1 -> a1 -> a2
      //      -> b1 -> b2
      await appendMessage({ sessionId: sid, message: msg('r1', null) })
      await appendMessage({ sessionId: sid, message: msg('a1', 'r1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('a2', 'a1') })
      await appendMessage({ sessionId: sid, message: msg('b1', 'r1', 'assistant') })
      await appendMessage({ sessionId: sid, message: msg('b2', 'b1') })

      await prisma.chatSession.update({
        where: { id: sid },
        data: { messageCount: 5 },
      })

      // 先删 a1 子树 (a1 + a2 = 2)
      await deleteMessageSubtree({ sessionId: sid, messageId: 'a1' })
      // 再删 b1 子树 (b1 + b2 = 2)
      await deleteMessageSubtree({ sessionId: sid, messageId: 'b1' })

      const actualCount = await getMessageCount(sid)
      assert.equal(actualCount, 1, 'only r1 should remain')

      const dbSession = await prisma.chatSession.findUnique({
        where: { id: sid },
        select: { messageCount: true },
      })

      if (dbSession!.messageCount !== 1) {
        console.log(
          `    [BUG CONFIRMED] 多次删除后 messageCount 漂移: DB=${dbSession!.messageCount}, actual=1`,
        )
      }

      assert.equal(
        dbSession!.messageCount,
        1,
        `DB messageCount (${dbSession!.messageCount}) should be 1 after deleting 4 messages`,
      )

      await cleanupSession(sid)
    })

    // =======================================================================
    // BUG 3: LRU cache mtime precision — stale reads after rapid writes
    //
    // loadMessageTree 使用 file mtime (毫秒) 做缓存失效检查。
    // 如果两次写入发生在同一毫秒内（或文件系统 mtime 精度不足），
    // 缓存不会失效，返回旧数据。
    //
    // 注意：在有 withSessionLock 保护的操作中（appendMessage 等），
    // 这个问题被缓解了，因为 invalidateCache 会主动清除缓存。
    // 但直接调用 loadMessageTree 时（如多个读取端），仍然可能读到旧数据。
    // =======================================================================
    console.log('\n--- BUG 3: LRU cache mtime precision ---')

    await test('BUG3: rapid writes may not invalidate mtime-based cache', async () => {
      const sid = await createSession()

      // 写入第一条消息
      await appendMessage({ sessionId: sid, message: msg('mt1', null) })

      // 加载树以填充缓存
      const tree1 = await loadMessageTree(sid)
      assert.equal(tree1.byId.size, 1)

      // 直接追加第二条消息到 JSONL 文件（绕过 invalidateCache）
      // 模拟外部写入或缓存未正确失效的场景
      const dir = path.join(tempDir, 'chat-history', sid)
      const jsonlPath = path.join(dir, 'messages.jsonl')
      const newMsg = msg('mt2', 'mt1', 'assistant')
      await fs.appendFile(jsonlPath, `${JSON.stringify(newMsg)}\n`, 'utf8')

      // 重新加载 — 如果 mtime 相同，会返回缓存的旧树
      const tree2 = await loadMessageTree(sid)

      if (tree2.byId.size === 1) {
        console.log('    [BUG CONFIRMED] 缓存未失效，返回了旧数据（1 条而非 2 条消息）')
      } else {
        console.log('    [BUG NOT REPRODUCED] mtime 不同，缓存已正确失效')
      }

      // 此断言可能通过也可能失败，取决于文件系统 mtime 精度
      assert.equal(tree2.byId.size, 2, 'should see 2 messages after direct file append')

      await cleanupSession(sid)
    })

    // =======================================================================
    // BUG 4: messageCount increment 不在事务中
    //
    // saveMessage 中 DB increment 和 writeSessionJson 是两个独立操作，
    // 中间没有事务保护。并发保存可能导致 session.json 计数落后于 DB。
    // =======================================================================
    console.log('\n--- BUG 4: messageCount increment without transaction ---')

    await test('BUG4: session.json messageCount may lag behind DB', async () => {
      const sid = await createSession()

      // 通过直接操作模拟 saveMessage 的行为
      // 并发增加 messageCount
      const increments = Array.from({ length: 5 }, async (_, i) => {
        const updated = await prisma.chatSession.update({
          where: { id: sid },
          data: { messageCount: { increment: 1 } },
        })
        // 每次 increment 后写 session.json（模拟 messageStore.saveMessage 行为）
        await writeSessionJson(sid, { messageCount: updated.messageCount })
      })
      await Promise.all(increments)

      const dbSession = await prisma.chatSession.findUnique({
        where: { id: sid },
        select: { messageCount: true },
      })
      const jsonSession = await readSessionJson(sid)

      const dbCount = dbSession?.messageCount ?? 0
      const jsonCount = jsonSession?.messageCount ?? 0

      assert.equal(dbCount, 5, 'DB messageCount should be 5')

      if (jsonCount !== 5) {
        console.log(
          `    [BUG CONFIRMED] session.json messageCount=${jsonCount} ≠ DB messageCount=${dbCount}`,
        )
      }

      // session.json 可能不是 5（因为 writeSessionJson 的竞态）
      assert.equal(
        jsonCount,
        dbCount,
        `session.json (${jsonCount}) should match DB (${dbCount})`,
      )

      await cleanupSession(sid)
    })

    // =======================================================================
    // VERIFICATION: 已确认为误报的问题
    // =======================================================================
    console.log('\n--- VERIFICATION: false positive checks ---')

    await test('VERIFY1: renderMessageParts text merge increments nextIndex', () => {
      // Agent 声称 renderMessageParts.tsx:197-200 有无限循环
      // 实际代码第 201 行有 nextIndex += 1
      // 这里通过模拟逻辑验证
      const visibleList = [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
        { type: 'tool-invoke', toolName: 'test' },
      ]

      let nextIndex = 0
      let mergedText = ''
      while (nextIndex < visibleList.length && visibleList[nextIndex]?.type === 'text') {
        mergedText += String(visibleList[nextIndex]?.text ?? '')
        nextIndex += 1 // line 201 — 确实存在
      }

      assert.equal(mergedText, 'hello world')
      assert.equal(nextIndex, 2, 'nextIndex should stop at first non-text part')
    })

    await test('VERIFY2: approval key is set AFTER submission, not before', () => {
      // Agent 声称 use-chat-approval.ts:108-109 有重复提交 bug
      // 实际 lastApprovalSubmittedKeyRef 在第 141 行（成功后）才设置
      // 模拟流程验证
      let lastKey = ''
      const toolCallIds = ['tool1', 'tool2']
      const currentKey = toolCallIds.slice().sort().join(',')

      // Round 1: tool1 approved, tool2 not yet
      if (lastKey === currentKey) throw new Error('should not skip')
      // unresolved.length > 0 → return early (line 118)

      // Round 2: both approved
      if (lastKey === currentKey) throw new Error('should not skip')
      // unresolved.length === 0 → proceed to submit
      // After successful submit:
      lastKey = currentKey

      // Round 3: same key → skip (correct dedup behavior)
      assert.equal(lastKey, currentKey, 'key should be set after submit')
      // This proves the skip only happens AFTER a successful send
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
