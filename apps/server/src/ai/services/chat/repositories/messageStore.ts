import { generateId } from 'ai'
import { prisma } from '@tenas-ai/db'
import type { ChatMessageKind, TenasUIMessage } from '@tenas-ai/api'
import { replaceFileTokensWithNames } from '@/common/chatTitle'
import { getBoardId, getProjectId, getWorkspaceId } from '@/ai/shared/context/requestContext'
import { toNumberOrUndefined, isRecord } from '@/ai/shared/util'
import {
  appendMessage,
  updateMessage,
  loadMessageTree,
  resolveRightmostLeaf,
  registerSessionDir,
  writeSessionJson,
  type StoredMessage,
} from './chatFileStore'

/** Max session title length. */
const MAX_SESSION_TITLE_CHARS = 16
/** Initial title word limit for spaced text. */
const INITIAL_TITLE_WORD_LIMIT = 10
/** Initial title character limit for no-space text. */
const INITIAL_TITLE_CHAR_LIMIT = 10
/** Metadata keys that should never be persisted. */
const FORBIDDEN_METADATA_KEYS = ['id', 'sessionId', 'parentMessageId', 'path'] as const

/** Normalize message kind from unknown input. */
function normalizeMessageKind(value: unknown): ChatMessageKind | null {
  if (value == null) return null
  if (value === 'compact_prompt' || value === 'compact_summary') return value
  return 'normal'
}

/** Input for saving a chat message. */
type SaveMessageInput = {
  sessionId: string
  message: TenasUIMessage | UIMessageLike
  parentMessageId: string | null
  pathOverride?: string
  workspaceId?: string
  projectId?: string
  boardId?: string
  allowEmpty?: boolean
  createdAt?: Date
}

/** Result for saving a chat message. */
type SaveMessageResult = {
  id: string
  parentMessageId: string | null
  path: string
}

/** Resolve rightmost leaf id for a session. */
export async function resolveRightmostLeafId(sessionId: string): Promise<string | null> {
  const tree = await loadMessageTree(sessionId)
  return resolveRightmostLeaf(tree)
}

/** Ensure session preface text exists for the chat session. */
export async function ensureSessionPreface(input: {
  sessionId: string
  text: string
  createdAt?: Date
  workspaceId?: string
  projectId?: string
  boardId?: string
}): Promise<void> {
  const text = String(input.text ?? '').trim()
  if (!text) return

  await ensureSession(input.sessionId, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    boardId: input.boardId,
  })
  const existing = await prisma.chatSession.findUnique({
    where: { id: input.sessionId },
    select: { sessionPreface: true },
  })
  if ((existing?.sessionPreface ?? '') === text) return
  await prisma.chatSession.update({
    where: { id: input.sessionId },
    data: { sessionPreface: text },
  })
}

/** Save a compaction prompt message (user) for context trimming. */
export async function saveCompactPromptMessage(input: {
  sessionId: string
  parentMessageId: string | null
  text: string
  createdAt?: Date
}): Promise<SaveMessageResult> {
  const message: TenasUIMessage = {
    id: generateId(),
    role: 'user',
    parentMessageId: input.parentMessageId,
    messageKind: 'compact_prompt',
    parts: [{ type: 'text', text: input.text }],
  }
  return saveMessage({
    sessionId: input.sessionId,
    message,
    parentMessageId: input.parentMessageId,
    createdAt: input.createdAt,
  })
}

/** Save a compaction summary message (assistant) for context trimming. */
export async function saveCompactSummaryMessage(input: {
  sessionId: string
  parentMessageId: string | null
  text: string
  createdAt?: Date
}): Promise<SaveMessageResult> {
  const message: TenasUIMessage = {
    id: generateId(),
    role: 'assistant',
    parentMessageId: input.parentMessageId,
    messageKind: 'compact_summary',
    parts: [{ type: 'text', text: input.text }],
  }
  return saveMessage({
    sessionId: input.sessionId,
    message,
    parentMessageId: input.parentMessageId,
    createdAt: input.createdAt,
  })
}

/** Set the latest error message for a chat session. */
export async function setSessionErrorMessage(input: {
  sessionId: string
  errorMessage: string
}): Promise<void> {
  const trimmed = input.errorMessage.trim()
  if (!trimmed) return
  await prisma.chatSession.updateMany({
    where: { id: input.sessionId },
    data: { errorMessage: trimmed },
  })
}

/** Clear the error message for a chat session. */
export async function clearSessionErrorMessage(input: {
  sessionId: string
}): Promise<void> {
  await prisma.chatSession.updateMany({
    where: { id: input.sessionId },
    data: { errorMessage: null },
  })
}

/** Resolve stored session preface text for a chat session. */
export async function resolveSessionPrefaceText(sessionId: string): Promise<string> {
  const row = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { sessionPreface: true },
  })
  return typeof row?.sessionPreface === 'string' ? row.sessionPreface : ''
}

/** Save a chat message node — now writes to JSONL via chatFileStore. */
export async function saveMessage(input: SaveMessageInput): Promise<SaveMessageResult> {
  const messageId = String((input.message as any)?.id ?? '').trim()
  if (!messageId) throw new Error('message.id is required.')

  const messageKind = normalizeMessageKind((input.message as any)?.messageKind)
  const role = normalizeRole((input.message as any)?.role)
  const parts = normalizeParts((input.message as any)?.parts)
  const metadata = sanitizeMetadata((input.message as any)?.metadata)
  const title =
    role === 'user' && messageKind !== 'compact_prompt'
      ? normalizeTitle(extractTitleTextFromParts(parts))
      : ''
  const workspaceId = normalizeOptionalId(input.workspaceId) ?? getWorkspaceId()
  const projectId = normalizeOptionalId(input.projectId) ?? getProjectId()
  const boardId = normalizeOptionalId(input.boardId) ?? getBoardId()

  const allowEmpty = Boolean(input.allowEmpty)
  if (!allowEmpty && role !== 'user' && parts.length === 0) {
    return { id: messageId, parentMessageId: input.parentMessageId, path: '' }
  }

  // 逻辑：提前注册 session 目录路径，避免后续文件操作时查 DB
  registerSessionDir(input.sessionId, workspaceId, projectId)

  // 确保 session 存在
  await ensureSession(input.sessionId, {
    title: title || undefined,
    workspaceId,
    projectId,
    boardId,
  })
  if (title) {
    await prisma.chatSession.updateMany({
      where: { id: input.sessionId, isUserRename: false, title: '新对话' },
      data: { title },
    })
    // 逻辑：title 更新后，ensureSession 已写过完整 session.json，这里只需补写 title
    try {
      await writeSessionJson(input.sessionId, { title })
    } catch {
      // 非关键操作
    }
  }

  // 检查是否已存在（last-write-wins 更新）
  const tree = await loadMessageTree(input.sessionId)
  const existing = tree.byId.get(messageId)

  if (existing) {
    // assistant/system 续跑时更新 parts/metadata
    if (role !== 'user') {
      const mergedMetadata = mergeMetadataWithAccumulatedUsage(
        existing.metadata as any,
        metadata,
      )
      const updated: StoredMessage = {
        ...existing,
        ...(parts.length ? { parts: parts as any } : {}),
        ...(mergedMetadata ? { metadata: mergedMetadata as any } : {}),
        ...(messageKind ? { messageKind } : {}),
        updatedAt: new Date().toISOString(),
      }
      await updateMessage({ sessionId: input.sessionId, message: updated })
    }
    return {
      id: existing.id,
      parentMessageId: existing.parentMessageId ?? null,
      path: '',
    }
  }

  // 新消息
  const parentId = input.parentMessageId ?? null
  const now = input.createdAt ?? new Date()
  const stored: StoredMessage = {
    id: messageId,
    parentMessageId: parentId,
    role,
    messageKind: messageKind ?? 'normal',
    parts: parts as any,
    metadata: (metadata as any) ?? undefined,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  await appendMessage({ sessionId: input.sessionId, message: stored })

  // 更新 messageCount 并同步到 session.json
  try {
    const updated = await prisma.chatSession.update({
      where: { id: input.sessionId },
      data: { messageCount: { increment: 1 } },
    })
    await writeSessionJson(input.sessionId, { messageCount: updated.messageCount })
  } catch {
    // 非关键操作，忽略错误
  }

  return {
    id: messageId,
    parentMessageId: parentId,
    path: '',
  }
}

/** Append a part to an existing message by id. */
export async function appendMessagePart(input: {
  sessionId: string
  messageId: string
  part: unknown
}): Promise<boolean> {
  const tree = await loadMessageTree(input.sessionId)
  const existing = tree.byId.get(input.messageId)
  if (!existing) return false
  const parts = Array.isArray(existing.parts) ? [...existing.parts] : []
  parts.push(input.part as any)
  const updated: StoredMessage = {
    ...existing,
    parts: parts as any,
    updatedAt: new Date().toISOString(),
  }
  await updateMessage({ sessionId: input.sessionId, message: updated })
  return true
}

/** Normalize message role. */
function normalizeRole(role: unknown): 'user' | 'assistant' | 'system' | 'subagent' {
  if (role === 'assistant' || role === 'system' || role === 'user' || role === 'subagent') {
    return role
  }
  return 'user'
}

/** Filter message parts for persistence. */
function normalizeParts(parts: unknown): unknown[] {
  const arr = Array.isArray(parts) ? parts : []
  return arr.filter((part) => {
    if (!part || typeof part !== 'object') return true
    const record = part as any
    if (record.type === 'step-start') return false
    if (record.state === 'streaming') return false
    return true
  })
}

/** Sanitize metadata fields before persistence. */
function sanitizeMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = metadata as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if ((FORBIDDEN_METADATA_KEYS as readonly string[]).includes(key)) continue
    next[key] = value
  }
  return Object.keys(next).length ? next : null
}

/** Merge usage fields by summing values. */
function mergeTotalUsage(prev: unknown, next: unknown): unknown | undefined {
  const prevUsage = isRecord(prev) ? prev : undefined
  const nextUsage = isRecord(next) ? next : undefined
  if (!prevUsage && !nextUsage) return undefined

  const keys = [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'reasoningTokens',
    'cachedInputTokens',
  ] as const

  const out: Record<string, number> = {}
  for (const key of keys) {
    const a = toNumberOrUndefined(prevUsage?.[key])
    const b = toNumberOrUndefined(nextUsage?.[key])
    if (a == null && b == null) continue
    out[key] = (a ?? 0) + (b ?? 0)
  }
  return Object.keys(out).length ? out : undefined
}

/** Merge metadata while accumulating usage and timing. */
function mergeMetadataWithAccumulatedUsage(
  prev: unknown,
  next: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!next) return null
  const prevRecord = isRecord(prev) ? prev : {}

  const merged: Record<string, unknown> = { ...prevRecord, ...next }

  const prevTotal = isRecord(prevRecord.totalUsage) ? prevRecord.totalUsage : undefined
  const nextTotal = isRecord(next.totalUsage) ? next.totalUsage : undefined
  const combinedTotal = mergeTotalUsage(prevTotal, nextTotal)
  if (combinedTotal) merged.totalUsage = combinedTotal
  else if ('totalUsage' in merged) delete merged.totalUsage

  const prevTenas = isRecord(prevRecord.tenas) ? prevRecord.tenas : undefined
  const nextTenas = isRecord(next.tenas) ? next.tenas : undefined
  if (prevTenas || nextTenas) {
    const mergedTenas: Record<string, unknown> = {
      ...(prevTenas ?? {}),
      ...(nextTenas ?? {}),
    }
    const prevElapsed = toNumberOrUndefined(prevTenas?.assistantElapsedMs)
    const nextElapsed = toNumberOrUndefined(nextTenas?.assistantElapsedMs)
    if (prevElapsed != null || nextElapsed != null) {
      mergedTenas.assistantElapsedMs = (prevElapsed ?? 0) + (nextElapsed ?? 0)
    } else {
      delete mergedTenas.assistantElapsedMs
    }
    merged.tenas = Object.keys(mergedTenas).length ? mergedTenas : undefined
  }

  return Object.keys(merged).length ? merged : null
}

/** Extract title text from message parts. */
function extractTitleTextFromParts(parts: unknown[]): string {
  const chunks: string[] = []
  for (const part of parts as any[]) {
    if (!part || typeof part !== 'object') continue
    if (part.type === 'text' && typeof part.text === 'string') {
      chunks.push(replaceFileTokensWithNames(part.text))
    } else if (typeof part.text === 'string') {
      chunks.push(replaceFileTokensWithNames(part.text))
    }
  }
  const raw = chunks.join('\n').trim()
  return trimTitleByWordsOrChars(raw)
}

/** Trim title to the first N words (whitespace) or N characters. */
function trimTitleByWordsOrChars(input: string): string {
  const normalized = input.replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.includes(' ')) {
    const words = normalized.split(/\s+/gu).filter(Boolean)
    return words.slice(0, INITIAL_TITLE_WORD_LIMIT).join(' ')
  }
  return Array.from(normalized).slice(0, INITIAL_TITLE_CHAR_LIMIT).join('')
}

/** Normalize session title. */
function normalizeTitle(raw: string): string {
  let title = (raw ?? '').trim()
  title = title.replace(/^["'""''《》]+/, '').replace(/["'""''《》]+$/, '')
  title = title.split('\n')[0]?.trim() ?? ''
  if (title.length > MAX_SESSION_TITLE_CHARS) title = title.slice(0, MAX_SESSION_TITLE_CHARS)
  return title.trim()
}

/** Normalize session title input. */
export function normalizeSessionTitle(raw: string): string {
  return normalizeTitle(raw)
}

/** Update chat session title. */
export async function updateSessionTitle(input: {
  sessionId: string
  title: string
  isUserRename?: boolean
}): Promise<boolean> {
  const normalized = normalizeTitle(input.title)
  if (!normalized) return false
  const result = await prisma.chatSession.updateMany({
    where: { id: input.sessionId },
    data: {
      title: normalized,
      ...(typeof input.isUserRename === 'boolean' ? { isUserRename: input.isUserRename } : {}),
    },
  })
  return result.count > 0
}

/** Normalize optional id. */
function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** Ensure chat session exists. */
async function ensureSession(
  sessionId: string,
  input: {
    title?: string
    workspaceId?: string
    projectId?: string
    boardId?: string
  },
) {
  const workspaceId = normalizeOptionalId(input.workspaceId)
  const projectId = normalizeOptionalId(input.projectId)
  const boardId = normalizeOptionalId(input.boardId)
  await prisma.chatSession.upsert({
    where: { id: sessionId },
    update: {
      ...(workspaceId ? { workspaceId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(boardId ? { boardId } : {}),
    },
    create: {
      id: sessionId,
      ...(input.title ? { title: input.title } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(boardId ? { boardId } : {}),
    },
  })

  // 逻辑：session.json 双写，从数据库读取完整字段写入
  try {
    const full = await prisma.chatSession.findUnique({ where: { id: sessionId } })
    if (full) {
      await writeSessionJson(sessionId, {
        id: full.id,
        title: full.title,
        isUserRename: full.isUserRename,
        isPin: full.isPin,
        errorMessage: full.errorMessage,
        sessionPreface: full.sessionPreface,
        workspaceId: full.workspaceId,
        projectId: full.projectId,
        boardId: full.boardId,
        cliId: full.cliId,
        createdAt: full.createdAt.toISOString(),
        updatedAt: full.updatedAt.toISOString(),
        deletedAt: full.deletedAt?.toISOString() ?? null,
        messageCount: full.messageCount,
      })
    }
  } catch {
    // 非关键操作，忽略错误
  }
}

/** Minimal message shape for persistence. */
type UIMessageLike = {
  id: string
  role: 'system' | 'user' | 'assistant' | 'subagent'
  parts?: unknown[]
  metadata?: unknown
}
