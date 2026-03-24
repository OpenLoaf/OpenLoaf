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
import { stream } from 'hono/streaming'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { createReadStream } from 'node:fs'
import ffmpeg from 'fluent-ffmpeg'
import { resolveScopedPath } from '@openloaf/api'
import {
  resolveBoardDirFromDb,
} from '@openloaf/api/common/boardPaths'

const VIDEO_MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
}

function getVideoMime(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_MIME_MAP[ext] ?? null
}

/** Resolve an absolute video file path from query params. */
async function resolveVideoPath(params: {
  boardId?: string
  file?: string
  projectId?: string
  filePath?: string
}): Promise<{ absPath: string } | { error: string; status: 400 | 403 | 404 }> {
  const { boardId, file, projectId, filePath } = params

  if (boardId && file) {
    if (file.includes('..')) return { error: 'Invalid file path', status: 400 }
    const boardResult = await resolveBoardDirFromDb(boardId)
    if (!boardResult) return { error: 'Board not found', status: 404 }
    const absPath = path.resolve(boardResult.absDir, file)
    if (!absPath.startsWith(path.resolve(boardResult.absDir))) {
      return { error: 'Access denied', status: 403 }
    }
    return { absPath }
  }

  if (filePath) {
    if (filePath.includes('..')) return { error: 'Invalid file path', status: 400 }
    try {
      return { absPath: resolveScopedPath({ projectId, target: filePath }) }
    } catch {
      return { error: 'Path resolution failed', status: 400 }
    }
  }

  return { error: 'Missing boardId+file or path parameter', status: 400 }
}

/** Register video streaming routes with Range request support. */
export function registerVideoStreamRoutes(app: Hono) {
  app.get('/media/stream', async (c) => {
    const result = await resolveVideoPath({
      boardId: c.req.query('boardId')?.trim(),
      file: c.req.query('file')?.trim(),
      projectId: c.req.query('projectId')?.trim(),
      filePath: c.req.query('path')?.trim(),
    })
    if ('error' in result) return c.json({ error: result.error }, result.status)
    const absPath = result.absPath

    const mime = getVideoMime(absPath)
    if (!mime) {
      return c.json({ error: 'Unsupported video format' }, 400)
    }

    let stat: fs.Stats
    try {
      stat = fs.statSync(absPath)
    } catch {
      return c.json({ error: 'File not found' }, 404)
    }

    if (!stat.isFile()) {
      return c.json({ error: 'Not a file' }, 400)
    }

    const total = stat.size
    const rangeHeader = c.req.header('range')

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (!match) {
        return c.json({ error: 'Invalid range' }, 416)
      }
      const start = parseInt(match[1]!, 10)
      const end = match[2] ? parseInt(match[2], 10) : total - 1
      const clampedEnd = Math.min(end, total - 1)

      if (start > clampedEnd || start >= total) {
        return c.body(null, 416, {
          'Content-Range': `bytes */${total}`,
        })
      }

      const chunkSize = clampedEnd - start + 1
      const fileAbsPath = absPath

      return stream(c, async (s) => {
        c.status(206)
        c.header('Content-Type', mime)
        c.header('Content-Range', `bytes ${start}-${clampedEnd}/${total}`)
        c.header('Accept-Ranges', 'bytes')
        c.header('Content-Length', String(chunkSize))

        const readStream = createReadStream(fileAbsPath, { start, end: clampedEnd })
        s.onAbort(() => {
          readStream.destroy()
        })

        try {
          for await (const chunk of readStream) {
            await s.write(chunk as Uint8Array)
          }
        } catch (e: unknown) {
          if ((e as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE') throw e
        }
      })
    }

    // No range header - stream entire file
    const fileAbsPath = absPath
    return stream(c, async (s) => {
      c.header('Content-Type', mime)
      c.header('Accept-Ranges', 'bytes')
      c.header('Content-Length', String(total))

      const readStream = createReadStream(fileAbsPath)
      s.onAbort(() => {
        readStream.destroy()
      })
      try {
        for await (const chunk of readStream) {
          await s.write(chunk as Uint8Array)
        }
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE') throw e
      }
    })
  })

  // Extract a single JPEG frame from a video at a given time.
  // GET /media/video-frame?path=...&time=1.5&width=160&boardId=...&projectId=...
  app.get('/media/video-frame', async (c) => {
    const result = await resolveVideoPath({
      boardId: c.req.query('boardId')?.trim(),
      file: c.req.query('file')?.trim(),
      projectId: c.req.query('projectId')?.trim(),
      filePath: c.req.query('path')?.trim(),
    })
    if ('error' in result) return c.json({ error: result.error }, result.status)

    const absPath = result.absPath
    const time = parseFloat(c.req.query('time') ?? '0') || 0
    const width = Math.min(320, Math.max(60, parseInt(c.req.query('width') ?? '160', 10) || 160))

    if (!fs.existsSync(absPath)) {
      return c.json({ error: 'File not found' }, 404)
    }

    const tmpFile = path.join(os.tmpdir(), `openloaf-frame-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(absPath)
          .seekInput(time)
          .frames(1)
          .outputOptions(['-vf', `scale=${width}:-2`, '-q:v', '6'])
          .output(tmpFile)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      const buf = fs.readFileSync(tmpFile)
      fs.unlinkSync(tmpFile)

      c.header('Content-Type', 'image/jpeg')
      c.header('Cache-Control', 'public, max-age=86400')
      c.header('Content-Length', String(buf.length))
      return c.body(buf)
    } catch {
      try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
      return c.json({ error: 'Frame extraction failed' }, 500)
    }
  })
}
