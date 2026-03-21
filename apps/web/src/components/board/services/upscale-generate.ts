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

export type UpscaleRequest = {
  sourceImageSrc: string
  scale: 2 | 4
}

export type UpscaleResult = {
  taskId: string
}

/**
 * Submit an upscale task via v2 unified endpoint.
 * SDK v2 has native upscale support as a first-class feature.
 */
export async function submitUpscale(
  request: UpscaleRequest,
  options: { projectId?: string; saveDir?: string; sourceNodeId?: string } = {},
): Promise<UpscaleResult> {
  const payload: Record<string, unknown> = {
    feature: 'upscale',
    scale: request.scale,
    inputs: {
      image: { url: request.sourceImageSrc },
    },
    projectId: options.projectId,
    saveDir: options.saveDir,
    sourceNodeId: options.sourceNodeId,
  }

  const result = await submitMediaGenerate(payload)

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || 'Upscale task submission failed'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
