/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { submitMediaGenerate } from '@/lib/saas-media'

export type ImageGenerateRequest = {
  prompt: string
  negativePrompt?: string
  aspectRatio?: string
  resolution?: string
  style?: string
  /** imageGenerate sub-mode. */
  mode?: 'text' | 'reference' | 'sketch' | 'character'
  /** Reference images for reference/sketch/character modes. */
  referenceImageSrcs?: string[]
  /** Whether input is a sketch (for sketch mode). */
  isSketch?: boolean
  /** Number of results to generate. */
  count?: 1 | 2 | 4
  /** Quality level. */
  quality?: 'draft' | 'standard' | 'hd'
  /** Seed for reproducibility. */
  seed?: number
}

export type ImageGenerateResult = {
  taskId: string
}

/**
 * Submit an image generation task via v2 unified endpoint.
 */
export async function submitImageGenerate(
  request: ImageGenerateRequest,
  options: {
    projectId?: string
    saveDir?: string
    sourceNodeId?: string
  } = {},
): Promise<ImageGenerateResult> {
  const refSrcs = request.referenceImageSrcs?.length
    ? request.referenceImageSrcs
    : []

  const mode = request.mode
    ?? (refSrcs.length > 0 ? 'reference' : 'text')

  const payload: Record<string, unknown> = {
    feature: 'imageGenerate',
    prompt: request.prompt,
    negativePrompt: request.negativePrompt || undefined,
    aspectRatio: request.aspectRatio && request.aspectRatio !== 'auto'
      ? request.aspectRatio : undefined,
    resolution: request.resolution && request.resolution !== '1K'
      ? request.resolution : undefined,
    mode,
    style: request.style || undefined,
    count: request.count,
    quality: request.quality,
    seed: request.seed,
    projectId: options.projectId,
    saveDir: options.saveDir,
    sourceNodeId: options.sourceNodeId,
  }

  if (refSrcs.length > 0) {
    payload.inputs = {
      images: refSrcs.map((url) => ({ url })),
      isSketch: request.isSketch || undefined,
    }
  }

  const result = await submitMediaGenerate(payload)

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || '图片生成任务创建失败'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
