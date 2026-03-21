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
import type { VariantFormProps } from '../types'
import { VidGenQwenVariant } from './VidGenQwenVariant'
import { VidGenVolcVariant } from './VidGenVolcVariant'
import { VidGenKlingVariant } from './VidGenKlingVariant'
import { LipSyncVolcVariant } from './LipSyncVolcVariant'
import { LipSyncKlingVariant } from './LipSyncKlingVariant'

/** Registry mapping variant ids to their form components. */
export const VIDEO_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  'vid-gen-qwen': VidGenQwenVariant,
  'vid-gen-volc': VidGenVolcVariant,
  'vid-gen-kling': VidGenKlingVariant,
  'lip-sync-volc': LipSyncVolcVariant,
  'lip-sync-kling': LipSyncKlingVariant,
}
