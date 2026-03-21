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

export type VideoGenerateRequest = {
  prompt: string
  aspectRatio?: string
  duration?: 5 | 10 | 15
  /** videoGenerate sub-mode. */
  mode?: 'text' | 'firstFrame' | 'startEnd' | 'reference' | 'storyboard' | 'withAudio' | 'motionControl'
  /** First frame image for firstFrame/motionControl modes. */
  firstFrameImageSrc?: string
  /** End frame image for startEnd mode. */
  endFrameImageSrc?: string
  /** Reference images for reference mode. */
  referenceImageSrcs?: string[]
  /** Whether to generate audio alongside video. */
  withAudio?: boolean
  /** Number of results to generate. */
  count?: 1 | 2 | 4
  /** Quality level. */
  quality?: 'draft' | 'standard' | 'hd'
  /** Seed for reproducibility. */
  seed?: number
  /** Style preset. */
  style?: string
  /** Negative prompt. */
  negativePrompt?: string
}

export type VideoGenerateResult = {
  taskId: string
}

/**
 * Submit a video generation task via v2 unified endpoint.
 */
export async function submitVideoGenerate(
  request: VideoGenerateRequest,
  options: { projectId?: string; saveDir?: string; sourceNodeId?: string },
): Promise<VideoGenerateResult> {
  const mode = request.mode
    ?? (request.firstFrameImageSrc ? 'firstFrame' : 'text')

  const payload: Record<string, unknown> = {
    feature: 'videoGenerate',
    prompt: request.prompt,
    aspectRatio: request.aspectRatio && request.aspectRatio !== 'auto'
      ? request.aspectRatio : undefined,
    duration: request.duration ?? 5,
    mode,
    style: request.style || undefined,
    negativePrompt: request.negativePrompt || undefined,
    count: request.count,
    quality: request.quality,
    seed: request.seed,
    withAudio: request.withAudio || undefined,
    projectId: options.projectId,
    saveDir: options.saveDir,
    sourceNodeId: options.sourceNodeId,
  }

  // Build inputs based on mode
  const inputs: Record<string, unknown> = {}
  if (request.firstFrameImageSrc) {
    inputs.startImage = { url: request.firstFrameImageSrc }
  }
  if (request.endFrameImageSrc) {
    inputs.endImage = { url: request.endFrameImageSrc }
  }
  if (request.referenceImageSrcs?.length) {
    inputs.images = request.referenceImageSrcs.map(url => ({ url }))
  }
  if (Object.keys(inputs).length > 0) {
    payload.inputs = inputs
  }

  const result = await submitMediaGenerate(payload)

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || 'Video generation task submission failed'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
