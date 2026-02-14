/**
 * chatFileStore comprehensive tests.
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/chatFileStore.test.ts
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTenasRootOverride } from '@tenas-ai/config'
import { prisma } from '@tenas-ai/db'
import {
  appendMessage,
  buildSiblingNavForChain,
  clearSessionDirCache,
  deleteMessageSubtree,
  deleteSessionFiles,
  getChatViewFromFile,
  getMessageById,
  getMessageCount,
  loadMessageChainFromFile,
  loadMessageTree,
  readSessionJson,
  registerSessionDir,
  resolveChainFromLeaf,
  resolveLatestLeafInSubtree,
  resolveRightmostLeaf,
  updateMessage,
  updateMessageMetadata,
  updateMessageParts,
  writeSessionJson,
  type MessageTreeIndex,
  type StoredMessage,
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

const testSessionId = `test_cfs_${crypto.randomUUID()}`
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
    updatedAt: new Date().toISOString(),
    ...opts,
  }
}

function buildTree(messages: StoredMessage[]): MessageTreeIndex {
  const byId = new Map<string, StoredMessage>()
  for (const m of messages) byId.set(m.id, m)
  const childrenOf = new Map<string, string[]>()
  const rootIds: string[] = []
  const sorted = [...byId.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id),
  )
  for (const m of sorted) {
    if (m.parentMessageId === null) {
      rootIds.push(m.id)
    } else {
      const children = childrenOf.get(m.parentMessageId) ?? []
      children.push(m.id)
      childrenOf.set(m.parentMessageId, children)
    }
  }
  if (rootIds.length > 0) childrenOf.set('__root__', rootIds)
  return { byId, childrenOf, rootIds }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // ---- Setup ----
  tempDir = path.join(os.tmpdir(), `chatFileStore_test_${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
  setTenasRootOverride(tempDir)
  clearSessionDirCache()

  await prisma.chatSession.create({ data: { id: testSessionId } })
  registerSessionDir(testSessionId)

  try {
    // =====================================================================
    // A layer: pure functions (manual tree)
    // =====================================================================
    console.log('\n--- A layer: pure functions ---')

    // A1: resolveChainFromLeaf — linear chain
    await test('A1: resolveChainFromLeaf linear chain', () => {
      const m1 = msg('a1', null)
      const m2 = msg('a2', 'a1')
      const m3 = msg('a3', 'a2')
      const tree = buildTree([m1, m2, m3])
      const chain = resolveChainFromLeaf(tree, 'a3')
      assert.deepEqual(
        chain.map((m) => m.id),
        ['a1', 'a2', 'a3'],
      )
    })

    // A2: resolveChainFromLeaf — branch selects correct path
    await test('A2: resolveChainFromLeaf branch path', () => {
      const m1 = msg('b1', null)
      const m2 = msg('b2', 'b1')
      const m3 = msg('b3', 'b1') // sibling of b2
      const m4 = msg('b4', 'b3')
      const tree = buildTree([m1, m2, m3, m4])
      const chain = resolveChainFromLeaf(tree, 'b4')
      assert.deepEqual(
        chain.map((m) => m.id),
        ['b1', 'b3', 'b4'],
      )
    })

    // A3: resolveChainFromLeaf — nonexistent ID
    await test('A3: resolveChainFromLeaf nonexistent', () => {
      const tree = buildTree([msg('c1', null)])
      const chain = resolveChainFromLeaf(tree, 'nope')
      assert.equal(chain.length, 0)
    })

    // A4: resolveChainFromLeaf — single message
    await test('A4: resolveChainFromLeaf single', () => {
      const m1 = msg('d1', null)
      const tree = buildTree([m1])
      const chain = resolveChainFromLeaf(tree, 'd1')
      assert.equal(chain.length, 1)
      assert.equal(chain[0]!.id, 'd1')
    })

    // A5: resolveRightmostLeaf — linear chain
    await test('A5: resolveRightmostLeaf linear', () => {
      const tree = buildTree([msg('e1', null), msg('e2', 'e1'), msg('e3', 'e2')])
      assert.equal(resolveRightmostLeaf(tree), 'e3')
    })

    // A6: resolveRightmostLeaf — multi-branch picks rightmost
    await test('A6: resolveRightmostLeaf multi-branch', () => {
      const m1 = msg('f1', null)
      const m2 = msg('f2', 'f1')
      const m3 = msg('f3', 'f1') // later sibling
      const m4 = msg('f4', 'f3')
      const tree = buildTree([m1, m2, m3, m4])
      assert.equal(resolveRightmostLeaf(tree), 'f4')
    })

    // A7: resolveRightmostLeaf — empty tree
    await test('A7: resolveRightmostLeaf empty', () => {
      const tree: MessageTreeIndex = {
        byId: new Map(),
        childrenOf: new Map(),
        rootIds: [],
      }
      assert.equal(resolveRightmostLeaf(tree), null)
    })

    // A8: resolveLatestLeafInSubtree — from middle node
    await test('A8: resolveLatestLeafInSubtree from middle', () => {
      const tree = buildTree([
        msg('g1', null),
        msg('g2', 'g1'),
        msg('g3', 'g2'),
        msg('g4', 'g2'), // sibling of g3
      ])
      const leaf = resolveLatestLeafInSubtree(tree, 'g2')
      // picks rightmost child recursively => g4
      assert.equal(leaf, 'g4')
    })

    // A9: resolveLatestLeafInSubtree — nonexistent
    await test('A9: resolveLatestLeafInSubtree nonexistent', () => {
      const tree = buildTree([msg('h1', null)])
      assert.equal(resolveLatestLeafInSubtree(tree, 'nope'), null)
    })

    // A10: resolveLatestLeafInSubtree — leaf itself
    await test('A10: resolveLatestLeafInSubtree leaf itself', () => {
      const tree = buildTree([msg('i1', null), msg('i2', 'i1')])
      assert.equal(resolveLatestLeafInSubtree(tree, 'i2'), 'i2')
    })

    // A11: buildSiblingNavForChain — no branches
    await test('A11: buildSiblingNavForChain no branches', () => {
      const m1 = msg('j1', null)
      const m2 = msg('j2', 'j1')
      const tree = buildTree([m1, m2])
      const nav = buildSiblingNavForChain(tree, ['j1', 'j2'])
      assert.equal(nav['j1']!.siblingTotal, 1)
      assert.equal(nav['j2']!.siblingTotal, 1)
      assert.equal(nav['j1']!.prevSiblingId, null)
      assert.equal(nav['j1']!.nextSiblingId, null)
    })

    // A12: buildSiblingNavForChain — with branches
    await test('A12: buildSiblingNavForChain with branches', () => {
      const m1 = msg('k1', null)
      const m2 = msg('k2', 'k1')
      const m3 = msg('k3', 'k1') // sibling of k2
      const tree = buildTree([m1, m2, m3])
      const nav = buildSiblingNavForChain(tree, ['k1', 'k2'])
      assert.equal(nav['k2']!.siblingTotal, 2)
      assert.equal(nav['k2']!.siblingIndex, 1)
      assert.equal(nav['k2']!.nextSiblingId, 'k3')
      assert.equal(nav['k2']!.prevSiblingId, null)
    })

    // A13: buildSiblingNavForChain — nested branches
    await test('A13: buildSiblingNavForChain nested branches', () => {
      const tree = buildTree([
        msg('l1', null),
        msg('l2', 'l1'),
        msg('l3', 'l1'), // sibling of l2
        msg('l4', 'l3'),
        msg('l5', 'l3'), // sibling of l4
      ])
      const nav = buildSiblingNavForChain(tree, ['l1', 'l3', 'l5'])
      assert.equal(nav['l3']!.siblingTotal, 2)
      assert.equal(nav['l3']!.siblingIndex, 2)
      assert.equal(nav['l3']!.prevSiblingId, 'l2')
      assert.equal(nav['l5']!.siblingTotal, 2)
      assert.equal(nav['l5']!.siblingIndex, 2)
      assert.equal(nav['l5']!.prevSiblingId, 'l4')
    })

    // A14: buildSiblingNavForChain — depth 3 siblings
    await test('A14: buildSiblingNavForChain depth 3', () => {
      const tree = buildTree([
        msg('n1', null),
        msg('n2', 'n1'),
        msg('n3', 'n2'),
        msg('n4', 'n2'), // sibling of n3
        msg('n5', 'n2'), // another sibling
      ])
      const nav = buildSiblingNavForChain(tree, ['n1', 'n2', 'n4'])
      assert.equal(nav['n4']!.siblingTotal, 3)
      assert.equal(nav['n4']!.siblingIndex, 2)
      assert.equal(nav['n4']!.prevSiblingId, 'n3')
      assert.equal(nav['n4']!.nextSiblingId, 'n5')
    })

    // =====================================================================
    // B layer: file read/write (temp dir + real Prisma)
    // =====================================================================
    console.log('\n--- B layer: file operations ---')

    // B1: appendMessage + loadMessageTree basic
    await test('B1: appendMessage + loadMessageTree', async () => {
      const sid = testSessionId
      const m1 = msg('b1m1', null)
      const m2 = msg('b1m2', 'b1m1', 'assistant')
      await appendMessage({ sessionId: sid, message: m1 })
      await appendMessage({ sessionId: sid, message: m2 })
      const tree = await loadMessageTree(sid)
      assert.equal(tree.byId.size, 2)
      assert.equal(tree.rootIds.length, 1)
      assert.equal(tree.rootIds[0], 'b1m1')
      const children = tree.childrenOf.get('b1m1') ?? []
      assert.equal(children.length, 1)
      assert.equal(children[0], 'b1m2')
    })

    // B2: updateMessage last-write-wins
    await test('B2: updateMessage last-write-wins', async () => {
      const sid = testSessionId
      const updated = msg('b1m2', 'b1m1', 'assistant', {
        parts: [{ type: 'text', text: 'updated-content' }],
      })
      await updateMessage({ sessionId: sid, message: updated })
      const tree = await loadMessageTree(sid)
      const m = tree.byId.get('b1m2')!
      assert.equal((m.parts[0] as any).text, 'updated-content')
      // tree should still have 2 unique messages
      assert.equal(tree.byId.size, 2)
    })

    // B3: build multi-branch tree
    await test('B3: multi-branch tree', async () => {
      const sid = testSessionId
      // Add a branch: b1m1 -> b1m3 (sibling of b1m2)
      await appendMessage({ sessionId: sid, message: msg('b1m3', 'b1m1') })
      const tree = await loadMessageTree(sid)
      const children = tree.childrenOf.get('b1m1') ?? []
      assert.equal(children.length, 2)
      assert.ok(children.includes('b1m2'))
      assert.ok(children.includes('b1m3'))
    })

    // B4: deleteMessageSubtree removes branch with descendants
    await test('B4: deleteMessageSubtree branch', async () => {
      const sid = testSessionId
      // Add descendant to b1m3
      await appendMessage({ sessionId: sid, message: msg('b1m4', 'b1m3') })
      const result = await deleteMessageSubtree({ sessionId: sid, messageId: 'b1m3' })
      assert.equal(result.deletedCount, 2) // b1m3 + b1m4
      assert.equal(result.parentMessageId, 'b1m1')
      const tree = await loadMessageTree(sid)
      assert.equal(tree.byId.has('b1m3'), false)
      assert.equal(tree.byId.has('b1m4'), false)
    })

    // B5: deleteMessageSubtree removes leaf
    await test('B5: deleteMessageSubtree leaf', async () => {
      const sid = testSessionId
      await appendMessage({ sessionId: sid, message: msg('b1m5', 'b1m2') })
      const result = await deleteMessageSubtree({ sessionId: sid, messageId: 'b1m5' })
      assert.equal(result.deletedCount, 1)
      assert.equal(result.parentMessageId, 'b1m2')
    })

    // B6: updateMessageParts
    await test('B6: updateMessageParts', async () => {
      const sid = testSessionId
      const newParts = [{ type: 'text', text: 'parts-updated' }]
      const ok = await updateMessageParts({ sessionId: sid, messageId: 'b1m1', parts: newParts })
      assert.equal(ok, true)
      const m = await getMessageById({ sessionId: sid, messageId: 'b1m1' })
      assert.equal((m!.parts[0] as any).text, 'parts-updated')
    })

    // B7: updateMessageMetadata merge semantics
    await test('B7: updateMessageMetadata merge', async () => {
      const sid = testSessionId
      await updateMessageMetadata({
        sessionId: sid,
        messageId: 'b1m1',
        metadata: { key1: 'val1' },
      })
      const merged = await updateMessageMetadata({
        sessionId: sid,
        messageId: 'b1m1',
        metadata: { key2: 'val2' },
      })
      assert.equal(merged!.key1, 'val1')
      assert.equal(merged!.key2, 'val2')
    })

    // B8: getMessageById
    await test('B8: getMessageById', async () => {
      const sid = testSessionId
      const m = await getMessageById({ sessionId: sid, messageId: 'b1m1' })
      assert.ok(m)
      assert.equal(m!.id, 'b1m1')
      const missing = await getMessageById({ sessionId: sid, messageId: 'nonexistent' })
      assert.equal(missing, null)
    })

    // B9: getMessageCount excludes subagent
    await test('B9: getMessageCount excludes subagent', async () => {
      const sid = testSessionId
      await appendMessage({ sessionId: sid, message: msg('b1sub', 'b1m1', 'subagent') })
      const count = await getMessageCount(sid)
      const tree = await loadMessageTree(sid)
      let totalNonSubagent = 0
      for (const m of tree.byId.values()) {
        if (m.role !== 'subagent') totalNonSubagent++
      }
      assert.equal(count, totalNonSubagent)
    })

    // B10: loadMessageChainFromFile + maxMessages
    await test('B10: loadMessageChainFromFile + maxMessages', async () => {
      const sid = testSessionId
      // chain: b1m1 -> b1m2
      const chain = await loadMessageChainFromFile({
        sessionId: sid,
        leafMessageId: 'b1m2',
      })
      assert.ok(chain.length >= 2)
      // subagent should be filtered out
      assert.ok(chain.every((m) => m.role !== 'subagent'))

      // maxMessages = 1 should truncate
      const limited = await loadMessageChainFromFile({
        sessionId: sid,
        leafMessageId: 'b1m2',
        maxMessages: 1,
      })
      assert.equal(limited.length, 1)
    })

    // B11: writeSessionJson + readSessionJson
    await test('B11: writeSessionJson + readSessionJson', async () => {
      const sid = testSessionId
      await writeSessionJson(sid, { title: 'Test Session', isPin: true } as any)
      const data = await readSessionJson(sid)
      assert.ok(data)
      assert.equal(data!.title, 'Test Session')
      assert.equal(data!.isPin, true)
      assert.equal(data!.id, sid)

      // merge write
      await writeSessionJson(sid, { isUserRename: true } as any)
      const data2 = await readSessionJson(sid)
      assert.equal(data2!.title, 'Test Session')
      assert.equal(data2!.isUserRename, true)
    })

    // B12: deleteSessionFiles
    await test('B12: deleteSessionFiles', async () => {
      const sid2 = `test_cfs_del_${crypto.randomUUID()}`
      await prisma.chatSession.create({ data: { id: sid2 } })
      registerSessionDir(sid2)
      await appendMessage({ sessionId: sid2, message: msg('del1', null) })
      await writeSessionJson(sid2, { title: 'to-delete' } as any)

      await deleteSessionFiles(sid2)
      const tree = await loadMessageTree(sid2)
      assert.equal(tree.byId.size, 0)
      const sj = await readSessionJson(sid2)
      assert.equal(sj, null)

      await prisma.chatSession.delete({ where: { id: sid2 } }).catch(() => {})
    })

    // B13: concurrent writes via mutex
    await test('B13: concurrent writes via mutex', async () => {
      const sid3 = `test_cfs_conc_${crypto.randomUUID()}`
      await prisma.chatSession.create({ data: { id: sid3 } })
      registerSessionDir(sid3)

      const promises = Array.from({ length: 10 }, (_, i) =>
        appendMessage({ sessionId: sid3, message: msg(`conc${i}`, null) }),
      )
      await Promise.all(promises)

      const tree = await loadMessageTree(sid3)
      assert.equal(tree.byId.size, 10)

      await deleteSessionFiles(sid3)
      await prisma.chatSession.delete({ where: { id: sid3 } }).catch(() => {})
    })

    // =====================================================================
    // C layer: getChatViewFromFile integration
    // =====================================================================
    console.log('\n--- C layer: getChatViewFromFile ---')

    // Prepare a fresh session for C-layer tests
    const cSid = `test_cfs_view_${crypto.randomUUID()}`
    await prisma.chatSession.create({ data: { id: cSid } })
    registerSessionDir(cSid)

    // Build a tree:
    //   c1 (user) -> c2 (assistant) -> c3 (user) -> c4 (assistant)
    //                               -> c5 (user) -> c6 (assistant)  [branch]
    //   c1 also has subagent child c_sub (should be filtered)
    //   c1 also has compact_prompt child c_cp (should be filtered)
    const cBase = Date.now()
    const cMessages: StoredMessage[] = [
      { ...msg('c1', null), createdAt: new Date(cBase).toISOString() },
      { ...msg('c2', 'c1', 'assistant'), createdAt: new Date(cBase + 1000).toISOString() },
      { ...msg('c3', 'c2'), createdAt: new Date(cBase + 2000).toISOString() },
      { ...msg('c4', 'c3', 'assistant'), createdAt: new Date(cBase + 3000).toISOString() },
      { ...msg('c5', 'c2'), createdAt: new Date(cBase + 4000).toISOString() },
      { ...msg('c6', 'c5', 'assistant'), createdAt: new Date(cBase + 5000).toISOString() },
      {
        ...msg('c_sub', 'c1', 'subagent'),
        createdAt: new Date(cBase + 6000).toISOString(),
      },
      {
        ...msg('c_cp', 'c1'),
        messageKind: 'compact_prompt',
        createdAt: new Date(cBase + 7000).toISOString(),
      },
    ]
    for (const m of cMessages) {
      await appendMessage({ sessionId: cSid, message: m })
    }

    // C1: linear chain default anchor
    await test('C1: getChatViewFromFile default anchor', async () => {
      const view = await getChatViewFromFile({ sessionId: cSid })
      assert.ok(view.leafMessageId)
      assert.ok(view.messages)
      assert.ok(view.messages!.length > 0)
      // default picks rightmost renderable leaf
      // rightmost path: c1 -> c2 -> c5 -> c6 (c5 is later than c3)
      // or c1 -> c_cp (not renderable) / c_sub (not renderable)
      // The rightmost renderable leaf should be c6
      assert.equal(view.leafMessageId, 'c6')
    })

    // C2: multi-branch default picks rightmost leaf
    await test('C2: multi-branch rightmost leaf', async () => {
      const view = await getChatViewFromFile({ sessionId: cSid })
      // chain should be c1 -> c2 -> c5 -> c6
      assert.ok(view.branchMessageIds.includes('c6'))
      assert.ok(view.branchMessageIds.includes('c5'))
      assert.ok(view.branchMessageIds.includes('c2'))
      assert.ok(view.branchMessageIds.includes('c1'))
    })

    // C3: anchor + latestLeafInSubtree switches branch
    await test('C3: anchor latestLeafInSubtree', async () => {
      const view = await getChatViewFromFile({
        sessionId: cSid,
        anchor: { messageId: 'c3', strategy: 'latestLeafInSubtree' },
      })
      // subtree of c3 -> c4 (leaf)
      assert.equal(view.leafMessageId, 'c4')
      assert.ok(view.branchMessageIds.includes('c4'))
      assert.ok(view.branchMessageIds.includes('c3'))
    })

    // C4: anchor + self strategy
    await test('C4: anchor self strategy', async () => {
      const view = await getChatViewFromFile({
        sessionId: cSid,
        anchor: { messageId: 'c2', strategy: 'self' },
      })
      assert.equal(view.leafMessageId, 'c2')
      assert.ok(view.branchMessageIds.includes('c2'))
      assert.ok(view.branchMessageIds.includes('c1'))
      assert.ok(!view.branchMessageIds.includes('c3'))
    })

    // C5: siblingNav correctness
    await test('C5: siblingNav correctness', async () => {
      const view = await getChatViewFromFile({
        sessionId: cSid,
        anchor: { messageId: 'c3', strategy: 'latestLeafInSubtree' },
        include: { siblingNav: true },
      })
      assert.ok(view.siblingNav)
      // c3 and c5 are siblings under c2
      const navC3 = view.siblingNav!['c3']
      assert.ok(navC3)
      assert.equal(navC3.siblingTotal, 2)
      assert.equal(navC3.siblingIndex, 1)
      assert.equal(navC3.nextSiblingId, 'c5')
    })

    // C6: filters subagent and compact_prompt
    await test('C6: filters subagent and compact_prompt', async () => {
      const view = await getChatViewFromFile({
        sessionId: cSid,
        include: { messages: true },
      })
      const ids = view.messages!.map((m) => m.id)
      assert.ok(!ids.includes('c_sub'), 'subagent should be filtered')
      assert.ok(!ids.includes('c_cp'), 'compact_prompt should be filtered')
    })

    // Cleanup C-layer session
    await deleteSessionFiles(cSid)
    await prisma.chatSession.delete({ where: { id: cSid } }).catch(() => {})
  } finally {
    // ---- Teardown ----
    await prisma.chatSession.delete({ where: { id: testSessionId } }).catch(() => {})
    setTenasRootOverride(null)
    clearSessionDirCache()
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }

  // ---- Summary ----
  console.log(`\n${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed tests:')
    for (const e of errors) console.log(`  - ${e}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
