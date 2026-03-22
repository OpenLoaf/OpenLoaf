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
  },
  'OL-VG-002': {
    component: VidGenQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  'OL-VG-003': {
    component: VidGenVolcVariant,
    isApplicable: () => true,
  },
  'OL-LS-001': {
    component: LipSyncVolcVariant,
    isApplicable: (ctx) => ctx.hasImage && ctx.hasAudio,
  },
  'OL-DH-001': {
    component: DigitalHumanQwenVariant,
    isApplicable: (ctx) => ctx.hasImage && ctx.hasAudio,
  },
  'OL-FS-001': {
    component: FaceSwapQwenVariant,
    isApplicable: (ctx) => ctx.hasImage && ctx.hasVideo,
  },
  'OL-FS-002': {
    component: FaceSwapQwenVariant,
    isApplicable: (ctx) => ctx.hasImage && ctx.hasVideo,
  },
  'OL-VT-001': {
    component: VideoTranslateVolcVariant,
    isApplicable: (ctx) => ctx.hasVideo,
  },
}
