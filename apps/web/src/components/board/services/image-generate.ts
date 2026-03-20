/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { submitImageTask } from '@/lib/saas-media'

/** Supported aspect ratio literals accepted by the SaaS API. */
type SaasAspectRatio = '1:1' | '16:9' | '9:16' | '4:3'

/** Check whether a string is a valid SaaS aspect ratio. */
function isSaasAspectRatio(value: string): value is SaasAspectRatio {
  return value === '1:1' || value === '16:9' || value === '9:16' || value === '4:3'
}

export type ImageGenerateRequest = {
  prompt: string
  negativePrompt?: string
  modelId?: string
  aspectRatio?: string
  resolution?: string
  style?: string
  referenceImageSrc?: string
  /** All upstream reference images (takes precedence over referenceImageSrc). */
  referenceImageSrcs?: string[]
}

export type ImageGenerateResult = {
  taskId: string
}

/**
 * Submit an image generation task to the server.
 * Returns a taskId that can be used with LoadingNode for polling.
 */
export async function submitImageGenerate(
  request: ImageGenerateRequest,
  options: {
    projectId?: string
    saveDir?: string
    sourceNodeId?: string
  } = {},
): Promise<ImageGenerateResult> {
  // 逻辑：modelId 为空或 'auto' 时不传，由 SaaS 后端自动选择。
  const modelId = request.modelId && request.modelId !== 'auto'
    ? request.modelId
    : undefined

  const output = request.aspectRatio && isSaasAspectRatio(request.aspectRatio)
    ? { aspectRatio: request.aspectRatio as SaasAspectRatio }
    : undefined

  const payload: Record<string, unknown> = {
    modelId,
    prompt: request.prompt,
    negativePrompt: request.negativePrompt || undefined,
    output,
    projectId: options.projectId,
    saveDir: options.saveDir,
    sourceNodeId: options.sourceNodeId,
  }

  // 逻辑：图生图模式下，将参考图作为输入传给 SaaS API。
  // 本地 URL 的解析由服务端 submitImageProxy 处理（S3 优先 → base64 兜底）。
  const refSrcs = request.referenceImageSrcs?.length
    ? request.referenceImageSrcs
    : request.referenceImageSrc
      ? [request.referenceImageSrc]
      : []
  if (refSrcs.length > 0) {
    payload.inputs = {
      images: refSrcs.map((url) => ({ url })),
    }
  }

  const result = await submitImageTask(payload as any)

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || '图片生成任务创建失败'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
