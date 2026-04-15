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
import path from 'node:path'
import { resolveOpenLoafPath, resolveScopedOpenLoafPath } from '@openloaf/config'
import { prisma } from '@openloaf/db'
import { getResolvedTempStorageDir } from './appConfigService'
import {
  resolveBoardChatHistoryDir,
  resolveBoardScopedRoot,
} from '../common/boardPaths'
import { getProjectRootPath } from './vfsService'

// ---------------------------------------------------------------------------
// Shared chat-history filesystem constants
// ---------------------------------------------------------------------------

export const CHAT_HISTORY_DIR = 'chat-history'
export const MESSAGES_FILE = 'messages.jsonl'
export const LRU_MAX_SIZE = 50

const CHAT_DIR_TEMPLATE = '${CURRENT_CHAT_DIR}'
const CHAT_DIR_TEMPLATE_REGEX = /\$\{CURRENT_CHAT_DIR\}/g

/**
 * Template that resolves to the chat session root directory (not the asset subdirectory).
 * Use this to reference session-level paths like jsx/, debug/, session.json, etc.
 * Expands to the same directory as resolveSessionDir(sessionId).
 */
const CHAT_SESSION_DIR_TEMPLATE = '${CHAT_SESSION_DIR}'
const CHAT_SESSION_DIR_TEMPLATE_REGEX = /\$\{CHAT_SESSION_DIR\}/g

// ---------------------------------------------------------------------------
// Session directory cache (LRU)
// ---------------------------------------------------------------------------

const sessionDirCache = new Map<string, string>()
const sessionDirOrder: string[] = []

function touchSessionDirCache(sessionId: string) {
  const idx = sessionDirOrder.indexOf(sessionId)
  if (idx >= 0) sessionDirOrder.splice(idx, 1)
  sessionDirOrder.push(sessionId)
  while (sessionDirOrder.length > LRU_MAX_SIZE) {
    const oldest = sessionDirOrder.shift()
    if (oldest) sessionDirCache.delete(oldest)
  }
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * 按约定计算 chat session 目录（纯同步，不查 DB）。
 *
 * 三种 chat 各走各的路径：
 * - 画布右侧面板 chat（有 boardId，sessionId 独立于 boardId）：
 *     <boardRoot>/boards/<boardId>/chat-history/<sessionId>/
 * - 项目内独立 chat（有 projectId，无 boardId）：
 *     <projectRoot>/.openloaf/chat-history/<sessionId>/
 * - 全局独立 chat（都没有）：
 *     <tempStorageDir>/chat-history/<sessionId>/
 */
export function computeChatSessionDirByConvention(input: {
  sessionId: string
  projectId?: string | null
  boardId?: string | null
}): string {
  const { sessionId, projectId, boardId } = input
  if (boardId) {
    const rootPath = resolveBoardScopedRoot(projectId ?? undefined)
    return path.join(resolveBoardChatHistoryDir(rootPath, boardId), sessionId)
  }
  if (projectId) {
    const projectRoot = getProjectRootPath(projectId)
    if (projectRoot) {
      return path.join(resolveScopedOpenLoafPath(projectRoot, CHAT_HISTORY_DIR), sessionId)
    }
  }
  return path.join(getResolvedTempStorageDir(), CHAT_HISTORY_DIR, sessionId)
}

export async function resolveSessionDir(sessionId: string): Promise<string> {
  const cached = sessionDirCache.get(sessionId)
  if (cached) {
    touchSessionDirCache(sessionId)
    return cached
  }

  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { projectId: true, boardId: true },
  })
  const dir = computeChatSessionDirByConvention({
    sessionId,
    projectId: session?.projectId,
    boardId: session?.boardId,
  })

  // 防御：项目路径下 messages.jsonl 不存在时，回退到临时存储路径或旧全局路径
  // （常见于项目删除或迁移未完成等场景）。
  if (session?.projectId) {
    const tempRoot = path.join(getResolvedTempStorageDir(), CHAT_HISTORY_DIR)
    const legacyRoot = resolveOpenLoafPath(CHAT_HISTORY_DIR)
    const candidates = [
      path.join(tempRoot, sessionId),
      path.join(legacyRoot, sessionId),
    ].filter((d) => d !== dir)
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
          } catch {
            /* continue */
          }
        }
      }
    }
  }

  sessionDirCache.set(sessionId, dir)
  touchSessionDirCache(sessionId)
  return dir
}

/** 注册 session 目录（写入时已知 projectId/boardId）。 */
export async function registerSessionDir(
  sessionId: string,
  projectId?: string | null,
  boardId?: string | null,
): Promise<void> {
  const dir = computeChatSessionDirByConvention({ sessionId, projectId, boardId })
  sessionDirCache.set(sessionId, dir)
  touchSessionDirCache(sessionId)
}

/** 解析 session 的 asset 目录：<sessionDir>/asset/（若不存在则创建）。 */
export async function resolveSessionAssetDir(sessionId: string): Promise<string> {
  const sessionDir = await resolveSessionDir(sessionId)
  const assetDir = path.join(sessionDir, 'asset')
  await fs.mkdir(assetDir, { recursive: true })
  return assetDir
}

/**
 * 解析 session 的文件存储子目录：<sessionDir>/asset/
 * 兼容旧数据：如果 asset/ 不存在但 root/ 或 files/ 存在，回退到旧目录。
 */
export async function resolveSessionFilesDir(sessionId: string): Promise<string> {
  const sessionDir = await resolveSessionDir(sessionId)
  const assetDir = path.join(sessionDir, 'asset')
  const legacyRootDir = path.join(sessionDir, 'root')
  const legacyFilesDir = path.join(sessionDir, 'files')

  try {
    await fs.access(assetDir)
    return assetDir
  } catch {}
  try {
    await fs.access(legacyRootDir)
    return legacyRootDir
  } catch {}
  try {
    await fs.access(legacyFilesDir)
    return legacyFilesDir
  } catch {}

  await fs.mkdir(assetDir, { recursive: true })
  return assetDir
}

/** 清除 session 目录缓存。 */
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

/**
 * 为子代理注册目录路径：<parentDir>/agents/<agentId>/
 * 后续用 agentId 即可复用所有 chatFileStore 函数。
 */
export async function registerAgentDir(
  parentSessionId: string,
  agentId: string,
): Promise<string> {
  const parentDir = await resolveSessionDir(parentSessionId)
  const agentDir = path.join(parentDir, 'agents', agentId)
  await fs.mkdir(agentDir, { recursive: true })
  sessionDirCache.set(agentId, agentDir)
  touchSessionDirCache(agentId)
  return agentDir
}

// ---------------------------------------------------------------------------
// ${CURRENT_CHAT_DIR} template expansion — single source of truth
// ---------------------------------------------------------------------------

/**
 * 展开路径中的 `${CURRENT_CHAT_DIR}` 模板为绝对路径。
 *
 * 语义：`${CURRENT_CHAT_DIR}` 指向当前 session 的 asset 目录，即
 *   <sessionDir>/asset/
 *
 * 调用者传入的 path 不包含模板时原样返回；sessionId 缺失时也原样返回，
 * 由下游 resolver 再决定如何处理（通常会报错并返回清晰的信息）。
 */
export async function expandChatDirTemplate(
  inputPath: string,
  sessionId: string | undefined,
): Promise<string> {
  const hasChatDir = inputPath.includes(CHAT_DIR_TEMPLATE)
  const hasSessionDir = inputPath.includes(CHAT_SESSION_DIR_TEMPLATE)
  if (!hasChatDir && !hasSessionDir) return inputPath
  if (!sessionId) return inputPath
  const sessionDir = await resolveSessionDir(sessionId)
  let result = inputPath
  if (hasSessionDir) {
    result = result.replace(CHAT_SESSION_DIR_TEMPLATE_REGEX, sessionDir)
  }
  if (result.includes(CHAT_DIR_TEMPLATE)) {
    const assetDir = path.resolve(sessionDir, 'asset')
    result = result.replace(CHAT_DIR_TEMPLATE_REGEX, assetDir)
  }
  return result
}

// ---------------------------------------------------------------------------
// Internal accessors for sibling modules
// ---------------------------------------------------------------------------

/** @internal — used by chatFileStore.deleteSessionFiles to evict cached dirs. */
export function _getSessionDirCache() {
  return { sessionDirCache, sessionDirOrder, touchSessionDirCache }
}
