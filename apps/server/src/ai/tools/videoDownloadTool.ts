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
import { tool, zodSchema } from 'ai'
import { videoDownloadToolDef } from '@openloaf/api/types/tools/videoDownload'
import {
  lookupBoardRecord,
  resolveBoardAssetDir,
  resolveBoardScopedRoot,
} from '@openloaf/api/common/boardPaths'
import {
  getAbortSignal,
  getBoardId,
  getProjectId,
  getSessionId,
} from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@/ai/services/chat/repositories/chatFileStore'
import { logger } from '@/common/logger'
import {
  cancelDownloadTask,
  getTaskStatus,
  startDownload,
  type VideoDownloadTask,
} from '@/modules/media/videoDownloadService'

const POLL_INTERVAL_MS = 1_000

type VideoStorageTarget = {
  /** Root path used to build relative file paths for follow-up tools (board only). */
  rootPath: string
  /** Directory where the video file should be saved. */
  saveDirPath: string
  /** Logical destination label returned to the AI. */
  destination: 'board' | 'chat'
  /** Session id for chat destination (returned alongside ${CURRENT_CHAT_DIR}/... filePath so frontend can build preview URL). */
  sessionId?: string
}

/** Ensure sessionId exists when saving into chat history. */
function requireSessionId(): string {
  const sessionId = getSessionId()
  if (!sessionId) {
    throw new Error('sessionId is required for video download.')
  }
  return sessionId
}

/** Convert an absolute file path to a stable POSIX relative path. */
function toPosixRelativePath(rootPath: string, targetPath: string): string {
  return path.relative(rootPath, targetPath).split(path.sep).join('/')
}

/** Resolve the constrained storage location for the current request context. */
async function resolveVideoStorageTarget(): Promise<VideoStorageTarget> {
  let projectId = getProjectId()
  const boardId = getBoardId()

  if (boardId) {
    if (!projectId) {
      const board = await lookupBoardRecord(boardId)
      if (board?.projectId) projectId = board.projectId
    }
    const boardRoot = resolveBoardScopedRoot(projectId)
    return {
      rootPath: boardRoot,
      saveDirPath: resolveBoardAssetDir(boardRoot, boardId),
      destination: 'board',
    }
  }

  // Chat 会话：通过 resolveSessionAssetDir 统一解析物理目录
  const sessionId = requireSessionId()
  const assetDir = await resolveSessionAssetDir(sessionId)
  return {
    rootPath: assetDir,
    saveDirPath: assetDir,
    sessionId,
    destination: 'chat',
  }
}

/** Sleep for a short interval and respect cooperative cancellation. */
async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise<void>((resolve) => setTimeout(resolve, ms))
    return
  }
  if (signal.aborted) {
    throw new Error('请求已取消。')
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new Error('请求已取消。'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort)
  })
}

/** Wait until the background download task finishes or fails. */
async function waitForDownloadTask(input: {
  taskId: string
  abortSignal?: AbortSignal
}): Promise<VideoDownloadTask> {
  while (true) {
    if (input.abortSignal?.aborted) {
      cancelDownloadTask(input.taskId)
      throw new Error('请求已取消。')
    }

    const task = getTaskStatus(input.taskId)
    if (!task) {
      throw new Error('视频下载任务不存在或已过期。')
    }
    if (task.status === 'completed') {
      return task
    }
    if (task.status === 'failed') {
      throw new Error(task.error || '视频下载失败。')
    }

    await sleepWithAbort(POLL_INTERVAL_MS, input.abortSignal)
  }
}

export const videoDownloadTool = tool({
  description: videoDownloadToolDef.description,
  inputSchema: zodSchema(videoDownloadToolDef.parameters),
  execute: async (input) => {
    const url = input.url?.trim()
    if (!url) {
      throw new Error('url is required.')
    }

    const abortSignal = getAbortSignal()
    const projectId = getProjectId()
    const boardId = getBoardId()
    const sessionId = getSessionId()
    const storage = await resolveVideoStorageTarget()

    const taskId = startDownload({
      url,
      saveDirPath: storage.saveDirPath,
      projectId,
      boardId,
    })

    try {
      const task = await waitForDownloadTask({ taskId, abortSignal })
      const filePath = task.result?.filePath
      const fileName = task.result?.fileName

      if (!filePath || !fileName) {
        throw new Error('下载完成但未找到输出文件。')
      }

      const stat = await fs.stat(filePath)
      // Chat 会话返回 ${CURRENT_CHAT_DIR}/filename 模板变量：AI 可直接在 Read/
      // Grep/Bash 等任意工具中复用（expandPathTemplateVars 自动展开为绝对路径）；
      // 前端构造预览 URL 时需另外附带 sessionId（data.sessionId 字段已提供）。
      // Board 场景仍返回 rootPath 相对路径。
      const relativePath = storage.sessionId
        ? `\${CURRENT_CHAT_DIR}/${fileName}`
        : toPosixRelativePath(storage.rootPath, filePath)

      return {
        ok: true,
        data: {
          taskId,
          url,
          destination: storage.destination,
          fileName,
          filePath: relativePath,
          absolutePath: filePath,
          fileSize: stat.size,
          title: task.info?.title ?? fileName,
          duration: task.info?.duration ?? 0,
          width: task.result?.width ?? task.info?.width ?? 0,
          height: task.result?.height ?? task.info?.height ?? 0,
          ext: task.info?.ext ?? path.extname(fileName).replace(/^\./, ''),
          projectId,
          boardId,
          sessionId,
        },
      }
    } catch (error) {
      logger.error({ error, taskId, url }, 'videoDownloadTool failed')
      if (abortSignal?.aborted) {
        cancelDownloadTask(taskId)
      }
      throw error
    }
  },
})
