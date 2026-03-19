/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { submitImageTask } from '@/lib/saas-media'

export type UpscaleRequest = {
  sourceImageSrc: string
  scale: number // 2 or 4
  modelId?: string
}

export type UpscaleResult = {
  taskId: string
}

/**
 * Submit an HD upscale task to the SaaS proxy.
 * Returns a taskId that can be used with LoadingNode for polling.
 *
 * NOTE: The SaaS backend does not yet expose a dedicated upscale endpoint.
 * For now we piggyback on the image task API with an `upscale` flag in the
 * payload. Once a real `/ai/image/upscale` route is available, update the
 * fetch call below accordingly.
 */
export async function submitUpscale(
  request: UpscaleRequest,
  options: { projectId?: string; saasAccessToken?: string } = {},
): Promise<UpscaleResult> {
  const modelId =
    request.modelId && request.modelId !== 'auto' ? request.modelId : ''

  const payload: Record<string, unknown> = {
    modelId,
    // Signal the server that this is an upscale task (not a generation task).
    taskType: 'upscale',
    parameters: { scale: request.scale },
    inputs: {
      images: [{ url: request.sourceImageSrc }],
    },
    projectId: options.projectId,
  }

  try {
    const result = await submitImageTask(payload as any)

    if (result?.success === true && result.data?.taskId) {
      return { taskId: result.data.taskId as string }
    }

    // Fall through to mock when the server does not recognise the upscale task
    // type (e.g. returns an error or empty response).
  } catch {
    // Server endpoint unavailable – fall through to mock.
  }

  // ── Mock fallback ──────────────────────────────────────────────────────
  // Remove this block once the real upscale API is deployed.
  return { taskId: `mock-upscale-${Date.now()}` }
}
