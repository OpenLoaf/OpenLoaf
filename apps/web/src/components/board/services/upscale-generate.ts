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

export type UpscaleRequest = {
  sourceImageSrc: string
  scale: 2 | 4
  /** v3 variant id (e.g. 'OL-UP-001', 'OL-UP-002'). Defaults to 'OL-UP-001'. */
  variant?: string
}

export type UpscaleResult = {
  taskId: string
}

/**
 * Submit an upscale task via v3 endpoint.
 */
export async function submitUpscale(
  request: UpscaleRequest,
  options: { projectId?: string; boardId?: string; sourceNodeId?: string } = {},
): Promise<UpscaleResult> {
  const result = await submitV3Generate({
    feature: 'upscale',
    variant: request.variant ?? 'OL-UP-001',
    inputs: {
      image: { url: request.sourceImageSrc },
    },
    params: {
      scale: request.scale,
    },
    projectId: options.projectId,
    boardId: options.boardId,
    sourceNodeId: options.sourceNodeId,
  })

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || 'Upscale task submission failed'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
