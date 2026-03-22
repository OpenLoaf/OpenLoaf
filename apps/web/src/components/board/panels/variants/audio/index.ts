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
    acceptsInputTypes: ['text'],
    producesOutputType: 'audio',
    inputSlots: [
      { id: 'text', mediaType: 'text', labelKey: 'slot.text', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'replace' },
    ],
  },
  'OL-TT-002': {
    component: TtsQwenVariant,
    isApplicable: () => true,
    acceptsInputTypes: ['text'],
    producesOutputType: 'audio',
    inputSlots: [
      { id: 'text', mediaType: 'text', labelKey: 'slot.text', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'replace' },
    ],
  },
  // speechToText — requires audio input
  'OL-SR-001': {
    component: SpeechToTextVariant,
    isApplicable: (ctx) => ctx.hasAudio,
    acceptsInputTypes: ['audio'],
    producesOutputType: 'text',
    inputSlots: [
      { id: 'audio', mediaType: 'audio', labelKey: 'slot.audio', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
}
