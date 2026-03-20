/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { submitAudioTask } from '@/lib/saas-media'

export type AudioGenerateRequest = {
  prompt: string
  modelId?: string
  audioType?: 'music' | 'voiceover' | 'sfx'
  duration?: number
}

export type AudioGenerateResult = {
  taskId: string
}

/**
 * Submit an audio generation task via SaaS proxy.
 *
 * Maps the board-level request into the SDK's AiAudioRequest format:
 *   - prompt → text
 *   - audioType / duration → parameters
 */
export async function submitAudioGenerate(
  request: AudioGenerateRequest,
  options: { projectId?: string; saveDir?: string; sourceNodeId?: string },
): Promise<AudioGenerateResult> {
  const modelId = request.modelId && request.modelId !== 'auto'
    ? request.modelId
    : 'auto'

  const parameters: Record<string, unknown> = {}
  if (request.audioType) parameters.audioType = request.audioType
  if (request.duration != null) parameters.duration = request.duration

  const result = await submitAudioTask({
    modelId,
    text: request.prompt,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    projectId: options.projectId,
    saveDir: options.saveDir,
    sourceNodeId: options.sourceNodeId,
  })

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || '音频生成任务创建失败'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
