/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Hono } from 'hono'
import {
  getVideoInfo,
  startDownload,
  getTaskStatus,
  cancelDownloadTask,
} from './videoDownloadService'
import { resolveScopedPath } from '@openloaf/api'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { logger } from '@/common/logger'

const BOARD_ASSETS_DIR = 'asset'

/** Register video download routes under /media/video-download. */
export function registerVideoDownloadRoutes(app: Hono) {
  /** Fetch video metadata (title, thumbnail, duration, etc.). */
  app.post('/media/video-download/info', async (c) => {
    try {
      const body = await c.req.json<{ url?: string }>()
      const url = body.url?.trim()
      if (!url) {
        return c.json({ error: 'Missing url' }, 400)
      }
      const info = await getVideoInfo(url)
      return c.json({ success: true, data: info })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get video info'
      logger.error({ error }, 'video-download/info failed')
      return c.json({ error: message }, 500)
    }
  })

  /** Start a video download task. Returns taskId for progress polling. */
  app.post('/media/video-download/start', async (c) => {
    try {
      const body = await c.req.json<{
        url?: string
        boardFolderUri?: string
        projectId?: string
        boardId?: string
      }>()
      const url = body.url?.trim()
      if (!url) {
        return c.json({ error: 'Missing url' }, 400)
      }

      let saveDirPath: string
      if (body.boardFolderUri) {
        const raw = body.boardFolderUri.trim()
        let boardDir: string
        if (raw.startsWith('file://')) {
          boardDir = fileURLToPath(raw)
        } else if (path.isAbsolute(raw)) {
          boardDir = path.resolve(raw)
        } else {
          boardDir = resolveScopedPath({
            projectId: body.projectId,
            target: raw,
          })
        }
        saveDirPath = path.join(boardDir, BOARD_ASSETS_DIR)
      } else {
        const configDir = process.env.OPENLOAF_CONFIG_DIR
          || path.join(process.env.HOME || '/tmp', '.openloaf')
        saveDirPath = path.join(configDir, 'temp', 'video-downloads')
      }

      const taskId = startDownload({
        url,
        saveDirPath,
        boardId: body.boardId,
        projectId: body.projectId,
      })
      return c.json({ success: true, data: { taskId } })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start download'
      logger.error({ error }, 'video-download/start failed')
      return c.json({ error: message }, 500)
    }
  })

  /** Query download task progress and status. */
  app.get('/media/video-download/progress', (c) => {
    const taskId = c.req.query('taskId')?.trim()
    if (!taskId) {
      return c.json({ error: 'Missing taskId' }, 400)
    }
    const task = getTaskStatus(taskId)
    if (!task) {
      return c.json({ error: 'Task not found' }, 404)
    }
    return c.json({
      success: true,
      data: {
        status: task.status,
        progress: task.progress,
        info: task.info,
        result: task.result,
        error: task.error,
      },
    })
  })

  /** Cancel a running download task. */
  app.post('/media/video-download/cancel', async (c) => {
    const body = await c.req.json<{ taskId?: string }>()
    const taskId = body.taskId?.trim()
    if (!taskId) {
      return c.json({ error: 'Missing taskId' }, 400)
    }
    const cancelled = cancelDownloadTask(taskId)
    return c.json({ success: true, data: { cancelled } })
  })
}
