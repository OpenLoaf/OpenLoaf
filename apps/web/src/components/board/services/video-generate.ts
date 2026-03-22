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

// ---------------------------------------------------------------------------
// v3 request / result types
// ---------------------------------------------------------------------------

export type VideoGenerateRequest = {
  /** v3 feature id (e.g. 'videoGenerate', 'lipSync'). Defaults to 'videoGenerate'. */
  feature?: string
  /** v3 variant id (e.g. 'OL-VG-001'). Optional for legacy callers. */
  variant?: string
  /** v3 inputs (images, audio, prompt, person etc.). */
  inputs?: Record<string, unknown>
  /** v3 params (style, duration, aspectRatio etc.). */
  params?: Record<string, unknown>
  /** Number of results to generate. */
  count?: number
  /** Seed for reproducibility. */
  seed?: number

  // ── Legacy fields (backward compat -- mapped to v3 format) ──
  /** @deprecated Use params.prompt or inputs.prompt instead. */
  prompt?: string
  /** @deprecated Use params.aspectRatio instead. */
  aspectRatio?: string
  /** @deprecated Use params.duration instead. */
  duration?: number
  /** @deprecated Use variant-specific mode in params. */
  mode?: string
  /** @deprecated Use inputs.startImage instead. */
  firstFrameImageSrc?: string
  /** @deprecated Use inputs.endImage instead. */
  endFrameImageSrc?: string
  /** @deprecated Use inputs.images instead. */
  referenceImageSrcs?: string[]
  /** @deprecated Use params.withAudio instead. */
  withAudio?: boolean
  /** @deprecated Use params.quality instead. */
  quality?: string
  /** @deprecated Use params.style instead. */
  style?: string
  /** @deprecated Use params.negativePrompt instead. */
  negativePrompt?: string
}

export type VideoGenerateResult = {
  taskId: string
}

/**
 * Submit a video generation task via v3 endpoint.
 *
 * When `variant` is present the request is forwarded directly to the v3 API.
 * For backward compatibility, legacy fields are mapped to v3 format when
 * `variant` is not provided (e.g. retry from old version stack entries).
 */
export async function submitVideoGenerate(
  request: VideoGenerateRequest,
  options: { projectId?: string; boardId?: string; sourceNodeId?: string },
): Promise<VideoGenerateResult> {
  // ── v3 path (new callers supply feature + variant) ──
  if (request.variant) {
    const result = await submitV3Generate({
      feature: request.feature || 'videoGenerate',
      variant: request.variant,
      inputs: request.inputs,
      params: request.params,
      count: request.count,
      seed: request.seed,
      projectId: options.projectId,
      boardId: options.boardId,
      sourceNodeId: options.sourceNodeId,
    })

    if (!result || result.success !== true || !result.data?.taskId) {
      const message = result?.message || 'Video generation task submission failed'
      throw new Error(message)
    }

    return { taskId: result.data.taskId as string }
  }

  // ── Legacy fallback (old callers without variant) ──
  // Build v3 inputs/params from legacy fields so the server can route.
  const inputs: Record<string, unknown> = { ...request.inputs }
  const params: Record<string, unknown> = { ...request.params }

  if (request.prompt) {
    params.prompt = request.prompt
  }
  if (request.aspectRatio && request.aspectRatio !== 'auto') {
    params.aspectRatio = request.aspectRatio
  }
  if (request.duration) {
    params.duration = request.duration
  }
  if (request.style) {
    params.style = request.style
  }
  if (request.quality) {
    params.quality = request.quality
  }
  if (request.withAudio) {
    params.withAudio = true
  }
  if (request.negativePrompt) {
    params.negativePrompt = request.negativePrompt
  }
  if (request.mode) {
    params.mode = request.mode
  }
  if (request.firstFrameImageSrc) {
    inputs.startImage = { url: request.firstFrameImageSrc }
  }
  if (request.endFrameImageSrc) {
    inputs.endImage = { url: request.endFrameImageSrc }
  }
  if (request.referenceImageSrcs?.length) {
    inputs.images = request.referenceImageSrcs.map((url) => ({ url }))
  }

  const result = await submitV3Generate({
    feature: request.feature || 'videoGenerate',
    variant: 'OL-VG-003', // Default variant for legacy callers
    inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
    params: Object.keys(params).length > 0 ? params : undefined,
    count: request.count,
    seed: request.seed,
    projectId: options.projectId,
    boardId: options.boardId,
    sourceNodeId: options.sourceNodeId,
  })

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || 'Video generation task submission failed'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
