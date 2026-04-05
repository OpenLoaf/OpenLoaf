/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { prisma } from '@openloaf/db'
import type { MessageTreeIndex, SiblingNavEntry, StoredMessage } from './chatFileStore'
import {
  buildSiblingNavForChain,
  collectSubtreeIds,
  loadMessageTree,
  resolveChainFromLeaf,
} from './chatMessageTreeIndex'

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

// ---------------------------------------------------------------------------
// Renderable leaf resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Strip tool outputs
// ---------------------------------------------------------------------------

// 逻辑：仅保留交互类工具 output，避免刷新后丢失等待用户输入的状态。
const KEEP_OUTPUT_TOOLS = new Set(['AskUserQuestion'])

/** Strip tool output payloads from parts. */
function stripToolOutputs(parts: unknown[]): unknown[] {
  return parts.map((part: any) => {
    const type = typeof part?.type === 'string' ? part.type : ''
    if (!type.startsWith('tool-')) return part
    const toolName =
      typeof part?.toolName === 'string' ? part.toolName : type.slice('tool-'.length)
    if (KEEP_OUTPUT_TOOLS.has(toolName)) return part
    const { output, ...rest } = part ?? {}
    return rest
  })
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
}): Promise<
  Array<{
    id: string
    role: string
    parentMessageId: string | null
    parts: unknown[]
    metadata?: unknown
    messageKind?: string
    createdAt?: string
  }>
> {
  const maxMessages = Number.isFinite(input.maxMessages) ? input.maxMessages! : 80
  const tree = await loadMessageTree(input.sessionId)
  if (!tree.byId.has(input.leafMessageId)) return []

  const fullChain = resolveChainFromLeaf(tree, input.leafMessageId)
  const limited =
    fullChain.length > maxMessages ? fullChain.slice(fullChain.length - maxMessages) : fullChain

  return limited
    .filter((msg) => msg.role !== 'subagent')
    .map((msg) => ({
      ...normalizeTaskReportForModel({
        id: msg.id,
        role: msg.role,
        parentMessageId: msg.parentMessageId,
        parts: msg.parts ?? [],
        metadata: msg.metadata ?? undefined,
        messageKind: msg.messageKind ?? 'normal',
      }),
      createdAt: msg.createdAt,
    }))
}
