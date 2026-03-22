/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ComponentType } from 'react'
import type { VariantFormProps, VariantInputConstraints } from '../types'
import { VidGenQwenVariant } from './VidGenQwenVariant'
import { VidGenVolcVariant } from './VidGenVolcVariant'
import { LipSyncVolcVariant } from './LipSyncVolcVariant'

/** Input constraints for each video variant. */
export const VIDEO_VARIANT_CONSTRAINTS: Record<string, VariantInputConstraints> = {
  'OL-VG-001': { requiresImage: true },
  'OL-VG-002': { requiresImage: true },
  'OL-VG-003': {},
  'OL-LS-001': { requiresImage: true, requiresAudio: true },
}

/** Registry mapping variant ids to their form components. */
export const VIDEO_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  'OL-VG-001': VidGenQwenVariant,
  'OL-VG-002': VidGenQwenVariant,
  'OL-VG-003': VidGenVolcVariant,
  'OL-LS-001': LipSyncVolcVariant,
}
