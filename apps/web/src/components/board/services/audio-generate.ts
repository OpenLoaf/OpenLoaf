/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

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
 * Submit an audio generation task.
 *
 * Currently a mock implementation — returns an immediate local taskId.
 * Will be replaced with a real SaaS proxy call once the audio generation
 * backend is available.
 */
export async function submitAudioGenerate(
  _request: AudioGenerateRequest,
  _options: { projectId?: string; saveDir?: string; sourceNodeId?: string },
): Promise<AudioGenerateResult> {
  // Mock implementation — no real backend yet.
  return { taskId: `mock-audio-${Date.now()}` }
}
