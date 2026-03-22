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
import { createReadStream } from 'node:fs'
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

/** Register video streaming routes with Range request support. */
export function registerVideoStreamRoutes(app: Hono) {
  app.get('/media/stream', async (c) => {
    const boardId = c.req.query('boardId')?.trim()
    const file = c.req.query('file')?.trim()
    const projectId = c.req.query('projectId')?.trim()
    const filePath = c.req.query('path')?.trim()

    let absPath: string | null = null

    // Board-relative path resolution
    if (boardId && file) {
      if (file.includes('..')) {
        return c.json({ error: 'Invalid file path' }, 400)
      }
      const boardResult = await resolveBoardDirFromDb(boardId)
      if (!boardResult) {
        return c.json({ error: 'Board not found' }, 404)
      }
      absPath = path.resolve(boardResult.absDir, file)
      // Security check
      if (!absPath.startsWith(path.resolve(boardResult.absDir))) {
        return c.json({ error: 'Access denied' }, 403)
      }
    }
    // Project-relative or global path resolution
    else if (filePath) {
      if (filePath.includes('..')) {
        return c.json({ error: 'Invalid file path' }, 400)
      }
      try {
        absPath = resolveScopedPath({ projectId, target: filePath })
      } catch {
        return c.json({ error: 'Path resolution failed' }, 400)
      }
    }

    if (!absPath) {
      return c.json({ error: 'Missing boardId+file or path parameter' }, 400)
    }

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

        for await (const chunk of readStream) {
          await s.write(chunk as Uint8Array)
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
      for await (const chunk of readStream) {
        await s.write(chunk as Uint8Array)
      }
    })
  })
}
