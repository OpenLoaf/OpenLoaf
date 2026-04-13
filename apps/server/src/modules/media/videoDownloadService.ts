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
import { resolveOpenLoafPath } from '@openloaf/config'
import { logger } from '@/common/logger'

let ytdlp: YtDlp | null = null
let initPromise: Promise<YtDlp> | null = null

const errorPatterns: [RegExp, string][] = [
  [/EACCES/i, 'video_download_permission_denied'],
  [/ENOENT/i, 'video_download_tool_missing'],
  [/ETIMEDOUT|ESOCKETTIMEDOUT|ECONNABORTED/i, 'video_download_network_timeout'],
  [/ECONNREFUSED|ECONNRESET|ENOTFOUND/i, 'video_download_network_error'],
  [/Unsupported URL|is not a valid URL/i, 'video_download_unsupported_url'],
  [/Video unavailable|Private video|removed/i, 'video_download_unavailable'],
  [/Sign in to confirm/i, 'video_download_auth_required'],
  [/HTTP Error 403|HTTP Error 429/i, 'video_download_blocked'],
  [/No video formats found|Requested format/i, 'video_download_no_format'],
  [/ENOSPC/i, 'video_download_disk_full'],
]

const friendlyMessages: Record<string, string> = {
  video_download_permission_denied: '下载工具权限不足，请重启应用后重试',
  video_download_tool_missing: '下载工具未正确安装，请重启应用后重试',
  video_download_network_timeout: '网络连接超时，请检查网络后重试',
  video_download_network_error: '网络连接失败，请检查网络后重试',
  video_download_unsupported_url: '不支持的视频链接',
  video_download_unavailable: '视频不可用（可能已删除或设为私密）',
  video_download_auth_required: '该视频需要登录才能访问',
  video_download_blocked: '请求被目标网站拒绝，请稍后重试',
  video_download_no_format: '未找到可下载的视频格式',
  video_download_disk_full: '磁盘空间不足',
}

function friendlyDownloadError(raw: string): string {
  for (const [pattern, code] of errorPatterns) {
    if (pattern.test(raw)) return friendlyMessages[code]!
  }
  return '视频下载失败'
}

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
    const directVideoId = pathMatch?.[1]
    if (directVideoId) return directVideoId

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
        const redirectedVideoId = locMatch?.[1]
        if (redirectedVideoId) return redirectedVideoId
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

  const jsonStr = routerMatch[1]?.replace(/\\u002F/g, '/')
  if (!jsonStr) throw new Error('Douyin _ROUTER_DATA payload missing')
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

/**
 * Ensure yt-dlp binary is available.
 *
 * 解析优先级：
 * 1. `OPENLOAF_YTDLP_BINARY` 环境变量 —— 由 Electron main 指向打包进 Resources/bin/
 *    的二进制（prod），或仓库 apps/desktop/resources/bin/（dev by `pnpm desktop`）。
 *    二进制由 `pnpm run prefetch:ytdlp` 在 predesktop 阶段下载（带重试），替代
 *    上游 ytdlp-nodejs 无重试的 postinstall。
 * 2. 用户目录 `~/.openloaf/bin/` 运行时兜底 —— 裸跑 server（`pnpm dev:server`）
 *    或打包产物缺失时，首次调用动态下载。
 *
 * 注意不使用 `helpers.findYtdlpBinary()`：它硬编码在 `node_modules/ytdlp-nodejs/bin/`
 * 下查找，而 server 的 esbuild 产物把 ytdlp-nodejs 的 JS 内联进 server.mjs，
 * `__dirname` 无法指向原始包目录，该函数返回值不可靠。
 */
async function ensureYtDlp(): Promise<YtDlp> {
  if (ytdlp) return ytdlp
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      let binaryPath: string | undefined = process.env.OPENLOAF_YTDLP_BINARY
      if (binaryPath && !fs.existsSync(binaryPath)) {
        logger.warn({ binaryPath }, 'OPENLOAF_YTDLP_BINARY points to missing file, falling back')
        binaryPath = undefined
      }
      if (!binaryPath) {
        const binDir = resolveOpenLoafPath('bin')
        fs.mkdirSync(binDir, { recursive: true })
        logger.info({ binDir }, 'downloading yt-dlp to user data dir')
        binaryPath = await helpers.downloadYtDlp(binDir)
      }
      logger.info({ binaryPath }, 'yt-dlp binary ready')
      ytdlp = new YtDlp({ binaryPath })
      return ytdlp
    } catch (err) {
      // 失败时清空 promise，避免缓存 rejected promise 导致用户重试也永远失败
      initPromise = null
      throw err
    }
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

      // Sanitize filename: remove special chars (#, @, etc.), replace spaces with _
      const safeTitle = data.title
        .replace(/[<>:"/\\|?*#@!$%^&()+=\[\]{};',~`\x00-\x1f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
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

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body reader')

      // 流式写入文件，避免将整个视频缓冲到内存（可能数百 MB）
      const fd = fs.openSync(filePath, 'w')
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if ((task.status as string) === 'failed') {
            fs.closeSync(fd)
            return
          }
          fs.writeSync(fd, value)
          downloaded += value.byteLength
          if (totalSize > 0) {
            task.progress = Math.min(Math.round((downloaded / totalSize) * 100), 99)
          }
        }
      } finally {
        fs.closeSync(fd)
      }
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
    const rawMsg = error instanceof Error ? error.message : String(error)
    task.error = friendlyDownloadError(rawMsg)
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
/** Extract audio track from a video file using ffmpeg. */
export async function extractAudioTrack(input: {
  absolutePath: string
  startTime?: number
  endTime?: number
  outputDir: string
  fileName: string
}): Promise<{ filePath: string; relativePath: string; fileName: string; duration: number }> {
  const { absolutePath, startTime, endTime, outputDir, fileName } = input
  fs.mkdirSync(outputDir, { recursive: true })

  const base = path.basename(fileName, path.extname(fileName))
  const outputName = `${base}_audio.mp3`
  const outputPath = path.join(outputDir, outputName)

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg(absolutePath)
    if (startTime != null && startTime > 0) cmd = cmd.seekInput(startTime)
    if (endTime != null && startTime != null) cmd = cmd.duration(endTime - (startTime ?? 0))

    cmd
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(192)
      .outputOptions(['-y'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })

  // Get duration of the output file
  const audioDuration = await new Promise<number>((resolve) => {
    ffmpeg.ffprobe(outputPath, (err, metadata) => {
      if (err || !metadata?.format?.duration) resolve(0)
      else resolve(metadata.format.duration)
    })
  })

  const relativePath = `asset/${outputName}`
  return { filePath: outputPath, relativePath, fileName: outputName, duration: audioDuration }
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

