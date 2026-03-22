/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { VariantDefinition } from '../types'
import { SpeechToTextVariant } from './SpeechToTextVariant'
import { TtsQwenVariant } from './TtsQwenVariant'

/** Audio variant definitions — each variant owns its applicability logic. */
export const AUDIO_VARIANTS: Record<string, VariantDefinition> = {
  // tts — always available (text input from upstream or manual)
  'OL-TT-001': {
    component: TtsQwenVariant,
    isApplicable: () => true,
  },
  'OL-TT-002': {
    component: TtsQwenVariant,
    isApplicable: () => true,
  },
  // speechToText — requires audio input
  'OL-SR-001': {
    component: SpeechToTextVariant,
    isApplicable: (ctx) => ctx.hasAudio,
  },
}
