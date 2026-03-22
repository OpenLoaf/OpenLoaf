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

/**
 * Normalize video URLs that yt-dlp cannot handle directly.
 * e.g. Douyin modal URLs like `douyin.com/jingxuan?modal_id=XXX`
 * → `douyin.com/video/XXX`
 */
function normalizeVideoUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('douyin.com') && u.searchParams.has('modal_id')) {
      const modalId = u.searchParams.get('modal_id')!
      return `https://www.douyin.com/video/${modalId}`
    }
  } catch {
    // Invalid URL, return as-is
  }
  return url
}

// ----- Douyin direct extraction -----
// yt-dlp's Douyin extractor is broken (requires a_bogus signature).
// We bypass it entirely: fetch video metadata from iesdouyin.com SSR page,
// then download the video file directly via HTTP.

const DOUYIN_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

function isDouyinUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host.endsWith('douyin.com') || host.endsWith('iesdouyin.com')
  } catch {
    return false
  }
}

/**
 * Resolve a Douyin video ID from any supported URL format:
 * - douyin.com/video/ID
 * - douyin.com/...?modal_id=ID
 * - iesdouyin.com/share/video/ID
 * - v.douyin.com/XXXXX (short link → follow redirect)
 */
async function resolveDouyinVideoId(url: string): Promise<string | null> {
  try {
    const u = new URL(url)

    // Direct video path: /video/ID or /share/video/ID
    const pathMatch = u.pathname.match(/\/(?:share\/)?video\/(\d+)/)
    if (pathMatch) return pathMatch[1]

    // Modal param: ?modal_id=ID
    const modalId = u.searchParams.get('modal_id')
    if (modalId && /^\d+$/.test(modalId)) return modalId

    // Short link (v.douyin.com): follow 302 redirect to extract ID
    if (u.hostname === 'v.douyin.com') {
      const res = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': DOUYIN_MOBILE_UA },
      })
      const location = res.headers.get('location')
      if (location) {
        const locMatch = location.match(/\/video\/(\d+)/)
        if (locMatch) return locMatch[1]
      }
    }
  } catch {
    // Invalid URL
  }
  return null
}

interface DouyinVideoData {
  title: string
  videoUrl: string
  coverUrl: string
  width: number
  height: number
  duration: number
}

/** Fetch ttwid cookie from ByteDance registration endpoint. */
async function fetchTtwid(): Promise<string> {
  const res = await fetch('https://ttwid.bytedance.com/ttwid/union/register/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': DOUYIN_MOBILE_UA,
    },
    body: JSON.stringify({
      region: 'cn',
      aid: 1128,
      needFid: false,
      service: 'www.douyin.com',
      migrate_info: { ticket: '', source: 'node' },
      cbUrlProtocol: 'https',
      union: true,
    }),
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  return setCookies.map((c) => c.split(';')[0]).join('; ')
}

/**
 * Extract video data from Douyin via the iesdouyin.com SSR share page.
 * This endpoint returns server-rendered HTML with `_ROUTER_DATA` containing
 * full video metadata including play_addr URLs.
 */
async function extractDouyinVideo(videoId: string): Promise<DouyinVideoData> {
  const cookieStr = await fetchTtwid()
  if (!cookieStr) throw new Error('Failed to obtain Douyin ttwid cookie')

  const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}/`
  const res = await fetch(shareUrl, {
    headers: {
      'User-Agent': DOUYIN_MOBILE_UA,
      Cookie: cookieStr,
    },
  })
  if (!res.ok) throw new Error(`Douyin share page returned ${res.status}`)

  const html = await res.text()
  const routerMatch = html.match(/window\._ROUTER_DATA\s*=\s*({[\s\S]+?})\s*<\/script>/)
  if (!routerMatch) throw new Error('Douyin _ROUTER_DATA not found in SSR page')

  const jsonStr = routerMatch[1].replace(/\\u002F/g, '/')
  const data = JSON.parse(jsonStr)

  // Navigate: loaderData → "video_(id)/page" → videoInfoRes → item_list[0]
  const loaderData = data.loaderData
  const pageKey = Object.keys(loaderData).find((k) => k.includes('page'))
  const pageData = pageKey ? loaderData[pageKey] : null
  const item = pageData?.videoInfoRes?.item_list?.[0]
  if (!item?.video?.play_addr) throw new Error('Douyin video data not found in SSR response')

  const video = item.video
  const playAddrUrl = video.play_addr.url_list?.[0]
  if (!playAddrUrl) throw new Error('Douyin play_addr URL missing')

  // Convert watermarked URL (playwm) to no-watermark (play)
  const videoUrl = playAddrUrl.replace('/playwm/', '/play/')

  return {
    title: item.desc || 'Douyin Video',
    videoUrl,
    coverUrl: video.cover?.url_list?.[0] || '',
    width: video.width || 0,
    height: video.height || 0,
    duration: Math.round((video.duration || 0) / 1000),
  }
}

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
  const normalized = normalizeVideoUrl(url)

  // Douyin: use direct extraction (yt-dlp's Douyin extractor is broken)
  if (isDouyinUrl(normalized)) {
    const videoId = await resolveDouyinVideoId(normalized)
    if (!videoId) throw new Error('Invalid Douyin URL: cannot extract video ID')
    const data = await extractDouyinVideo(videoId)
    return {
      title: data.title,
      thumbnail: data.coverUrl,
      duration: data.duration,
      width: data.width,
      height: data.height,
      ext: 'mp4',
    }
  }

  const dlp = await ensureYtDlp()
  const info = await dlp.getInfoAsync<'video'>(normalized)
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
    const normalized = normalizeVideoUrl(task.url)
    task.status = 'downloading'
    fs.mkdirSync(saveDirPath, { recursive: true })

    // Douyin: direct HTTP download (yt-dlp extractor is broken)
    if (isDouyinUrl(normalized)) {
      const videoId = await resolveDouyinVideoId(normalized)
      if (!videoId) throw new Error('Invalid Douyin URL: cannot extract video ID')

      task.phase = 'extracting'
      const data = await extractDouyinVideo(videoId)
      logger.info({ taskId: task.id, title: data.title }, 'Douyin video info extracted')

      task.info = {
        title: data.title,
        thumbnail: data.coverUrl,
        duration: data.duration,
        width: data.width,
        height: data.height,
        ext: 'mp4',
      }
      task.phase = 'downloading'

      // Sanitize filename
      const safeTitle = data.title
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'douyin_video'
      const fileName = `${safeTitle}.mp4`
      const filePath = path.join(saveDirPath, fileName)

      // Stream download with progress
      const res = await fetch(data.videoUrl, {
        headers: { 'User-Agent': DOUYIN_MOBILE_UA },
      })
      if (!res.ok) throw new Error(`Douyin video download HTTP ${res.status}`)

      const totalSize = Number(res.headers.get('content-length')) || 0
      let downloaded = 0
      const chunks: Buffer[] = []

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body reader')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if ((task.status as string) === 'failed') return
        chunks.push(Buffer.from(value))
        downloaded += value.byteLength
        if (totalSize > 0) {
          task.progress = Math.min(Math.round((downloaded / totalSize) * 100), 99)
        }
      }

      fs.writeFileSync(filePath, Buffer.concat(chunks))
      await finishDownload(task, filePath, fileName, ctx)
      return
    }

    // Non-Douyin: use yt-dlp
    const dlp = await ensureYtDlp()
    const outputTemplate = path.join(saveDirPath, '%(title)s.%(ext)s')

    const builder = dlp.execBuilder(normalized)
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
        if (line.includes('[download] Destination:')) {
          if (task.phase === 'downloading' && task.progress > 0) {
            streamIndex += 1
          }
          task.phase = 'downloading'
        }
        const match = line.match(/\[download\]\s+([\d.]+)%/)
        if (match?.[1]) {
          const pct = parseFloat(match[1])
          if (!Number.isNaN(pct)) {
            const streamPct = Math.min(pct, 100)
            const overallPct = (streamIndex * 100 + streamPct) / streamCount
            task.progress = Math.min(Math.round(overallPct), 99)
          }
        }
        if (line.includes('[Merger]') || line.includes('[ffmpeg]')) {
          task.phase = 'merging'
          task.status = 'merging'
        }
        if (line.includes('Requested format is not available')) {
          streamCount = 1
        }
      }
    })

    const result = await builder.exec()

    if ((task.status as string) === 'failed') return

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

    await finishDownload(task, targetPath, fileName, ctx)
  } catch (error) {
    if ((task.status as string) === 'failed') return
    task.status = 'failed'
    task.error = error instanceof Error ? error.message : 'Download failed'
    logger.error({ taskId: task.id, err: error instanceof Error ? { message: error.message, stack: error.stack } : error }, 'Video download failed')
  } finally {
    scheduleCleanup(task.id)
  }
}

/** Shared completion logic for both yt-dlp and direct downloads. */
async function finishDownload(
  task: VideoDownloadTask,
  filePath: string,
  fileName: string,
  ctx: { boardId?: string; projectId?: string },
) {
  task.phase = 'done'
  task.progress = 100

  const posterMeta = await extractPosterAndMeta(filePath)
  task.result = {
    filePath,
    fileName,
    posterDataUrl: posterMeta?.posterDataUrl,
    width: posterMeta?.width,
    height: posterMeta?.height,
  }
  task.status = 'completed'
  logger.info({ taskId: task.id, fileName, width: posterMeta?.width, height: posterMeta?.height }, 'Video download completed')

  void triggerPreTranscode(fileName, ctx).catch(() => undefined)
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
