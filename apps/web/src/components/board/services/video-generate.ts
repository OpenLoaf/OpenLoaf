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
  /** v3 feature id (e.g. 'videoGenerate', 'lipSync'). */
  feature: string
  /** v3 variant id (e.g. 'OL-VG-001'). */
  variant: string
  /** v3 inputs (images, audio, prompt, person etc.). */
  inputs?: Record<string, unknown>
  /** v3 params (style, duration, aspectRatio etc.). */
  params?: Record<string, unknown>
  /** Number of results to generate. */
  count?: number
  /** Seed for reproducibility. */
  seed?: number
}

export type VideoGenerateResult =
  | { taskId: string }
  | { groupId: string; taskIds: string[] }

/** Submit a video generation task via v3 endpoint. */
export async function submitVideoGenerate(
  request: VideoGenerateRequest,
  options: { projectId?: string; boardId?: string; sourceNodeId?: string },
): Promise<VideoGenerateResult> {
  if (!request.variant.trim()) {
    throw new Error('Video generation requires a variant id')
  }

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
    const message = result?.message || 'Video generation task submission failed'
    throw new Error(message)
  }

  const data = result.data
  if (data.groupId && Array.isArray(data.taskIds)) {
    return { groupId: data.groupId as string, taskIds: data.taskIds as string[] }
  }
  if (!data.taskId) {
    throw new Error(result.message || 'Video generation task submission failed')
  }
  return { taskId: data.taskId as string }
}
