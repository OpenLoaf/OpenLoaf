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
import { ImgGenQwenVariant } from './ImgGenQwenVariant'
import { ImgGenVolcVariant } from './ImgGenVolcVariant'
import { ImgGenKlingVariant } from './ImgGenKlingVariant'
import { ImgInpaintVolcVariant } from './ImgInpaintVolcVariant'
import { ImgStyleVolcVariant } from './ImgStyleVolcVariant'
import { OutpaintQwenVariant } from './OutpaintQwenVariant'
import { UpscaleQwenVariant } from './UpscaleQwenVariant'
import { UpscaleVolcVariant } from './UpscaleVolcVariant'

/** Registry mapping v3 variant IDs to their form components. */
export const IMAGE_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  'img-gen-qwen': ImgGenQwenVariant,
  'img-gen-volc': ImgGenVolcVariant,
  'img-gen-kling': ImgGenKlingVariant,
  'img-inpaint-volc': ImgInpaintVolcVariant,
  'img-style-volc': ImgStyleVolcVariant,
  'outpaint-qwen': OutpaintQwenVariant,
  'upscale-qwen': UpscaleQwenVariant,
  'upscale-volc': UpscaleVolcVariant,
}

/** Feature IDs that require mask painting on the node. */
export const MASK_PAINT_FEATURES = new Set([
  'imageInpaint',
])

/** Variant IDs that require mask painting. */
export const MASK_PAINT_VARIANTS = new Set([
  'img-inpaint-volc',
])
