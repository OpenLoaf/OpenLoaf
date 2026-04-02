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
import { resolveOpenLoafPath, resolveScopedOpenLoafPath } from '@openloaf/config'
import { getResolvedTempStorageDir } from '@openloaf/api/services/appConfigService'
import {
  lookupBoardRecord,
  resolveBoardAbsPath,
  resolveBoardScopedRoot,
  resolveBoardRootPath,
} from '@openloaf/api/common/boardPaths'
import {
  getProjectRootPath,
} from '@openloaf/api/services/vfsService'
import { prisma } from '@openloaf/db'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoredMessage = {
  id: string
  parentMessageId: string | null
  role: 'user' | 'assistant' | 'system' | 'subagent' | 'task-report'
  messageKind: 'normal' | 'error' | 'compact_prompt' | 'compact_summary'
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
// Path helpers — 根据 session 的 projectId 解析到对应根目录
// ---------------------------------------------------------------------------

// 逻辑：缓存 sessionId → 目录路径，避免每次都查数据库（LRU 淘汰）
const sessionDirCache = new Map<string, string>()
const sessionDirOrder: string[] = []

function touchSessionDirCache(sessionId: string) {
  const idx = sessionDirOrder.indexOf(sessionId)
  if (idx >= 0) sessionDirOrder.splice(idx, 1)
  sessionDirOrder.push(sessionId)
  // 淘汰超出上限的缓存
  while (sessionDirOrder.length > LRU_MAX_SIZE) {
    const oldest = sessionDirOrder.shift()
    if (oldest) sessionDirCache.delete(oldest)
  }
}

/**
 * 解析 session 的 chat-history 根目录：
 * - 有 boardId → 从 DB 查询画布 folderUri，解析画布目录（sessionId 拼接在后）
 * - 有 projectId → <projectRoot>/.openloaf/chat-history/
 * - 都没有 → <tempStorageDir>/chat-history/ (fallback)
 */
async function resolveChatHistoryRoot(
  projectId?: string | null,
  boardId?: string | null,
): Promise<string> {
  // 画布内聊天：从 DB 查询 folderUri，chat 文件直接存在画布目录下
  // sessionId === boardId，resolveSessionDir 会拼接 sessionId
  if (boardId) {
    const board = await lookupBoardRecord(boardId)
    const rootPath = board
      ? resolveBoardRootPath(board)
      : resolveBoardScopedRoot(projectId ?? undefined)
    if (board) {
      // 去掉 folderUri 末尾的 boardId 目录，返回 boards/ 基目录
      // 因为后续 resolveSessionDir 会 path.join(root, sessionId) 把 boardId 拼回去
      const folderName = board.folderUri.replace(/\/+$/u, "").split("/").filter(Boolean)
      folderName.pop()
      return path.join(rootPath, ...folderName)
    }
    // fallback: 画布不在 DB 中
    return path.join(rootPath, "boards")
  }
  if (projectId) {
    const projectRoot = getProjectRootPath(projectId)
    if (projectRoot) {
      return resolveScopedOpenLoafPath(projectRoot, CHAT_HISTORY_DIR)
    }
  }
  return path.join(getResolvedTempStorageDir(), CHAT_HISTORY_DIR)
}

export async function resolveSessionDir(sessionId: string): Promise<string> {
  const cached = sessionDirCache.get(sessionId)
  if (cached) {
    touchSessionDirCache(sessionId)
    return cached
  }

  // 从数据库查 session 的 projectId/boardId
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { projectId: true, boardId: true },
  })
  const root = await resolveChatHistoryRoot(session?.projectId, session?.boardId)
  const dir = path.join(root, sessionId)

  // 防御：项目路径下 messages.jsonl 不存在时，回退到临时存储路径或旧全局路径
  // （常见于项目删除或迁移未完成等场景）。
  if (session?.projectId) {
    const tempRoot = path.join(getResolvedTempStorageDir(), CHAT_HISTORY_DIR)
    const legacyRoot = resolveOpenLoafPath(CHAT_HISTORY_DIR)
    const candidates = [
      path.join(tempRoot, sessionId),
      path.join(legacyRoot, sessionId),
    ].filter(d => d !== dir)
    if (candidates.length > 0) {
      try {
        await fs.stat(path.join(dir, MESSAGES_FILE))
      } catch {
        for (const candidate of candidates) {
          try {
            await fs.stat(path.join(candidate, MESSAGES_FILE))
            sessionDirCache.set(sessionId, candidate)
            touchSessionDirCache(sessionId)
            return candidate
          } catch { /* continue */ }
        }
      }
    }
  }

  sessionDirCache.set(sessionId, dir)
  touchSessionDirCache(sessionId)
  return dir
}

/** 注册 session 目录（写入时已知 projectId/boardId） */
export async function registerSessionDir(
  sessionId: string,
  projectId?: string | null,
  boardId?: string | null,
): Promise<void> {
  const root = await resolveChatHistoryRoot(projectId, boardId)
  sessionDirCache.set(sessionId, path.join(root, sessionId))
  touchSessionDirCache(sessionId)
}

/**
 * 解析 session 的 asset 目录：<sessionDir>/asset/
 * 用于 AI 工具在全局对话中的默认工作目录。
 */
export async function resolveSessionAssetDir(sessionId: string): Promise<string> {
  const sessionDir = await resolveSessionDir(sessionId)
  const assetDir = path.join(sessionDir, 'asset')
  await fs.mkdir(assetDir, { recursive: true })
  return assetDir
}

/**
 * 解析 session 的文件存储子目录：<sessionDir>/asset/
 * 用于存储用户拖拽上传的任意类型文件和 AI 生成的文件（统一到 asset/）。
 * 兼容旧数据：如果 asset/ 不存在但 root/ 或 files/ 存在，回退到旧目录。
 */
export async function resolveSessionFilesDir(sessionId: string): Promise<string> {
  const sessionDir = await resolveSessionDir(sessionId)
  const assetDir = path.join(sessionDir, 'asset')
  const legacyRootDir = path.join(sessionDir, 'root')
  const legacyFilesDir = path.join(sessionDir, 'files')

  // 优先使用 asset/（新标准），回退 root/ → files/（兼容旧数据）
  try { await fs.access(assetDir); return assetDir } catch {}
  try { await fs.access(legacyRootDir); return legacyRootDir } catch {}
  try { await fs.access(legacyFilesDir); return legacyFilesDir } catch {}

  // 都不存在，创建 asset/
  await fs.mkdir(assetDir, { recursive: true })
  return assetDir
}

/** 清除 session 目录缓存 */
export function clearSessionDirCache(sessionId?: string): void {
  if (sessionId) {
    sessionDirCache.delete(sessionId)
    const idx = sessionDirOrder.indexOf(sessionId)
    if (idx >= 0) sessionDirOrder.splice(idx, 1)
  } else {
    sessionDirCache.clear()
    sessionDirOrder.length = 0
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

/**
 * Atomically resolve the rightmost leaf and append a message as its child.
 * loadMessageTree + resolveRightmostLeaf + appendJsonlLine are all inside
 * the same session lock, eliminating the race window that causes sibling branches.
 */
export async function appendMessageAtLeaf(input: {
  sessionId: string
  buildMessage: (parentMessageId: string | null) => StoredMessage
}): Promise<StoredMessage> {
  return withSessionLock(input.sessionId, async () => {
    const tree = await loadMessageTree(input.sessionId)
    const parentId = resolveRightmostLeaf(tree)
    const message = input.buildMessage(parentId)
    await appendJsonlLine(input.sessionId, message)
    invalidateCache(input.sessionId)
    return message
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
  if (msg.role === 'user' || msg.role === 'task-report') return true
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

// 逻辑：仅保留交互类工具 output，避免刷新后丢失等待用户输入的状态。
const KEEP_OUTPUT_TOOLS = new Set(['AskUserQuestion'])

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
  const result = await withSessionLock(input.sessionId, async () => {
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

  // 同步更新 messageCount（DB + session.json）
  if (result.deletedCount > 0) {
    try {
      const newCount = await getMessageCount(input.sessionId)
      await prisma.chatSession.update({
        where: { id: input.sessionId },
        data: { messageCount: newCount },
      })
      await writeSessionJson(input.sessionId, { messageCount: newCount })
    } catch {
      // messageCount 同步为非关键操作，不阻断删除结果
    }
  }

  return result
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
  return withSessionLock(sessionId, async () => {
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
  })
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
    if (msg.role === 'subagent' || msg.role === 'task-report') continue
    if (msg.messageKind === 'compact_prompt') continue
    count++
  }
  return count
}

// ---------------------------------------------------------------------------
// task-report → assistant 映射（仅供 LLM model context 使用）
// ---------------------------------------------------------------------------

type NormalizableMessage = {
  id: string
  role: string
  parentMessageId: string | null
  parts: unknown[]
  metadata?: unknown
  messageKind?: string
}

/**
 * 将 task-report 消息转换为 assistant 消息，使 LLM 能正常处理。
 * 仅用于构建发送给模型的上下文链（loadMessageChainFromFile），
 * 不影响前端 UI 渲染（getChatViewFromFile 返回原始 role）。
 *
 * task-ref part 格式化为纯文本，其他 part 保留。
 */
export function normalizeTaskReportForModel(msg: NormalizableMessage): NormalizableMessage {
  if (msg.role !== 'task-report') return msg

  const normalizedParts: unknown[] = []
  for (const part of msg.parts) {
    const p = part as Record<string, unknown> | null
    if (p?.type === 'task-ref') {
      normalizedParts.push({
        type: 'text',
        text: `[任务报告: ${String(p.title ?? '未知任务')} — 状态: ${String(p.status ?? 'unknown')}]`,
      })
    } else {
      normalizedParts.push(part)
    }
  }

  return {
    ...msg,
    role: 'assistant',
    parts: normalizedParts,
  }
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
    .map((msg) => normalizeTaskReportForModel({
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
  const idx = sessionDirOrder.indexOf(sessionId)
  if (idx >= 0) sessionDirOrder.splice(idx, 1)
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
  touchSessionDirCache(agentId)
  return agentDir
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/**
 * Migrate the entire session directory from global path to a project-scoped path.
 * Called when ensureTempProject() binds a session to a newly created project,
 * so that all files (messages.jsonl, session.json, root/, files/, agents/, etc.)
 * written before the project existed are not orphaned.
 */
export async function migrateSessionDirToProject(
  sessionId: string,
  projectId: string,
): Promise<void> {
  // 1. 全局路径（无 projectId 时的默认路径）
  const globalRoot = resolveOpenLoafPath(CHAT_HISTORY_DIR)
  const globalDir = path.join(globalRoot, sessionId)

  // 2. 目标项目路径
  const projectRoot = getProjectRootPath(projectId)
  if (!projectRoot) return
  const targetRoot = resolveScopedOpenLoafPath(projectRoot, CHAT_HISTORY_DIR)
  const targetDir = path.join(targetRoot, sessionId)

  // 3. 路径相同则跳过
  if (globalDir === targetDir) return

  // 4. 全局目录不存在则跳过
  try {
    await fs.stat(globalDir)
  } catch {
    return
  }

  // 5. 目标目录不存在 → 直接 rename 整个目录（最高效）
  await fs.mkdir(targetRoot, { recursive: true })
  try {
    await fs.stat(targetDir)
  } catch {
    // 目标不存在，直接移动整个目录
    await fs.rename(globalDir, targetDir)
    sessionDirCache.set(sessionId, targetDir)
    touchSessionDirCache(sessionId)
    invalidateCache(sessionId)
    logger.info(
      { sessionId, from: globalDir, to: targetDir },
      '[chat-file-store] migrated session dir to project scope (rename)',
    )
    return
  }

  // 6. 目标目录已存在 → 逐个合并文件
  const entries = await fs.readdir(globalDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(globalDir, entry.name)
    const dstPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      // 子目录：目标不存在则直接移动，已存在则跳过（保留目标）
      try {
        await fs.stat(dstPath)
      } catch {
        await fs.rename(srcPath, dstPath)
      }
    } else if (entry.name === MESSAGES_FILE) {
      // messages.jsonl：去重合并
      const globalContent = await fs.readFile(srcPath, 'utf8')
      if (globalContent.trim()) {
        // 读取目标文件已有消息的 ID 集合
        const existingIds = new Set<string>()
        try {
          const dstContent = await fs.readFile(dstPath, 'utf8')
          for (const line of dstContent.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const msg = JSON.parse(trimmed)
              if (msg.id) existingIds.add(msg.id)
            } catch { /* skip malformed lines */ }
          }
        } catch { /* dst file doesn't exist yet */ }

        // 只追加不存在的消息
        const newLines: string[] = []
        for (const line of globalContent.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const msg = JSON.parse(trimmed)
            if (msg.id && !existingIds.has(msg.id)) {
              newLines.push(trimmed)
            }
          } catch {
            newLines.push(trimmed) // 保留无法解析的行
          }
        }
        if (newLines.length > 0) {
          await fs.appendFile(dstPath, newLines.map(l => `${l}\n`).join(''))
        }
      }
      await fs.unlink(srcPath)
    } else {
      // 其他文件（session.json 等）：目标不存在则移动
      try {
        await fs.stat(dstPath)
        await fs.unlink(srcPath) // 目标已有，删除源文件
      } catch {
        await fs.rename(srcPath, dstPath)
      }
    }
  }

  // 7. 清理空的全局目录
  try {
    await fs.rmdir(globalDir)
  } catch { /* 目录非空则忽略 */ }

  // 8. 更新缓存
  sessionDirCache.set(sessionId, targetDir)
  touchSessionDirCache(sessionId)
  invalidateCache(sessionId)

  logger.info(
    { sessionId, from: globalDir, to: targetDir },
    '[chat-file-store] migrated session dir to project scope (merge)',
  )
}

/** Delete all chat history files for all sessions. */
export async function deleteAllChatFiles(): Promise<void> {
  // 逻辑：查询所有 session，逐个删除对应目录
  const sessions = await prisma.chatSession.findMany({
    select: { id: true, projectId: true, boardId: true },
  })
  for (const session of sessions) {
    await registerSessionDir(session.id, session.projectId, session.boardId)
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
  sessionDirOrder.length = 0
}
