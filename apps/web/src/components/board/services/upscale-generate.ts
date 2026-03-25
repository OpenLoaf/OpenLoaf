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
  /** 兼容旧调用：接受 number (2|4) 或 string ("4K"|"8K") */
  scale: 2 | 4 | '4K' | '8K'
  /** v3 variant id (e.g. 'OL-UP-001', 'OL-UP-002'). Defaults to 'OL-UP-001'. */
  variant?: string
}

export type UpscaleResult =
  | { taskId: string }
  | { groupId: string; taskIds: string[] }

/** 将 legacy number scale 映射为 v3 string scale */
export function normalizeScale(scale: 2 | 4 | '4K' | '8K'): '4K' | '8K' {
  if (scale === 2 || scale === '4K') return '4K'
  if (scale === 4 || scale === '8K') return '8K'
  return '4K'
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
      scale: normalizeScale(request.scale),
    },
    projectId: options.projectId,
    boardId: options.boardId,
    sourceNodeId: options.sourceNodeId,
  })

  if (!result || result.success !== true) {
    const message = result?.message || 'Upscale task submission failed'
    throw new Error(message)
  }

  const data = result.data
  if (data.groupId && Array.isArray(data.taskIds)) {
    return { groupId: data.groupId as string, taskIds: data.taskIds as string[] }
  }
  if (!data.taskId) {
    throw new Error(result.message || 'Upscale task submission failed')
  }
  return { taskId: data.taskId as string }
}
