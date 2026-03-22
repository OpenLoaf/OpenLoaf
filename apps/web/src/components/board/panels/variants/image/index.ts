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

/** Input constraints for each image variant. */
export const IMAGE_VARIANT_CONSTRAINTS: Record<string, VariantInputConstraints> = {
  'img-gen-qwen': { textOnly: true },
  'img-gen-volc': {}, // accepts optional reference images
  'img-gen-kling': { textOnly: true },
  'img-inpaint-volc': { requiresImage: true },
  'img-style-volc': { requiresImage: true },
  'outpaint-qwen': { requiresImage: true },
  'upscale-qwen': { requiresImage: true },
  'upscale-volc': { requiresImage: true },
}

/** Feature IDs that require mask painting on the node. */
export const MASK_PAINT_FEATURES = new Set([
  'imageInpaint',
])

/** Variant IDs that require mask painting. */
export const MASK_PAINT_VARIANTS = new Set([
  'img-inpaint-volc',
])
