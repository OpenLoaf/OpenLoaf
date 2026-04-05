/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from 'node:fs'
import type { MessageTreeIndex, SiblingNavEntry, StoredMessage } from './chatFileStore'
import { LRU_MAX_SIZE, messagesPath, readJsonlRaw } from './chatFileStore'

// ---------------------------------------------------------------------------
// LRU Cache (message tree)
// ---------------------------------------------------------------------------

type CacheEntry = {
  tree: MessageTreeIndex
  mtimeMs: number
}

const lruCache = new Map<string, CacheEntry>()
const lruOrder: string[] = []

function evictLru() {
  while (lruOrder.length > LRU_MAX_SIZE) {
    const oldest = lruOrder.shift()
    if (oldest) lruCache.delete(oldest)
  }
}

function touchLru(sessionId: string) {
  const idx = lruOrder.indexOf(sessionId)
  if (idx >= 0) lruOrder.splice(idx, 1)
  lruOrder.push(sessionId)
  evictLru()
}

export function invalidateCache(sessionId: string) {
  lruCache.delete(sessionId)
  const idx = lruOrder.indexOf(sessionId)
  if (idx >= 0) lruOrder.splice(idx, 1)
}

/** @internal — used by chatFileStore.ts deleteAllChatFiles */
export function _clearAllTreeCaches() {
  lruCache.clear()
  lruOrder.length = 0
}

// ---------------------------------------------------------------------------
// Message tree building (last-write-wins dedup)
// ---------------------------------------------------------------------------

export function buildTreeFromMessages(messages: StoredMessage[]): MessageTreeIndex {
  // 逻辑：防御性去重 — 正常情况下每个 id 只出现一次，但保留兜底以防异常。
  const byId = new Map<string, StoredMessage>()
  for (const msg of messages) {
    byId.set(msg.id, msg)
  }

  const childrenOf = new Map<string, string[]>()
  const rootIds: string[] = []

  // 按 createdAt 排序确定 siblings 顺序
  const sorted = Array.from(byId.values()).sort((a, b) => {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    return ta - tb || a.id.localeCompare(b.id)
  })

  for (const msg of sorted) {
    // 孤儿消息（parentMessageId 指向已不存在的消息）按 root 处理，避免
    // 整段子树被静默丢弃。常见于写入竞态或旧数据被部分截断的场景。
    const parentExists =
      msg.parentMessageId !== null && byId.has(msg.parentMessageId)
    if (msg.parentMessageId === null || !parentExists) {
      rootIds.push(msg.id)
    } else {
      const parentKey = msg.parentMessageId
      const children = childrenOf.get(parentKey) ?? []
      children.push(msg.id)
      childrenOf.set(parentKey, children)
    }
  }

  // rootIds 也放入 childrenOf 以统一查询
  if (rootIds.length > 0) {
    childrenOf.set('__root__', rootIds)
  }

  return { byId, childrenOf, rootIds }
}

// ---------------------------------------------------------------------------
// Load message tree (with LRU cache + mtime check)
// ---------------------------------------------------------------------------

export async function loadMessageTree(sessionId: string): Promise<MessageTreeIndex> {
  const filePath = await messagesPath(sessionId)
  let mtimeMs = 0
  try {
    const stat = await fs.stat(filePath)
    mtimeMs = stat.mtimeMs
  } catch {
    // 文件不存在，返回空树
    return { byId: new Map(), childrenOf: new Map(), rootIds: [] }
  }

  const cached = lruCache.get(sessionId)
  if (cached && cached.mtimeMs === mtimeMs) {
    touchLru(sessionId)
    return cached.tree
  }

  const messages = await readJsonlRaw(sessionId)
  const tree = buildTreeFromMessages(messages)
  lruCache.set(sessionId, { tree, mtimeMs })
  touchLru(sessionId)
  return tree
}

// ---------------------------------------------------------------------------
// Tree navigation
// ---------------------------------------------------------------------------

/** Resolve the chain from a leaf message back to root. */
export function resolveChainFromLeaf(
  tree: MessageTreeIndex,
  leafId: string,
): StoredMessage[] {
  const chain: StoredMessage[] = []
  let currentId: string | null = leafId
  const visited = new Set<string>()

  while (currentId) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const msg = tree.byId.get(currentId)
    if (!msg) break
    chain.unshift(msg)
    currentId = msg.parentMessageId
  }

  return chain
}

/** Resolve the rightmost leaf by recursively picking the last child. */
export function resolveRightmostLeaf(tree: MessageTreeIndex): string | null {
  if (tree.rootIds.length === 0) return null
  let currentId = tree.rootIds[tree.rootIds.length - 1]!
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const children = tree.childrenOf.get(currentId)
    if (!children || children.length === 0) return currentId
    currentId = children[children.length - 1]!
  }
}

/** Resolve the latest leaf in a subtree starting from a given message. */
export function resolveLatestLeafInSubtree(
  tree: MessageTreeIndex,
  startId: string,
): string | null {
  if (!tree.byId.has(startId)) return null
  let currentId = startId
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const children = tree.childrenOf.get(currentId)
    if (!children || children.length === 0) return currentId
    currentId = children[children.length - 1]!
  }
}

/** Build sibling navigation for all messages in a chain. */
export function buildSiblingNavForChain(
  tree: MessageTreeIndex,
  chainIds: string[],
): Record<string, SiblingNavEntry> {
  const nav: Record<string, SiblingNavEntry> = {}

  for (const msgId of chainIds) {
    const msg = tree.byId.get(msgId)
    if (!msg) continue

    const parentKey = msg.parentMessageId ?? '__root__'
    const siblings = tree.childrenOf.get(parentKey) ?? [msgId]
    const idx = siblings.indexOf(msgId)
    const total = siblings.length

    nav[msgId] = {
      parentMessageId: msg.parentMessageId,
      prevSiblingId: idx > 0 ? (siblings[idx - 1] ?? null) : null,
      nextSiblingId: idx < total - 1 ? (siblings[idx + 1] ?? null) : null,
      siblingIndex: idx + 1,
      siblingTotal: total,
    }
  }

  return nav
}

/** Collect all descendant ids (BFS). */
export function collectSubtreeIds(tree: MessageTreeIndex, startId: string): string[] {
  const result: string[] = [startId]
  const queue = [startId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const children = tree.childrenOf.get(current) ?? []
    for (const childId of children) {
      result.push(childId)
      queue.push(childId)
    }
  }
  return result
}
