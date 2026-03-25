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
}

export type ImageGenerateResult =
  | { taskId: string }
  | { groupId: string; taskIds: string[] }

/** Submit an image generation task via v3 endpoint. */
export async function submitImageGenerate(
  request: ImageGenerateRequest,
  options: {
    projectId?: string
    boardId?: string
    sourceNodeId?: string
  } = {},
): Promise<ImageGenerateResult> {
  if (!request.variant.trim()) {
    throw new Error('Image generation requires a variant id')
  }

  const result = await submitV3Generate({
    feature: request.feature,
    variant: request.variant,
    inputs: request.inputs,
    params: request.params,
    count: request.count,
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
