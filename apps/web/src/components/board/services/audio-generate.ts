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

export type AudioGenerateRequest = {
  /** Text to synthesize (SDK v2 TTS 'text' field). */
  text: string
  /** Voice preset ID. */
  voice?: string
  /** Reference audio for voice cloning. */
  referenceAudioSrc?: string
  /** Output format. */
  format?: 'mp3' | 'wav' | 'opus'
  /** Output sample rate. */
  sampleRate?: number
  /** Quality level. */
  quality?: 'draft' | 'standard' | 'hd'
  /** Seed for reproducibility. */
  seed?: number
}

export type AudioGenerateResult = {
  taskId: string
}

/**
 * Submit a TTS task via v2 unified endpoint.
 */
export async function submitAudioGenerate(
  request: AudioGenerateRequest,
  options: { projectId?: string; saveDir?: string; sourceNodeId?: string },
): Promise<AudioGenerateResult> {
  const payload: Record<string, unknown> = {
    feature: 'tts',
    text: request.text,
    voice: request.voice || undefined,
    quality: request.quality,
    seed: request.seed,
    projectId: options.projectId,
    saveDir: options.saveDir,
    sourceNodeId: options.sourceNodeId,
  }

  // Voice cloning via reference audio
  if (request.referenceAudioSrc) {
    payload.referenceAudio = { url: request.referenceAudioSrc }
  }

  // Output configuration
  if (request.format || request.sampleRate) {
    payload.output = {
      format: request.format || undefined,
      sampleRate: request.sampleRate || undefined,
    }
  }

  const result = await submitMediaGenerate(payload)

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || '语音合成任务创建失败'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
