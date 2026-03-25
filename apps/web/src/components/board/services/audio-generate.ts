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

export type AudioGenerateRequest = {
  /** v3 feature ID (e.g. 'tts'). */
  feature: string
  /** v3 variant ID (e.g. 'OL-TT-001'). */
  variant: string
  /** Input data (e.g. { text: '...' }). */
  inputs: Record<string, unknown>
  /** Generation parameters (e.g. { voice: '...', format: 'mp3' }). */
  params: Record<string, unknown>
  /** Number of outputs. */
  count?: number
  /** Seed for reproducibility. */
  seed?: number
}

export type AudioGenerateResult =
  | { taskId: string }
  | { groupId: string; taskIds: string[] }

/**
 * Submit a TTS task via v3 unified endpoint.
 */
export async function submitAudioGenerate(
  request: AudioGenerateRequest,
  options: { projectId?: string; boardId?: string; sourceNodeId?: string },
): Promise<AudioGenerateResult> {
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
    const message = result?.message || 'Audio generation task creation failed'
    throw new Error(message)
  }

  const data = result.data
  if (data.groupId && Array.isArray(data.taskIds)) {
    return { groupId: data.groupId as string, taskIds: data.taskIds as string[] }
  }
  if (!data.taskId) {
    throw new Error(result.message || 'Audio generation task creation failed')
  }
  return { taskId: data.taskId as string }
}
