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
import { getResolvedTempStorageDir } from '@openloaf/api/services/appConfigService'
import {
  resolveBoardChatHistoryDir,
  resolveBoardScopedRoot,
} from '@openloaf/api/common/boardPaths'
import { getProjectRootPath } from '@openloaf/api/services/vfsService'
import { prisma } from '@openloaf/db'
import { CHAT_HISTORY_DIR, LRU_MAX_SIZE, MESSAGES_FILE } from './chatFileStore'

// ---------------------------------------------------------------------------
// Session directory cache (LRU)
// ---------------------------------------------------------------------------

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
 *
 * 同一套规则被 async `resolveSessionDir` 和同步 `expandPathTemplateVars`
 * 复用，避免两侧路径漂移。
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

  // 从数据库查 session 的 projectId/boardId
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

/** 注册 session 目录（写入时已知 projectId/boardId） */
export async function registerSessionDir(
  sessionId: string,
  projectId?: string | null,
  boardId?: string | null,
): Promise<void> {
  const dir = computeChatSessionDirByConvention({ sessionId, projectId, boardId })
  sessionDirCache.set(sessionId, dir)
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
// Internal accessors for sibling modules
// ---------------------------------------------------------------------------

/** @internal — used by chatFileStore.ts for deleteSessionFiles */
export function _getSessionDirCache() {
  return { sessionDirCache, sessionDirOrder, touchSessionDirCache }
}
