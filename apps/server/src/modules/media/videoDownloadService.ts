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
import ffmpeg from 'fluent-ffmpeg'
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
  status: 'pending' | 'downloading' | 'merging' | 'completed' | 'failed'
  /** Download phase for UI display. */
  phase: 'extracting' | 'downloading' | 'merging' | 'done'
  progress: number
  info?: VideoInfo
  result?: { filePath: string; fileName: string; posterDataUrl?: string; width?: number; height?: number }
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
    phase: 'extracting',
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
  const timer = setTimeout(() => {
    tasks.delete(taskId)
  }, 10 * 60 * 1000)
  // 逻辑：清理定时器不应阻止进程退出，尤其是测试场景。
  timer.unref?.()
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

    // 逻辑：bestvideo+bestaudio 分两次下载再合并，
    // streamIndex 追踪当前是第几个流，用于计算总体进度。
    let streamIndex = 0
    let streamCount = 2 // 默认假设视频+音频双流

    builder.on('progress', (p) => {
      if (task.status !== 'downloading' && task.status !== 'merging') return
      task.phase = 'downloading'
      let pct: number | undefined
      if (p.percentage != null) {
        pct = p.percentage
      } else if (p.downloaded != null && p.total != null && p.total > 0) {
        pct = (p.downloaded / p.total) * 100
      }
      if (pct != null) {
        // 逻辑：将单流百分比映射到总进度。
        // 流 0: 0-50%, 流 1: 50-100%（双流时）；单流时直接 0-100%
        const streamPct = Math.min(pct, 100)
        const overallPct = (streamIndex * 100 + streamPct) / streamCount
        task.progress = Math.min(Math.round(overallPct), 99)
      }
    })

    builder.on('beforeDownload', (info: DownloadedVideoInfo) => {
      task.phase = 'downloading'
      task.info = {
        title: info.title || 'Untitled',
        thumbnail: '',
        duration: info.duration || 0,
        width: 0,
        height: 0,
        ext: info.ext || 'mp4',
      }
    })

    builder.on('stderr', (data: string) => {
      if (task.status !== 'downloading' && task.status !== 'merging') return
      const lines = data.split('\n')
      for (const line of lines) {
        // 逻辑：检测新流开始下载（Destination 行出现时代表新一个流）
        if (line.includes('[download] Destination:')) {
          if (task.phase === 'downloading' && task.progress > 0) {
            streamIndex += 1
          }
          task.phase = 'downloading'
        }
        // 逻辑：解析百分比进度
        const match = line.match(/\[download\]\s+([\d.]+)%/)
        if (match?.[1]) {
          const pct = parseFloat(match[1])
          if (!Number.isNaN(pct)) {
            const streamPct = Math.min(pct, 100)
            const overallPct = (streamIndex * 100 + streamPct) / streamCount
            task.progress = Math.min(Math.round(overallPct), 99)
          }
        }
        // 逻辑：检测合并阶段
        if (line.includes('[Merger]') || line.includes('[ffmpeg]')) {
          task.phase = 'merging'
          task.status = 'merging'
        }
        // 逻辑：单流模式检测（没有合并的情况）
        if (line.includes('Requested format is not available')) {
          streamCount = 1
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

    task.phase = 'done'
    task.progress = 100

    // Extract poster frame and video dimensions before marking completed
    const posterMeta = await extractPosterAndMeta(targetPath)
    task.result = {
      filePath: targetPath,
      fileName,
      posterDataUrl: posterMeta?.posterDataUrl,
      width: posterMeta?.width,
      height: posterMeta?.height,
    }
    task.status = 'completed'
    logger.info({ taskId: task.id, fileName, width: posterMeta?.width, height: posterMeta?.height }, 'Video download completed')

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

/** Extract a poster frame and video dimensions from a local video file. */
async function extractPosterAndMeta(filePath: string): Promise<{
  posterDataUrl: string
  width: number
  height: number
} | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.warn({ err, filePath }, 'ffprobe failed for poster extraction')
        resolve(null)
        return
      }

      const videoStream = metadata.streams?.find((s) => s.codec_type === 'video')
      const width = videoStream?.width || 0
      const height = videoStream?.height || 0

      // Extract a single frame as JPEG
      const tmpPoster = `${filePath}.poster.jpg`
      ffmpeg(filePath)
        .seekInput(0.5)
        .frames(1)
        .outputOptions(['-vf', 'scale=640:-2', '-q:v', '4'])
        .output(tmpPoster)
        .on('end', () => {
          try {
            const buffer = fs.readFileSync(tmpPoster)
            const base64 = buffer.toString('base64')
            fs.unlinkSync(tmpPoster)
            resolve({
              posterDataUrl: `data:image/jpeg;base64,${base64}`,
              width,
              height,
            })
          } catch {
            resolve({ posterDataUrl: '', width, height })
          }
        })
        .on('error', () => {
          resolve({ posterDataUrl: '', width, height })
        })
        .run()
    })
  })
}

/** Export a clipped segment of a video using ffmpeg. */
export async function exportVideoClip(input: {
  absolutePath: string
  startTime: number
  endTime: number
  outputDir: string
  fileName: string
}): Promise<{ filePath: string; fileName: string }> {
  const { absolutePath, startTime, endTime, outputDir, fileName } = input
  fs.mkdirSync(outputDir, { recursive: true })

  const ext = path.extname(fileName) || '.mp4'
  const base = path.basename(fileName, ext)
  const outputName = `${base}_clip_${Math.floor(startTime)}-${Math.floor(endTime)}${ext}`
  const outputPath = path.join(outputDir, outputName)

  return new Promise((resolve, reject) => {
    const duration = endTime - startTime
    const cmd = ffmpeg(absolutePath)
      .seekInput(startTime)
      .duration(duration)
      .outputOptions(['-y', '-c', 'copy'])
      .output(outputPath)

    cmd.on('end', () => {
      resolve({ filePath: outputPath, fileName: outputName })
    })
    cmd.on('error', (err) => {
      logger.warn({ err }, 'Stream copy failed, retrying with re-encode')
      // Fallback: re-encode for frame-accurate cuts
      const cmd2 = ffmpeg(absolutePath)
        .seekInput(startTime)
        .duration(duration)
        .outputOptions(['-y', '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast'])
        .output(outputPath)

      cmd2.on('end', () => resolve({ filePath: outputPath, fileName: outputName }))
      cmd2.on('error', (err2) => reject(err2))
      cmd2.run()
    })
    cmd.run()
  })
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
