/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import type { Hono } from 'hono'
import { smoothStream, streamText } from 'ai'
import type { ChatModelSource } from '@openloaf/api/common'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { getTextFeaturePrompt } from '@/ai/services/textFeatureRegistry'
import {
  loadProjectImageBuffer,
  resolveProjectFilePath,
} from '@/ai/services/image/attachmentResolver'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assemble system prompt from skills or feature default. */
function assembleSystemPrompt(
  featureId: string,
  skillContents?: { name: string; content: string }[],
): string {
  if (skillContents?.length) {
    return skillContents
      .map((s) => `<system-tag type="skill" id="${s.name}">\n${s.content}\n</system-tag>`)
      .join('\n\n')
  }
  return getTextFeaturePrompt(featureId) ?? 'You are a helpful writing assistant.'
}

/** Assemble plain-text user message (text-only path). */
function assembleUserMessage(
  instruction: string,
  upstreamText?: string,
): string {
  const parts: string[] = []
  if (upstreamText) {
    parts.push(`<system-tag type="input">\n${upstreamText}\n</system-tag>`)
  }
  parts.push(instruction)
  return parts.join('\n\n')
}

/** Max file size for video/audio uploads (50 MB). */
const MAX_MEDIA_FILE_SIZE = 50 * 1024 * 1024

/** Mime type lookup by extension for video/audio. */
const MEDIA_MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
}

/** Resolve a relative media path to { buffer, mimeType }. */
async function resolveMediaFile(
  relativePath: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const resolved = await resolveProjectFilePath({ path: relativePath })
  if (!resolved) return null
  const ext = path.extname(resolved.absPath).toLowerCase()
  const mimeType = MEDIA_MIME_MAP[ext]
  if (!mimeType) return null
  const stat = await fs.stat(resolved.absPath).catch(() => null)
  if (!stat || stat.size > MAX_MEDIA_FILE_SIZE) return null
  const buffer = await fs.readFile(resolved.absPath)
  return { buffer, mimeType }
}

/**
 * Build multimodal user message content.
 * Returns a plain string for text-only, or an array of content parts when
 * images/video/audio are present.
 */
async function assembleUserContent(
  instruction: string,
  upstreamText?: string,
  upstreamImages: string[] = [],
  upstreamVideos: string[] = [],
  upstreamAudios: string[] = [],
): Promise<string | Array<{ type: string; [k: string]: unknown }>> {
  const hasMedia =
    upstreamImages.length > 0 ||
    upstreamVideos.length > 0 ||
    upstreamAudios.length > 0

  if (!hasMedia) {
    return assembleUserMessage(instruction, upstreamText)
  }

  const parts: Array<{ type: string; [k: string]: unknown }> = []

  // Text upstream
  if (upstreamText) {
    parts.push({ type: 'text', text: `<system-tag type="input">\n${upstreamText}\n</system-tag>` })
  }

  // Images — compress via loadProjectImageBuffer or pass data URL directly
  for (const src of upstreamImages) {
    if (src.startsWith('data:')) {
      parts.push({ type: 'image', image: src })
    } else {
      const payload = await loadProjectImageBuffer({ path: src })
      if (payload) {
        const dataUrl = `data:${payload.mediaType};base64,${payload.buffer.toString('base64')}`
        parts.push({ type: 'image', image: dataUrl })
      }
    }
  }

  // Videos
  for (const videoPath of upstreamVideos) {
    const media = await resolveMediaFile(videoPath)
    if (media) {
      parts.push({ type: 'file', data: media.buffer, mimeType: media.mimeType })
    }
  }

  // Audios
  for (const audioPath of upstreamAudios) {
    const media = await resolveMediaFile(audioPath)
    if (media) {
      parts.push({ type: 'file', data: media.buffer, mimeType: media.mimeType })
    }
  }

  // User instruction
  parts.push({ type: 'text', text: instruction })

  return parts
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * Register POST /ai/board-agent route for canvas text AI generation.
 *
 * Uses bare streamText() (same pattern as aiCommandRoutes) — the frontend
 * handles replace/derive logic when the user clicks "Apply".
 */
export function registerBoardAgentRoutes(app: Hono) {
  app.post('/ai/board-agent', async (c) => {
    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const featureId = typeof body.featureId === 'string' ? body.featureId : ''
    const instruction = typeof body.instruction === 'string' ? body.instruction : ''
    if (!featureId || !instruction.trim()) {
      return c.json({ error: 'featureId and instruction are required' }, 400)
    }

    const upstreamText =
      typeof body.upstreamText === 'string' ? body.upstreamText : undefined
    const upstreamImages = Array.isArray(body.upstreamImages)
      ? (body.upstreamImages as string[])
      : []
    const upstreamVideos = Array.isArray(body.upstreamVideos)
      ? (body.upstreamVideos as string[])
      : []
    const upstreamAudios = Array.isArray(body.upstreamAudios)
      ? (body.upstreamAudios as string[])
      : []
    const chatModelId =
      typeof body.chatModelId === 'string' ? body.chatModelId : undefined
    const chatModelSource = (
      typeof body.chatModelSource === 'string'
        ? body.chatModelSource
        : undefined
    ) as ChatModelSource | undefined
    const skillContents = Array.isArray(body.skillContents)
      ? (body.skillContents as { name: string; content: string }[])
      : undefined
    // Resolve chat model — 前端 model picker 负责按 feature 能力过滤
    let resolved
    try {
      resolved = await resolveChatModel({
        chatModelId,
        chatModelSource,
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to resolve model'
      logger.error({ err }, '[board-agent] resolveChatModel failed')
      return c.json({ error: msg }, 500)
    }

    const system = assembleSystemPrompt(featureId, skillContents)
    const userContent = await assembleUserContent(
      instruction,
      upstreamText,
      upstreamImages,
      upstreamVideos,
      upstreamAudios,
    )

    const result = streamText({
      model: resolved.model as any,
      messages: [{ role: 'user', content: userContent as any }],
      system,
      abortSignal: c.req.raw.signal,
      experimental_transform: smoothStream({
        delayInMs: 10,
        chunking: new Intl.Segmenter('zh', { granularity: 'word' }),
      }),
    })

    return result.toTextStreamResponse()
  })
}
