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
import { ImgGenTextVariant } from './ImgGenTextVariant'
import { ImgGenRefVariant } from './ImgGenRefVariant'
import { ImgInpaintVolcVariant } from './ImgInpaintVolcVariant'
import { ImgStyleVolcVariant } from './ImgStyleVolcVariant'
import { OutpaintQwenVariant } from './OutpaintQwenVariant'
import { UpscaleQwenVariant } from './UpscaleQwenVariant'
import { UpscaleVolcVariant } from './UpscaleVolcVariant'
import { ImgEditWanVariant } from './ImgEditWanVariant'
import { ImgEditPlusVariant } from './ImgEditPlusVariant'

/** Registry mapping v3 variant IDs to their form components. */
export const IMAGE_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  // imageGenerate — text only
  'OL-IG-001': ImgGenTextVariant,
  'OL-IG-002': ImgGenTextVariant,
  'OL-IG-003': ImgGenTextVariant,
  'OL-IG-004': ImgGenTextVariant,
  // imageGenerate — with reference images
  'OL-IG-005': ImgGenRefVariant,
  'OL-IG-006': ImgGenRefVariant,
  // imageInpaint
  'OL-IP-001': ImgInpaintVolcVariant,
  // imageStyleTransfer
  'OL-ST-001': ImgStyleVolcVariant,
  // upscale
  'OL-UP-001': UpscaleQwenVariant,
  'OL-UP-002': UpscaleVolcVariant,
  // outpaint
  'OL-OP-001': OutpaintQwenVariant,
  // imageEdit
  'OL-IE-001': ImgEditWanVariant,
  'OL-IE-002': ImgEditPlusVariant,
}

/** Input constraints for each image variant. */
export const IMAGE_VARIANT_CONSTRAINTS: Record<string, VariantInputConstraints> = {
  'OL-IG-001': { textOnly: true },
  'OL-IG-002': { textOnly: true },
  'OL-IG-003': { textOnly: true },
  'OL-IG-004': { textOnly: true },
  'OL-IG-005': {},
  'OL-IG-006': {},
  'OL-IP-001': { requiresImage: true },
  'OL-ST-001': { requiresImage: true },
  'OL-UP-001': { requiresImage: true },
  'OL-UP-002': { requiresImage: true },
  'OL-OP-001': { requiresImage: true },
  'OL-IE-001': {},
  'OL-IE-002': { requiresImage: true },
}

/** Feature IDs whose variants may use mask painting on the node. */
export const MASK_PAINT_FEATURES = new Set([
  'imageInpaint',
  'imageEdit',
])

/** Variant IDs that support mask painting. */
export const MASK_PAINT_VARIANTS = new Set([
  'OL-IP-001',
  'OL-IE-002',
])

/**
 * Variants where mask is REQUIRED (generate disabled without mask).
 * Other MASK_PAINT_VARIANTS treat mask as optional.
 */
export const MASK_REQUIRED_VARIANTS = new Set([
  'OL-IP-001',
])
