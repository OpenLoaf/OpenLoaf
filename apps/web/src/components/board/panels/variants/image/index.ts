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
import { ImgGenTextVariant } from './ImgGenTextVariant'
import { ImgInpaintVolcVariant } from './ImgInpaintVolcVariant'
import { ImgStyleVolcVariant } from './ImgStyleVolcVariant'
import { OutpaintQwenVariant } from './OutpaintQwenVariant'
import { UpscaleQwenVariant } from './UpscaleQwenVariant'
import { ImgEditWanVariant } from './ImgEditWanVariant'
import { ImgEditPlusVariant } from './ImgEditPlusVariant'
import { MatExtractVolcVariant } from './MatExtractVolcVariant'

/** Image variant definitions — each variant owns its applicability logic. */
export const IMAGE_VARIANTS: Record<string, VariantDefinition> = {
  // imageGenerate — text-to-image (not applicable when any image exists)
  'OL-IG-001': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.hasImage,
  },
  'OL-IG-002': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.hasImage,
  },
  'OL-IG-003': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.hasImage,
  },
  // imageInpaint — requires node's own image for mask painting
  'OL-IP-001': {
    component: ImgInpaintVolcVariant,
    isApplicable: (ctx) => ctx.nodeHasImage,
    maskPaint: true,
    maskRequired: true,
  },
  // imageStyleTransfer (requires image: node or upstream)
  'OL-ST-001': {
    component: ImgStyleVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  'OL-ST-002': {
    component: ImgStyleVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  // upscale (requires image: node or upstream)
  'OL-UP-001': {
    component: UpscaleQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  // outpaint (requires image: node or upstream)
  'OL-OP-001': {
    component: OutpaintQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  // imageEdit — Plus (requires image + optional mask)
  'OL-IE-001': {
    component: ImgEditPlusVariant,
    isApplicable: (ctx) => ctx.hasImage,
    maskPaint: true,
  },
  // imageEdit — Wan (requires image: node or upstream)
  'OL-IE-002': {
    component: ImgEditWanVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  // materialExtract (requires image: node or upstream)
  'OL-ME-001': {
    component: MatExtractVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
}

/** Feature IDs whose variants may use mask painting on the node. */
export const MASK_PAINT_FEATURES = new Set([
  'imageInpaint',
  'imageEdit',
])
