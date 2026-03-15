/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { YtDlp, helpers } from 'ytdlp-nodejs'
import type { VideoInfo as YtVideoInfo, DownloadedVideoInfo } from 'ytdlp-nodejs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { logger } from '@/common/logger'
import { getHlsManifest } from './hlsService'

let ytdlp: YtDlp | null = null
let initPromise: Promise<YtDlp> | null = null

/** Ensure yt-dlp binary is available, download if missing. */
async function ensureYtDlp(): Promise<YtDlp> {
  if (ytdlp) return ytdlp
  if (initPromise) return initPromise
  initPromise = (async () => {
    let binaryPath = helpers.findYtdlpBinary()
    if (!binaryPath) {
      logger.info('yt-dlp binary not found, downloading...')
      binaryPath = await helpers.downloadYtDlp()
      logger.info({ binaryPath }, 'yt-dlp binary downloaded')
    }
    ytdlp = new YtDlp({ binaryPath })
    return ytdlp
  })()
  return initPromise
}

export interface VideoInfo {
  title: string
  thumbnail: string
  duration: number
  width: number
  height: number
  ext: string
}

export interface VideoDownloadTask {
  id: string
  url: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
  info?: VideoInfo
  result?: { filePath: string; fileName: string }
  error?: string
}

const tasks = new Map<string, VideoDownloadTask>()

/** Fetch video metadata without downloading. */
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const dlp = await ensureYtDlp()
  const info = await dlp.getInfoAsync<'video'>(url)
  return extractVideoInfo(info)
}

function extractVideoInfo(info: YtVideoInfo): VideoInfo {
  return {
    title: info.title || 'Untitled',
    thumbnail: info.thumbnail || '',
    duration: info.duration || 0,
    width: info.width || 0,
    height: info.height || 0,
    ext: info.ext || 'mp4',
  }
}

/** Start a video download task (non-blocking). */
export function startDownload(input: {
  url: string
  saveDirPath: string
  taskId?: string
  boardId?: string
  projectId?: string
}): string {
  const taskId = input.taskId || randomUUID()
  const task: VideoDownloadTask = {
    id: taskId,
    url: input.url,
    status: 'pending',
    progress: 0,
  }
  tasks.set(taskId, task)
  void runDownload(task, input.saveDirPath, {
    boardId: input.boardId,
    projectId: input.projectId,
  })
  return taskId
}

/** Get task status by id. */
export function getTaskStatus(taskId: string): VideoDownloadTask | undefined {
  return tasks.get(taskId)
}

/** Cancel a running download task. */
export function cancelDownloadTask(taskId: string): boolean {
  const task = tasks.get(taskId)
  if (!task) return false
  if (task.status === 'completed' || task.status === 'failed') return false
  task.status = 'failed'
  task.error = 'Cancelled by user'
  return true
}

/** Clean up completed/failed tasks older than 10 minutes. */
function scheduleCleanup(taskId: string) {
  setTimeout(() => {
    tasks.delete(taskId)
  }, 10 * 60 * 1000)
}

async function runDownload(
  task: VideoDownloadTask,
  saveDirPath: string,
  ctx: { boardId?: string; projectId?: string },
) {
  try {
    const dlp = await ensureYtDlp()
    task.status = 'downloading'
    fs.mkdirSync(saveDirPath, { recursive: true })

    const outputTemplate = path.join(saveDirPath, '%(title)s.%(ext)s')

    // 逻辑：使用 execBuilder + exec() 获取可靠进度。
    // downloadAsync 的 onProgress 在合并下载时不触发中间进度。
    const builder = dlp.execBuilder(task.url)
      .format('bestvideo[height<=720]+bestaudio/best[height<=720]/best')
      .options({ output: outputTemplate })

    builder.on('progress', (p) => {
      if ((task.status as string) !== 'downloading') return
      let pct: number | undefined
      if (p.percentage != null) {
        pct = p.percentage
      } else if (p.downloaded != null && p.total != null && p.total > 0) {
        pct = (p.downloaded / p.total) * 100
      }
      if (pct != null) {
        task.progress = Math.min(Math.round(pct), 100)
        logger.debug({ taskId: task.id, progress: task.progress }, 'Download progress')
      }
    })

    builder.on('beforeDownload', (info: DownloadedVideoInfo) => {
      task.info = {
        title: info.title || 'Untitled',
        thumbnail: '',
        duration: info.duration || 0,
        width: 0,
        height: 0,
        ext: info.ext || 'mp4',
      }
    })

    // 逻辑：通过 stderr 解析进度作为回退（某些平台 progress 事件不触发）
    builder.on('stderr', (data: string) => {
      if ((task.status as string) !== 'downloading') return
      const match = data.match(/\[download\]\s+([\d.]+)%/)
      if (match?.[1]) {
        const pct = parseFloat(match[1])
        if (!Number.isNaN(pct)) {
          task.progress = Math.min(Math.round(pct), 100)
        }
      }
    })

    const result = await builder.exec()

    if ((task.status as string) === 'failed') return

    // 逻辑：优先使用 result.filePaths，回退扫描目录
    const filePaths = result.filePaths ?? []
    let filePath: string | undefined = filePaths[filePaths.length - 1]
    if (!filePath || !fs.existsSync(filePath)) {
      const files = fs.readdirSync(saveDirPath)
        .map((name) => ({
          name,
          mtime: fs.statSync(path.join(saveDirPath, name)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime)
      if (files.length === 0) {
        throw new Error('No output file produced')
      }
      filePath = path.join(saveDirPath, files[0]!.name)
    }

    const fileName = path.basename(filePath!)
    const targetPath = path.join(saveDirPath, fileName)
    if (filePath !== targetPath && fs.existsSync(filePath)) {
      fs.renameSync(filePath, targetPath)
    }

    task.status = 'completed'
    task.progress = 100
    task.result = { filePath: targetPath, fileName }
    logger.info({ taskId: task.id, fileName }, 'Video download completed')

    // Auto-trigger HLS pre-transcoding
    void triggerPreTranscode(fileName, ctx).catch(() => undefined)
  } catch (error) {
    if ((task.status as string) === 'failed') return
    task.status = 'failed'
    task.error = error instanceof Error ? error.message : 'Download failed'
    logger.error({ taskId: task.id, error }, 'Video download failed')
  } finally {
    scheduleCleanup(task.id)
  }
}

/** Trigger HLS pre-transcoding on the server side after download completes. */
async function triggerPreTranscode(
  fileName: string,
  ctx: { boardId?: string; projectId?: string },
) {
  const assetPath = `asset/${fileName}`
  logger.info({ assetPath, boardId: ctx.boardId }, 'Triggering HLS pre-transcode')
  await getHlsManifest({
    path: assetPath,
    projectId: ctx.projectId,
    boardId: ctx.boardId,
    quality: '720p',
  })
}
