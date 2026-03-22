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
import { ImgGenRefVariant } from './ImgGenRefVariant'
import { ImgInpaintVolcVariant } from './ImgInpaintVolcVariant'
import { ImgStyleVolcVariant } from './ImgStyleVolcVariant'
import { OutpaintQwenVariant } from './OutpaintQwenVariant'
import { UpscaleQwenVariant } from './UpscaleQwenVariant'
import { UpscaleVolcVariant } from './UpscaleVolcVariant'
import { ImgEditWanVariant } from './ImgEditWanVariant'
import { ImgEditPlusVariant } from './ImgEditPlusVariant'

/** Image variant definitions — each variant owns its applicability logic. */
export const IMAGE_VARIANTS: Record<string, VariantDefinition> = {
  // imageGenerate — text only (not applicable when node already has image)
  'OL-IG-001': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.nodeHasImage,
  },
  'OL-IG-002': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.nodeHasImage,
  },
  'OL-IG-003': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.nodeHasImage,
  },
  'OL-IG-004': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.nodeHasImage,
  },
  // imageGenerate — with reference images (always applicable)
  'OL-IG-005': {
    component: ImgGenRefVariant,
    isApplicable: () => true,
  },
  'OL-IG-006': {
    component: ImgGenRefVariant,
    isApplicable: () => true,
  },
  // imageInpaint (requires image + mask)
  'OL-IP-001': {
    component: ImgInpaintVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
    maskPaint: true,
    maskRequired: true,
  },
  // imageStyleTransfer (requires image)
  'OL-ST-001': {
    component: ImgStyleVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  // upscale (requires image)
  'OL-UP-001': {
    component: UpscaleQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  'OL-UP-002': {
    component: UpscaleVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  // outpaint (requires image)
  'OL-OP-001': {
    component: OutpaintQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
  },
  // imageEdit (always applicable)
  'OL-IE-001': {
    component: ImgEditWanVariant,
    isApplicable: () => true,
  },
  // imageEdit (requires image + optional mask)
  'OL-IE-002': {
    component: ImgEditPlusVariant,
    isApplicable: (ctx) => ctx.hasImage,
    maskPaint: true,
  },
}

/** Feature IDs whose variants may use mask painting on the node. */
export const MASK_PAINT_FEATURES = new Set([
  'imageInpaint',
  'imageEdit',
])
