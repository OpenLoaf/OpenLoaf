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
import { TtsQwenVariant } from './TtsQwenVariant'

/** Registry mapping variant IDs to their form components for audio features. */
export const AUDIO_VARIANT_REGISTRY: Record<
  string,
  ComponentType<VariantFormProps>
> = {
  'OL-TT-001': TtsQwenVariant,
}
