/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { submitV3Generate } from '@/lib/saas-media'

export type ImageGenerateRequest = {
  /** v3 feature id (e.g. 'imageGenerate', 'imageInpaint'). */
  feature: string
  /** v3 variant id (e.g. 'OL-IG-001', 'OL-IG-002'). */
  variant: string
  /** v3 inputs (prompt, images, mask, etc.). */
  inputs?: Record<string, unknown>
  /** v3 params (negativePrompt, aspectRatio, quality, etc.). */
  params?: Record<string, unknown>
  /** Number of results to generate. */
  count?: number
  /** Seed for reproducibility. */
  seed?: number
  // ── Backward compat fields (v2) ──
  prompt?: string
  negativePrompt?: string
  aspectRatio?: string
  resolution?: string
  style?: string
  /** @deprecated v2 sub-mode. */
  mode?: 'text' | 'reference' | 'sketch' | 'character'
  /** @deprecated v2 reference images. */
  referenceImageSrcs?: string[]
  /** @deprecated v2 sketch flag. */
  isSketch?: boolean
  /** @deprecated v2 quality. */
  quality?: 'draft' | 'standard' | 'hd'
}

export type ImageGenerateResult =
  | { taskId: string }
  | { groupId: string; taskIds: string[] }

/**
 * Submit an image generation task via v3 endpoint.
 *
 * Accepts v3-format requests (feature + variant + inputs/params).
 * Falls back to v2-style fields for backward compatibility when
 * variant is not provided.
 */
export async function submitImageGenerate(
  request: ImageGenerateRequest,
  options: {
    projectId?: string
    boardId?: string
    sourceNodeId?: string
  } = {},
): Promise<ImageGenerateResult> {
  // v3 path: variant is provided
  if (request.variant) {
    const result = await submitV3Generate({
      feature: request.feature,
      variant: request.variant,
      inputs: request.inputs,
      params: request.params,
      count: request.count,
      seed: request.seed,
      projectId: options.projectId,
      boardId: options.boardId,
      sourceNodeId: options.sourceNodeId,
    })

    if (!result || result.success !== true) {
      const message = result?.message || 'Image generation task creation failed'
      throw new Error(message)
    }

    const data = result.data
    if (data.groupId && Array.isArray(data.taskIds)) {
      return { groupId: data.groupId as string, taskIds: data.taskIds as string[] }
    }
    if (!data.taskId) {
      throw new Error(result.message || 'Image generation task creation failed')
    }
    return { taskId: data.taskId as string }
  }

  // v2 fallback: build v3 payload from legacy fields
  const refSrcs = request.referenceImageSrcs?.length
    ? request.referenceImageSrcs
    : []

  const inputs: Record<string, unknown> = {
    prompt: request.prompt,
  }
  if (refSrcs.length > 0) {
    inputs.images = refSrcs.map((url) => ({ url }))
    if (request.isSketch) inputs.isSketch = true
  }

  const params: Record<string, unknown> = {}
  if (request.negativePrompt) params.negativePrompt = request.negativePrompt
  if (request.aspectRatio && request.aspectRatio !== 'auto') params.aspectRatio = request.aspectRatio
  if (request.resolution && request.resolution !== '1K') params.resolution = request.resolution
  if (request.style) params.style = request.style
  if (request.quality) params.quality = request.quality

  const result = await submitV3Generate({
    feature: request.feature || 'imageGenerate',
    variant: 'OL-IG-001', // default fallback variant
    inputs,
    params,
    count: request.count,
    seed: request.seed,
    projectId: options.projectId,
    boardId: options.boardId,
    sourceNodeId: options.sourceNodeId,
  })

  if (!result || result.success !== true) {
    const message = result?.message || 'Image generation task creation failed'
    throw new Error(message)
  }

  const v2data = result.data
  if (v2data.groupId && Array.isArray(v2data.taskIds)) {
    return { groupId: v2data.groupId as string, taskIds: v2data.taskIds as string[] }
  }
  if (!v2data.taskId) {
    throw new Error(result.message || 'Image generation task creation failed')
  }
  return { taskId: v2data.taskId as string }
}
