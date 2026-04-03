/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { type UIMessage } from 'ai'
import type { ChatModelSource } from '@openloaf/api/common'
import type { ImageGenerateOptions, OpenLoafImageMetadataV1 } from '@openloaf/api/types/image'
import { cancelV3Task, waitV3TaskComplete } from '@/modules/saas/modules/media/client'
import { getProjectId } from '@/ai/shared/context/requestContext'
import { logger } from '@/common/logger'
import { downloadImageData } from '@/ai/shared/util'
import type { GenerateImagePrompt } from '@/ai/services/image/imagePrompt'
import {
  resolveImageInputBuffer,
  resolveMediaTypeFromDataUrl,
} from '@/ai/services/image/imageStorage'
import { resolveLatestUserMessage, sanitizeRequestParts } from './chatMessageUtils'

/** Max wait time for SaaS image tasks (ms). */
export const SAAS_IMAGE_TASK_TIMEOUT_MS = 5 * 60 * 1000

/** Error with HTTP status for image requests. */
export class ChatImageRequestError extends Error {
  /** HTTP status code. */
  status: number

  /** Create a request error with HTTP status. */
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Resolve prompt text from image prompt payload. */
export function resolvePromptText(prompt: GenerateImagePrompt): string {
  if (typeof prompt === 'string') return prompt.trim()
  return typeof prompt.text === 'string' ? prompt.text.trim() : ''
}

/** Resolve model id suffix from chatModelId. */
export function resolveChatModelSuffix(chatModelId: string): string {
  const trimmed = chatModelId.trim()
  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) return trimmed
  return trimmed.slice(separatorIndex + 1).trim() || trimmed
}

/** Map size/aspectRatio to SaaS aspectRatio enum. */
export function resolveSaasAspectRatio(
  options?: ImageGenerateOptions,
): '1:1' | '16:9' | '9:16' | '4:3' | undefined {
  const rawSize = typeof options?.size === 'string' ? options?.size.trim() : ''
  if (rawSize && /^\d+x\d+$/u.test(rawSize)) {
    const [widthText, heightText] = rawSize.split('x')
    const width = Number(widthText)
    const height = Number(heightText)
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      if (width === height) return '1:1'
      if (width * 9 === height * 16) return '16:9'
      if (width * 16 === height * 9) return '9:16'
      if (width * 3 === height * 4) return '4:3'
    }
  }
  const rawAspectRatio =
    typeof options?.aspectRatio === 'string' ? options?.aspectRatio.trim() : ''
  if (
    rawAspectRatio === '1:1' ||
    rawAspectRatio === '16:9' ||
    rawAspectRatio === '9:16' ||
    rawAspectRatio === '4:3'
  ) {
    return rawAspectRatio
  }
  return undefined
}

/** Build SaaS image output payload. */
export function resolveSaasImageOutput(
  options?: ImageGenerateOptions,
): { count?: number; aspectRatio?: string; quality?: string } | undefined {
  const count = typeof options?.n === 'number' ? options.n : undefined
  const aspectRatio = resolveSaasAspectRatio(options)
  const qualityRaw = options?.providerOptions?.openai?.quality?.trim()
  const quality = qualityRaw === 'standard' || qualityRaw === 'hd' ? qualityRaw : undefined
  if (count === undefined && !aspectRatio && !quality) return undefined
  return {
    ...(count !== undefined ? { count } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(quality ? { quality } : {}),
  }
}

/** Resolve SaaS optional parameters and style. */
export function resolveSaasImageParameters(
  options?: ImageGenerateOptions,
): { style?: string; negativePrompt?: string; parameters?: Record<string, unknown> } {
  const style = options?.providerOptions?.openai?.style?.trim() || undefined
  const negativePrompt = options?.providerOptions?.qwen?.negative_prompt?.trim() || undefined
  const parameters: Record<string, unknown> = {}
  if (typeof options?.seed === 'number' && Number.isFinite(options.seed)) {
    parameters.seed = options.seed
  }
  if (options?.providerOptions && Object.keys(options.providerOptions).length > 0) {
    parameters.providerOptions = options.providerOptions
  }
  return {
    ...(style ? { style } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
  }
}

/** Resolve prompt images into SaaS inputs. */
export async function resolveSaasImageInputs(input: {
  images: Array<{ data: unknown; mediaType?: string }>
  mask?: { data: unknown; mediaType?: string }
  abortSignal: AbortSignal
}): Promise<
  | {
      images?: Array<{ base64: string; mediaType: string }>
      mask?: { base64: string; mediaType: string }
    }
  | undefined
> {
  if (input.images.length === 0 && !input.mask) return undefined
  const projectId = getProjectId()
  const resolvedImages = await Promise.all(
    input.images.map((image, index) =>
      resolveImageInputBuffer({
        data: image.data as any,
        mediaType: image.mediaType,
        fallbackName: `image-${index + 1}`,
        projectId: projectId || undefined,
        abortSignal: input.abortSignal,
      }).then((resolved) => ({
        base64: resolved.buffer.toString('base64'),
        mediaType: resolved.mediaType,
      })),
    ),
  )
  const resolvedMask = input.mask
    ? await resolveImageInputBuffer({
        data: input.mask.data as any,
        mediaType: input.mask.mediaType,
        fallbackName: 'mask',
        projectId: projectId || undefined,
        abortSignal: input.abortSignal,
      }).then((resolved) => ({
        base64: resolved.buffer.toString('base64'),
        mediaType: resolved.mediaType,
      }))
    : undefined
  return {
    ...(resolvedImages.length > 0 ? { images: resolvedImages } : {}),
    ...(resolvedMask ? { mask: resolvedMask } : {}),
  }
}

/** Wait for SaaS image task via SSE + GET until completion. */
export async function waitForSaasImageTask(input: {
  accessToken: string
  taskId: string
  abortSignal: AbortSignal
}): Promise<{
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  resultUrls?: string[]
  error?: { message?: string; code?: string }
}> {
  if (input.abortSignal.aborted) {
    try {
      await cancelV3Task(input.taskId, input.accessToken)
    } catch {
      /* ignore */
    }
    throw new ChatImageRequestError('请求已取消。', 499)
  }

  try {
    // waitV3TaskComplete: SSE 等终态 → GET 取完整结果
    const result = await waitV3TaskComplete(input.taskId, input.accessToken, {
      abortSignal: input.abortSignal,
      timeoutMs: SAAS_IMAGE_TASK_TIMEOUT_MS,
    })

    if (result.status === 'succeeded') {
      return {
        status: result.status,
        resultUrls: result.resultUrls ?? undefined,
        error: result.error ?? undefined,
      }
    }

    const message = result.error?.message || '图片生成失败。'
    throw new ChatImageRequestError(message, 502)
  } catch (err) {
    if (err instanceof ChatImageRequestError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === '已取消') {
      try {
        await cancelV3Task(input.taskId, input.accessToken)
      } catch {
        /* ignore */
      }
      throw new ChatImageRequestError('请求已取消。', 499)
    }
    if (msg === 'SSE 等待超时') {
      throw new ChatImageRequestError('图片生成超时。', 504)
    }
    throw new ChatImageRequestError(`任务查询失败：${msg}`, 502)
  }
}

/** Download image data and resolve media type. */
export async function downloadImageWithType(input: {
  url: string
  abortSignal: AbortSignal
}): Promise<{ buffer: Buffer; mediaType: string }> {
  if (input.url.startsWith('data:')) {
    const mediaType = resolveMediaTypeFromDataUrl(input.url) || 'image/png'
    const bytes = await downloadImageData(input.url, input.abortSignal)
    return { buffer: Buffer.from(bytes), mediaType }
  }
  const response = await fetch(input.url, { signal: input.abortSignal })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`下载图片失败: ${response.status} ${text}`.trim())
  }
  const mediaType = response.headers.get('content-type') || 'image/png'
  const buffer = Buffer.from(await response.arrayBuffer())
  return { buffer, mediaType }
}

/** Build image metadata payload for persistence. */
export function buildImageMetadata(input: {
  sessionId: string
  prompt: string
  revisedPrompt?: string
  modelId: string
  chatModelId?: string
  chatModelSource?: ChatModelSource
  providerId?: string
  requestMessageId?: string
  responseMessageId?: string
  trigger?: string
  boardId?: string | null
  imageOptions?: { n?: number; size?: string; aspectRatio?: string }
  messages: UIMessage[]
}): OpenLoafImageMetadataV1 {
  const latestUser = resolveLatestUserMessage(input.messages)
  const rawParts = Array.isArray((latestUser as any)?.parts)
    ? ((latestUser as any).parts as unknown[])
    : []
  const sanitized = sanitizeRequestParts(rawParts)
  if (sanitized.warnings.length > 0) {
    logger.warn(
      { sessionId: input.sessionId, warnings: sanitized.warnings },
      '[chat] image metadata sanitized',
    )
  }
  const projectId = getProjectId()

  return {
    version: 1,
    chatSessionId: input.sessionId,
    prompt: input.prompt,
    revised_prompt: input.revisedPrompt,
    modelId: input.modelId,
    chatModelId: input.chatModelId,
    modelSource: input.chatModelSource,
    providerId: input.providerId,
    projectId: projectId || undefined,
    boardId: input.boardId || undefined,
    trigger: input.trigger,
    requestMessageId:
      input.requestMessageId ??
      (typeof (latestUser as any)?.id === 'string' ? (latestUser as any).id : undefined),
    responseMessageId: input.responseMessageId,
    createdAt: new Date().toISOString(),
    imageOptions: input.imageOptions,
    request: {
      parts: sanitized.parts,
      metadata: (latestUser as any)?.metadata,
    },
    flags: sanitized.flags,
    warnings: sanitized.warnings.length > 0 ? sanitized.warnings : undefined,
  }
}
