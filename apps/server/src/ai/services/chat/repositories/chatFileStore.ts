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
import fsSync from 'node:fs'
import path from 'node:path'
import { resolveOpenLoafPath } from '@openloaf/config'
import {
  getProjectRootPath,
  getWorkspaceRootPathById,
} from '@openloaf/api/services/vfsService'
import { prisma } from '@openloaf/db'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoredMessage = {
  id: string
  parentMessageId: string | null
  role: 'user' | 'assistant' | 'system' | 'subagent'
  messageKind: 'normal' | 'compact_prompt' | 'compact_summary'
  parts: unknown[]
  metadata?: Record<string, unknown>
  createdAt: string
}

export type MessageTreeIndex = {
  byId: Map<string, StoredMessage>
  childrenOf: Map<string, string[]>
  rootIds: string[]
}

type SessionJson = {
  id: string
  title: string
  isUserRename: boolean
  isPin: boolean
  errorMessage: string | null
  sessionPreface: string | null
  workspaceId: string | null
  projectId: string | null
  boardId: string | null
  cliId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  messageCount: number
}

export type SiblingNavEntry = {
  parentMessageId: string | null
  prevSiblingId: string | null
  nextSiblingId: string | null
  siblingIndex: number
  siblingTotal: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAT_HISTORY_DIR = 'chat-history'
const MESSAGES_FILE = 'messages.jsonl'
const SESSION_FILE = 'session.json'
const LRU_MAX_SIZE = 50

// ---------------------------------------------------------------------------
// Per-session mutex (Promise-based queue)
// ---------------------------------------------------------------------------

const sessionLocks = new Map<string, Promise<void>>()

async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionId) ?? Promise.resolve()
  let resolve: () => void
  const next = new Promise<void>((r) => {
    resolve = r
  })
  sessionLocks.set(sessionId, next)
  try {
    await prev
    return await fn()
  } finally {
    resolve!()
    if (sessionLocks.get(sessionId) === next) {
      sessionLocks.delete(sessionId)
    }
  }
}

// ---------------------------------------------------------------------------
// LRU Cache
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

function invalidateCache(sessionId: string) {
  lruCache.delete(sessionId)
  const idx = lruOrder.indexOf(sessionId)
  if (idx >= 0) lruOrder.splice(idx, 1)
}

// ---------------------------------------------------------------------------
// Path helpers — 根据 session 的 workspaceId/projectId 解析到对应根目录
// ---------------------------------------------------------------------------

// 逻辑：缓存 sessionId → 目录路径，避免每次都查数据库
const sessionDirCache = new Map<string, string>()

/**
 * 解析 session 的 chat-history 根目录：
 * - 有 projectId → <projectRoot>/.openloaf/chat-history/
 * - 无 projectId → <workspaceRoot>/.openloaf/chat-history/
 * - 都没有 → ~/.openloaf/chat-history/ (fallback)
 */
function resolveChatHistoryRoot(workspaceId?: string | null, projectId?: string | null): string {
  if (projectId) {
    const projectRoot = getProjectRootPath(projectId, workspaceId ?? undefined)
    if (projectRoot) {
      return path.join(projectRoot, '.openloaf', CHAT_HISTORY_DIR)
    }
  }
  if (workspaceId) {
    const workspaceRoot = getWorkspaceRootPathById(workspaceId)
    if (workspaceRoot) {
      return path.join(workspaceRoot, '.openloaf', CHAT_HISTORY_DIR)
    }
  }
  return resolveOpenLoafPath(CHAT_HISTORY_DIR)
}

async function resolveSessionDir(sessionId: string): Promise<string> {
  const cached = sessionDirCache.get(sessionId)
  if (cached) return cached

  // 从数据库查 session 的 workspaceId/projectId
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { workspaceId: true, projectId: true },
  })
  const root = resolveChatHistoryRoot(session?.workspaceId, session?.projectId)
  const dir = path.join(root, sessionId)
  sessionDirCache.set(sessionId, dir)
  return dir
}

/** 注册 session 目录（写入时已知 workspaceId/projectId，避免 DB 查询） */
export function registerSessionDir(
  sessionId: string,
  workspaceId?: string | null,
  projectId?: string | null,
): void {
  const root = resolveChatHistoryRoot(workspaceId, projectId)
  sessionDirCache.set(sessionId, path.join(root, sessionId))
}

/** 清除 session 目录缓存 */
export function clearSessionDirCache(sessionId?: string): void {
  if (sessionId) {
    sessionDirCache.delete(sessionId)
  } else {
    sessionDirCache.clear()
  }
}

async function messagesPath(sessionId: string): Promise<string> {
  const dir = await resolveSessionDir(sessionId)
  return path.join(dir, MESSAGES_FILE)
}

/** Resolve the absolute path to the messages.jsonl file for a session. */
export async function resolveMessagesJsonlPath(sessionId: string): Promise<string> {
  return messagesPath(sessionId)
}

async function sessionJsonPath(sessionId: string): Promise<string> {
  const dir = await resolveSessionDir(sessionId)
  return path.join(dir, SESSION_FILE)
}

async function ensureSessionDir(sessionId: string): Promise<void> {
  const dir = await resolveSessionDir(sessionId)
  await fs.mkdir(dir, { recursive: true })
}

// ---------------------------------------------------------------------------
// JSONL read / write
// ---------------------------------------------------------------------------

function parseJsonlLine(line: string): StoredMessage | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as StoredMessage
  } catch {
    return null
  }
}

async function readJsonlRaw(sessionId: string): Promise<StoredMessage[]> {
  const filePath = await messagesPath(sessionId)
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n')
    const messages: StoredMessage[] = []
    for (const line of lines) {
      const msg = parseJsonlLine(line)
      if (msg) messages.push(msg)
    }
    return messages
  } catch (err: any) {
    if (err?.code === 'ENOENT') return []
    throw err
  }
}

async function appendJsonlLine(sessionId: string, message: StoredMessage): Promise<void> {
  await ensureSessionDir(sessionId)
  const filePath = await messagesPath(sessionId)
  const line = `${JSON.stringify(message)}\n`
  await fs.appendFile(filePath, line, 'utf8')
  logger.info({ sessionId, filePath, messageId: message.id }, '[chat-file-store] message appended')
}

async function rewriteJsonl(sessionId: string, messages: StoredMessage[]): Promise<void> {
  await ensureSessionDir(sessionId)
  const content = messages.map((m) => `${JSON.stringify(m)}\n`).join('')
  await fs.writeFile(await messagesPath(sessionId), content, 'utf8')
}

/** 原地替换 JSONL 中的消息（按 id 匹配），若不存在则追加。 */
async function replaceMessageInJsonl(sessionId: string, message: StoredMessage): Promise<void> {
  const messages = await readJsonlRaw(sessionId)
  let replaced = false
  const updated = messages.map((m) => {
    if (m.id === message.id) {
      replaced = true
      return message
    }
    return m
  })
  if (!replaced) {
    updated.push(message)
  }
  await rewriteJsonl(sessionId, updated)
}

// ---------------------------------------------------------------------------
// Message tree building (last-write-wins dedup)
// ---------------------------------------------------------------------------

function buildTreeFromMessages(messages: StoredMessage[]): MessageTreeIndex {
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
    const parentKey = msg.parentMessageId ?? '__root__'
    if (msg.parentMessageId === null) {
      rootIds.push(msg.id)
    } else {
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
// Core operations
// ---------------------------------------------------------------------------

/** Append a new message to the session JSONL. */
export async function appendMessage(input: {
  sessionId: string
  message: StoredMessage
}): Promise<void> {
  await withSessionLock(input.sessionId, async () => {
    await appendJsonlLine(input.sessionId, input.message)
    invalidateCache(input.sessionId)
  })
}

/** Update an existing message in-place (replace by id, or append if new). */
export async function updateMessage(input: {
  sessionId: string
  message: StoredMessage
}): Promise<void> {
  await withSessionLock(input.sessionId, async () => {
    await replaceMessageInJsonl(input.sessionId, input.message)
    invalidateCache(input.sessionId)
  })
}

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
  const chainIdSet = new Set(chainIds)

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

// ---------------------------------------------------------------------------
// Renderable filter (matches packages/api getChatView logic)
// ---------------------------------------------------------------------------

function isRenderable(msg: StoredMessage): boolean {
  const kind = msg.messageKind ?? 'normal'
  if (kind === 'compact_prompt') return false
  if (kind === 'compact_summary') return true
  if (msg.role === 'subagent') return false
  if (msg.role === 'user') return true
  return Array.isArray(msg.parts) && msg.parts.length > 0
}

// ---------------------------------------------------------------------------
// getChatViewFromFile — complete replacement for DB-based getChatView
// ---------------------------------------------------------------------------

export type ChatViewResult = {
  leafMessageId: string | null
  branchMessageIds: string[]
  errorMessage: string | null
  messages?: Array<{
    id: string
    role: string
    parentMessageId: string | null
    parts: unknown[]
    metadata?: unknown
    messageKind?: string
    agent?: unknown
  }>
  siblingNav?: Record<string, SiblingNavEntry>
  pageInfo: {
    nextCursor: { beforeMessageId: string } | null
    hasMore: boolean
  }
}

export async function getChatViewFromFile(input: {
  sessionId: string
  anchor?: { messageId: string; strategy?: 'self' | 'latestLeafInSubtree' }
  window?: { limit?: number; cursor?: { beforeMessageId: string } }
  include?: { messages?: boolean; siblingNav?: boolean }
  includeToolOutput?: boolean
}): Promise<ChatViewResult> {
  const includeMessages = input.include?.messages !== false
  const includeSiblingNav = input.include?.siblingNav !== false
  const includeToolOutput = input.includeToolOutput !== false
  const limit = input.window?.limit ?? 50
  const anchorStrategy = input.anchor?.strategy ?? 'latestLeafInSubtree'

  // 从数据库读取 session 元数据
  const sessionRow = await prisma.chatSession.findUnique({
    where: { id: input.sessionId },
    select: { errorMessage: true, sessionPreface: true },
  })
  const sessionErrorMessage = sessionRow?.errorMessage ?? null

  const tree = await loadMessageTree(input.sessionId)

  const emptyResult: ChatViewResult = {
    leafMessageId: null,
    branchMessageIds: [],
    errorMessage: sessionErrorMessage,
    ...(includeMessages ? { messages: [] } : {}),
    ...(includeSiblingNav ? { siblingNav: {} } : {}),
    pageInfo: { nextCursor: null, hasMore: false },
  }

  // 解析 cursor
  let leafFromCursor: string | null = null
  if (input.window?.cursor?.beforeMessageId) {
    const cursorMsg = tree.byId.get(input.window.cursor.beforeMessageId)
    if (cursorMsg) leafFromCursor = cursorMsg.parentMessageId
  }

  // 解析 base anchor
  const baseAnchorId =
    leafFromCursor ??
    input.anchor?.messageId ??
    resolveRightmostRenderableLeaf(tree)

  if (!baseAnchorId) return emptyResult

  // 解析最终 leaf
  const leafMessageId =
    !leafFromCursor && anchorStrategy === 'latestLeafInSubtree'
      ? resolveLatestRenderableLeafInSubtree(tree, baseAnchorId)
      : baseAnchorId

  if (!leafMessageId) return emptyResult

  // 构建主链
  const fullChain = resolveChainFromLeaf(tree, leafMessageId)
  const renderableChain = fullChain.filter(isRenderable)

  // 分页截断
  const isTruncated = renderableChain.length > limit
  const displayChain = isTruncated ? renderableChain.slice(-limit) : renderableChain
  const nextCursorBeforeMessageId = isTruncated ? (displayChain[0]?.id ?? null) : null

  const branchMessageIds = displayChain.map((m) => m.id)

  // 构建消息列表
  let messages: ChatViewResult['messages']
  if (includeMessages) {
    messages = displayChain.map((msg) => {
      const parts = Array.isArray(msg.parts) ? msg.parts : []
      const normalizedParts = includeToolOutput ? parts : stripToolOutputs(parts)
      return {
        id: msg.id,
        role: msg.role,
        parentMessageId: msg.parentMessageId,
        parts: normalizedParts,
        metadata: msg.metadata ?? undefined,
        messageKind: msg.messageKind ?? undefined,
        agent: (msg.metadata as any)?.agent ?? undefined,
      }
    })
  }

  // 构建 sibling nav
  let siblingNav: Record<string, SiblingNavEntry> | undefined
  if (includeSiblingNav) {
    const rawNav = buildSiblingNavForChain(tree, branchMessageIds)
    // 保证主链每个节点都有 siblingNav
    siblingNav = {}
    for (const msg of displayChain) {
      siblingNav[msg.id] = rawNav[msg.id] ?? {
        parentMessageId: msg.parentMessageId,
        prevSiblingId: null,
        nextSiblingId: null,
        siblingIndex: 1,
        siblingTotal: 1,
      }
    }
  }

  return {
    leafMessageId,
    branchMessageIds,
    errorMessage: sessionErrorMessage,
    ...(includeMessages ? { messages } : {}),
    ...(includeSiblingNav ? { siblingNav } : {}),
    pageInfo: {
      nextCursor: nextCursorBeforeMessageId
        ? { beforeMessageId: nextCursorBeforeMessageId }
        : null,
      hasMore: Boolean(nextCursorBeforeMessageId),
    },
  }
}

/** Resolve rightmost renderable leaf (skip subagent/compact_prompt/empty assistant). */
function resolveRightmostRenderableLeaf(tree: MessageTreeIndex): string | null {
  if (tree.rootIds.length === 0) return null
  // 从最后一个 root 开始，递归选最后一个子节点
  for (let i = tree.rootIds.length - 1; i >= 0; i--) {
    const leaf = resolveLatestRenderableLeafInSubtree(tree, tree.rootIds[i]!)
    if (leaf) return leaf
  }
  return null
}

/** Resolve latest renderable leaf in a subtree. */
function resolveLatestRenderableLeafInSubtree(
  tree: MessageTreeIndex,
  startId: string,
): string | null {
  if (!tree.byId.has(startId)) return null

  // DFS 从最右子节点开始，找到第一个 renderable 叶子
  const stack: string[] = [startId]
  let bestLeaf: string | null = null

  // 逻辑：递归选最后一个子节点直到叶子
  let currentId = startId
  while (true) {
    const children = tree.childrenOf.get(currentId)
    if (!children || children.length === 0) {
      // 到达叶子
      const msg = tree.byId.get(currentId)
      if (msg && isRenderable(msg)) return currentId
      // 回溯：这个叶子不可渲染，尝试前一个 sibling
      break
    }
    currentId = children[children.length - 1]!
  }

  // 如果最右路径的叶子不可渲染，做 BFS 回退
  // 简化实现：遍历所有后代，按 createdAt 倒序找第一个可渲染叶子
  const allDescendants = collectSubtreeIds(tree, startId)
  const candidates = allDescendants
    .map((id) => tree.byId.get(id)!)
    .filter((msg) => {
      if (!isRenderable(msg)) return false
      const children = tree.childrenOf.get(msg.id)
      return !children || children.length === 0
    })
    .sort((a, b) => {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      return tb - ta || b.id.localeCompare(a.id)
    })

  return candidates[0]?.id ?? null
}

/** Collect all descendant ids (BFS). */
function collectSubtreeIds(tree: MessageTreeIndex, startId: string): string[] {
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

// 逻辑：媒体生成工具的 output 很小（仅含 urls），刷新后需要用于渲染预览。
const KEEP_OUTPUT_TOOLS = new Set(['image-generate', 'video-generate', 'request-user-input'])

/** Strip tool output payloads from parts. */
function stripToolOutputs(parts: unknown[]): unknown[] {
  return parts.map((part: any) => {
    const type = typeof part?.type === 'string' ? part.type : ''
    if (!type.startsWith('tool-')) return part
    const toolName = typeof part?.toolName === 'string'
      ? part.toolName
      : type.slice('tool-'.length)
    if (KEEP_OUTPUT_TOOLS.has(toolName)) return part
    const { output, ...rest } = part ?? {}
    return rest
  })
}

// ---------------------------------------------------------------------------
// Delete message subtree
// ---------------------------------------------------------------------------

export async function deleteMessageSubtree(input: {
  sessionId: string
  messageId: string
}): Promise<{ deletedCount: number; parentMessageId: string | null }> {
  return withSessionLock(input.sessionId, async () => {
    const tree = await loadMessageTree(input.sessionId)
    const target = tree.byId.get(input.messageId)
    if (!target) return { deletedCount: 0, parentMessageId: null }

    const idsToDelete = new Set(collectSubtreeIds(tree, input.messageId))
    const allMessages = await readJsonlRaw(input.sessionId)
    // 过滤掉被删除的消息（保留 last-write-wins 语义）
    const remaining = allMessages.filter((m) => !idsToDelete.has(m.id))
    await rewriteJsonl(input.sessionId, remaining)
    invalidateCache(input.sessionId)

    return {
      deletedCount: idsToDelete.size,
      parentMessageId: target.parentMessageId,
    }
  })
}

// ---------------------------------------------------------------------------
// Update message parts (in-place replace)
// ---------------------------------------------------------------------------

export async function updateMessageParts(input: {
  sessionId: string
  messageId: string
  parts: unknown[]
}): Promise<boolean> {
  return withSessionLock(input.sessionId, async () => {
    const tree = await loadMessageTree(input.sessionId)
    const existing = tree.byId.get(input.messageId)
    if (!existing) return false

    const updated: StoredMessage = {
      ...existing,
      parts: input.parts,
    }
    await replaceMessageInJsonl(input.sessionId, updated)
    invalidateCache(input.sessionId)
    return true
  })
}

export async function updateMessageMetadata(input: {
  sessionId: string
  messageId: string
  metadata: Record<string, unknown>
}): Promise<Record<string, unknown> | null> {
  return withSessionLock(input.sessionId, async () => {
    const tree = await loadMessageTree(input.sessionId)
    const existing = tree.byId.get(input.messageId)
    if (!existing) return null

    const merged = {
      ...((existing.metadata as Record<string, unknown>) ?? {}),
      ...input.metadata,
    }
    const updated: StoredMessage = {
      ...existing,
      metadata: merged,
    }
    await replaceMessageInJsonl(input.sessionId, updated)
    invalidateCache(input.sessionId)
    return merged
  })
}

export async function getMessageById(input: {
  sessionId: string
  messageId: string
}): Promise<StoredMessage | null> {
  const tree = await loadMessageTree(input.sessionId)
  return tree.byId.get(input.messageId) ?? null
}

// ---------------------------------------------------------------------------
// Session JSON dual-write
// ---------------------------------------------------------------------------

export async function writeSessionJson(
  sessionId: string,
  data: Partial<SessionJson>,
): Promise<void> {
  await ensureSessionDir(sessionId)
  const filePath = await sessionJsonPath(sessionId)
  let existing: Partial<SessionJson> = {}
  try {
    const content = await fs.readFile(filePath, 'utf8')
    existing = JSON.parse(content)
  } catch {
    // 文件不存在或解析失败，使用空对象
  }
  const merged = { ...existing, ...data, id: sessionId }
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf8')
}

export async function readSessionJson(sessionId: string): Promise<SessionJson | null> {
  try {
    const content = await fs.readFile(await sessionJsonPath(sessionId), 'utf8')
    return JSON.parse(content) as SessionJson
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Message count helper
// ---------------------------------------------------------------------------

export async function getMessageCount(sessionId: string): Promise<number> {
  const tree = await loadMessageTree(sessionId)
  let count = 0
  for (const msg of tree.byId.values()) {
    if (msg.role !== 'subagent') count++
  }
  return count
}

// ---------------------------------------------------------------------------
// Load message chain for model context (replaces messageChainLoader)
// ---------------------------------------------------------------------------

export async function loadMessageChainFromFile(input: {
  sessionId: string
  leafMessageId: string
  maxMessages?: number
}): Promise<Array<{
  id: string
  role: string
  parentMessageId: string | null
  parts: unknown[]
  metadata?: unknown
  messageKind?: string
}>> {
  const maxMessages = Number.isFinite(input.maxMessages) ? input.maxMessages! : 80
  const tree = await loadMessageTree(input.sessionId)
  if (!tree.byId.has(input.leafMessageId)) return []

  const fullChain = resolveChainFromLeaf(tree, input.leafMessageId)
  const limited = fullChain.length > maxMessages
    ? fullChain.slice(fullChain.length - maxMessages)
    : fullChain

  return limited
    .filter((msg) => msg.role !== 'subagent')
    .map((msg) => ({
      id: msg.id,
      role: msg.role,
      parentMessageId: msg.parentMessageId,
      parts: msg.parts ?? [],
      metadata: msg.metadata ?? undefined,
      messageKind: msg.messageKind ?? 'normal',
    }))
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/** Delete all files for a session. */
export async function deleteSessionFiles(sessionId: string): Promise<void> {
  try {
    const dir = await resolveSessionDir(sessionId)
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // 目录不存在时忽略
  }
  invalidateCache(sessionId)
  sessionDirCache.delete(sessionId)
}

// ---------------------------------------------------------------------------
// Agent subdirectory helpers
// ---------------------------------------------------------------------------

/**
 * 为子代理注册目录路径。
 * 后续所有 chatFileStore 函数可直接使用 agentId 操作（loadMessageTree、appendMessage 等）。
 */
export async function registerAgentDir(
  parentSessionId: string,
  agentId: string,
): Promise<string> {
  const parentDir = await resolveSessionDir(parentSessionId)
  const agentDir = path.join(parentDir, 'agents', agentId)
  await fs.mkdir(agentDir, { recursive: true })
  // 复用 sessionDirCache，让后续函数透明使用
  sessionDirCache.set(agentId, agentDir)
  return agentDir
}

/** 列出 session 下所有子代理 ID（子目录名）。 */
export async function listAgentIds(sessionId: string): Promise<string[]> {
  const dir = await resolveSessionDir(sessionId)
  const agentDir = path.join(dir, 'agents')
  try {
    const entries = await fs.readdir(agentDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch (err: any) {
    if (err?.code === 'ENOENT') return []
    throw err
  }
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/** Delete all chat history files for all sessions. */
export async function deleteAllChatFiles(): Promise<void> {
  // 逻辑：查询所有 session，逐个删除对应目录
  const sessions = await prisma.chatSession.findMany({
    select: { id: true, workspaceId: true, projectId: true },
  })
  for (const session of sessions) {
    registerSessionDir(session.id, session.workspaceId, session.projectId)
    try {
      const dir = await resolveSessionDir(session.id)
      await fs.rm(dir, { recursive: true, force: true })
    } catch {
      // 忽略
    }
  }
  lruCache.clear()
  lruOrder.length = 0
  sessionDirCache.clear()
}
