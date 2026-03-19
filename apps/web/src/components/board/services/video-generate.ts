/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { submitVideoTask } from '@/lib/saas-media'

export type VideoGenerateRequest = {
  prompt: string
  modelId?: string
  aspectRatio?: string
  duration?: number // 5 or 10
  firstFrameImageSrc?: string // first-frame reference image
}

export type VideoGenerateResult = {
  taskId: string
}

/**
 * Submit a video generation task to the SaaS proxy.
 * Returns the server-assigned taskId for subsequent polling via LoadingNode.
 */
export async function submitVideoGenerate(
  request: VideoGenerateRequest,
  options: { projectId?: string; saveDir?: string; sourceNodeId?: string },
): Promise<VideoGenerateResult> {
  const payload: Record<string, unknown> = {
    modelId: request.modelId || 'auto',
    prompt: request.prompt,
  }

  if (request.aspectRatio) {
    payload.output = { aspectRatio: request.aspectRatio }
  }

  if (request.duration) {
    payload.parameters = { duration: request.duration }
  }

  if (request.firstFrameImageSrc) {
    payload.input = { image: request.firstFrameImageSrc }
  }

  // Attach storage context for server-side asset saving.
  if (options.projectId) payload.projectId = options.projectId
  if (options.saveDir) payload.saveDir = options.saveDir
  if (options.sourceNodeId) payload.sourceNodeId = options.sourceNodeId

  const result = await submitVideoTask(payload as any)

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || result?.error || 'Video generation task submission failed'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
