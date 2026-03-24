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
  exportVideoClip,
  extractAudioTrack,
} from './videoDownloadService'
import { resolveScopedPath } from '@openloaf/api'
import {
  resolveBoardDirFromDb,
} from '@openloaf/api/common/boardPaths'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
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
      } else if (body.boardId) {
        const boardResult = await resolveBoardDirFromDb(body.boardId)
        if (!boardResult) {
          return c.json({ error: 'Board not found' }, 404)
        }
        saveDirPath = path.join(boardResult.absDir, BOARD_ASSETS_DIR)
      } else {
        return c.json({ error: 'Missing boardFolderUri or boardId' }, 400)
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
        phase: task.phase,
        progress: task.progress,
        info: task.info,
        result: task.result
          ? {
              fileName: task.result.fileName,
              posterDataUrl: task.result.posterDataUrl,
              width: task.result.width,
              height: task.result.height,
            }
          : undefined,
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

  /** Export a clipped segment of a video via ffmpeg. */
  app.post('/media/video-clip/export', async (c) => {
    try {
      const body = await c.req.json<{
        sourcePath?: string
        projectId?: string
        boardId?: string
        startTime?: number
        endTime?: number
      }>()

      const { sourcePath, startTime, endTime } = body
      if (!sourcePath || startTime == null || endTime == null) {
        return c.json({ error: 'Missing sourcePath, startTime, or endTime' }, 400)
      }
      if (!body.boardId) {
        return c.json({ error: 'Missing boardId' }, 400)
      }
      if (endTime <= startTime) {
        return c.json({ error: 'endTime must be greater than startTime' }, 400)
      }

      const boardResult = await resolveBoardDirFromDb(body.boardId)
      if (!boardResult) {
        return c.json({ error: 'Board not found' }, 404)
      }

      // Resolve source to absolute path
      const absolutePath = path.resolve(boardResult.absDir, sourcePath.replace(/^\/+/, ''))

      if (!fs.existsSync(absolutePath)) {
        return c.json({ error: 'Source file not found' }, 404)
      }

      const outputDir = path.join(boardResult.absDir, BOARD_ASSETS_DIR)
      const fileName = path.basename(absolutePath)

      const result = await exportVideoClip({
        absolutePath,
        startTime,
        endTime,
        outputDir,
        fileName,
      })

      return c.json({ success: true, data: result })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export clip failed'
      logger.error({ error }, 'video-clip/export failed')
      return c.json({ error: message }, 500)
    }
  })

  /** Download an exported clip file. */
  app.get('/media/video-clip/download', async (c) => {
    const filePath = c.req.query('file')?.trim()
    const boardId = c.req.query('boardId')?.trim()
    if (!filePath) {
      return c.json({ error: 'Missing file parameter' }, 400)
    }
    if (!boardId) {
      return c.json({ error: 'Missing boardId' }, 400)
    }

    // Security: only allow files within the board's asset directory
    const boardResult = await resolveBoardDirFromDb(boardId)
    if (!boardResult) {
      return c.json({ error: 'Board not found' }, 404)
    }
    const allowedDir = path.join(boardResult.absDir, BOARD_ASSETS_DIR)
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(allowedDir)) {
      return c.json({ error: 'Access denied' }, 403)
    }

    if (!fs.existsSync(resolved)) {
      return c.json({ error: 'File not found' }, 404)
    }

    const fileName = path.basename(resolved)
    const buffer = fs.readFileSync(resolved)

    c.header('Content-Type', 'video/mp4')
    c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    c.header('Content-Length', String(buffer.length))
    return c.body(buffer)
  })

  /** Extract audio track from a video file. */
  app.post('/media/audio-extract', async (c) => {
    try {
      const body = await c.req.json<{
        sourcePath?: string
        projectId?: string
        boardId?: string
        startTime?: number
        endTime?: number
      }>()

      const { sourcePath } = body
      if (!sourcePath) {
        return c.json({ error: 'Missing sourcePath' }, 400)
      }
      if (!body.boardId) {
        return c.json({ error: 'Missing boardId' }, 400)
      }

      const boardResult = await resolveBoardDirFromDb(body.boardId)
      if (!boardResult) {
        return c.json({ error: 'Board not found' }, 404)
      }

      const absolutePath = path.resolve(boardResult.absDir, sourcePath.replace(/^\/+/, ''))
      if (!fs.existsSync(absolutePath)) {
        return c.json({ error: 'Source file not found' }, 404)
      }

      const outputDir = path.join(boardResult.absDir, BOARD_ASSETS_DIR)
      const fileName = path.basename(absolutePath)

      const result = await extractAudioTrack({
        absolutePath,
        startTime: body.startTime,
        endTime: body.endTime,
        outputDir,
        fileName,
      })

      return c.json({ success: true, data: result })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audio extraction failed'
      logger.error({ error }, 'audio-extract failed')
      return c.json({ error: message }, 500)
    }
  })
}
