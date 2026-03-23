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
import { DigitalHumanQwenVariant } from './DigitalHumanQwenVariant'
import { FaceSwapQwenVariant } from './FaceSwapQwenVariant'
import { LipSyncVolcVariant } from './LipSyncVolcVariant'
import { VidGenQwenVariant } from './VidGenQwenVariant'
import { VidGenVolcVariant } from './VidGenVolcVariant'
import { VideoTranslateVolcVariant } from './VideoTranslateVolcVariant'

/** Video variant definitions — each variant owns its applicability logic. */
export const VIDEO_VARIANTS: Record<string, VariantDefinition> = {
  'OL-VG-001': {
    component: VidGenQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
    acceptsInputTypes: ['image'],
    producesOutputType: 'video',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'startFrame', mediaType: 'image', labelKey: 'slot.startFrame', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  'OL-VG-002': {
    component: VidGenQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
    acceptsInputTypes: ['image'],
    producesOutputType: 'video',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'startFrame', mediaType: 'image', labelKey: 'slot.startFrame', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  'OL-VG-003': {
    component: VidGenVolcVariant,
    isApplicable: () => true,
    acceptsInputTypes: ['image', 'text'],
    producesOutputType: 'video',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'startFrame', mediaType: 'image', labelKey: 'slot.startFrame', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
      { id: 'refs', mediaType: 'image', labelKey: 'slot.referenceImages', min: 0, max: 3, allowManualInput: true, overflowStrategy: 'truncate' },
    ],
  },
  'OL-LS-001': {
    component: LipSyncVolcVariant,
    isApplicable: (ctx) => ctx.hasVideo && ctx.hasAudio,
    acceptsInputTypes: ['video', 'audio'],
    producesOutputType: 'video',
    inputSlots: [
      { id: 'video', mediaType: 'video', labelKey: 'slot.video', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
      { id: 'audio', mediaType: 'audio', labelKey: 'slot.audio', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  'OL-DH-001': {
    component: DigitalHumanQwenVariant,
    isApplicable: (ctx) => ctx.hasImage && ctx.hasAudio,
    acceptsInputTypes: ['image', 'audio'],
    producesOutputType: 'video',
    inputSlots: [
      { id: 'image', mediaType: 'image', labelKey: 'slot.sourceImage', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
      { id: 'audio', mediaType: 'audio', labelKey: 'slot.audio', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  'OL-FS-001': {
    component: FaceSwapQwenVariant,
    isApplicable: (ctx) => ctx.hasImage && ctx.hasVideo,
    acceptsInputTypes: ['image', 'video'],
    producesOutputType: 'video',
    inputSlots: [
      { id: 'face', mediaType: 'image', labelKey: 'slot.face', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
      { id: 'video', mediaType: 'video', labelKey: 'slot.video', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  'OL-FS-002': {
    component: FaceSwapQwenVariant,
    isApplicable: (ctx) => ctx.hasImage && ctx.hasVideo,
    acceptsInputTypes: ['image', 'video'],
    producesOutputType: 'video',
    inputSlots: [
      { id: 'face', mediaType: 'image', labelKey: 'slot.face', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
      { id: 'video', mediaType: 'video', labelKey: 'slot.video', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  'OL-VT-001': {
    component: VideoTranslateVolcVariant,
    isApplicable: (ctx) => ctx.hasVideo,
    acceptsInputTypes: ['video'],
    producesOutputType: 'video',
    inputSlots: [
      { id: 'video', mediaType: 'video', labelKey: 'slot.video', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
}
