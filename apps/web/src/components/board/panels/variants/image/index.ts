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
import { ImgGenVolcVariant } from './ImgGenVolcVariant'
import { MatExtractVolcVariant } from './MatExtractVolcVariant'

/** Image variant definitions — each variant owns its applicability logic. */
export const IMAGE_VARIANTS: Record<string, VariantDefinition> = {
  // imageGenerate — text-to-image (not applicable when any image exists)
  'OL-IG-001': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.hasImage,
    acceptsInputTypes: ['text'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
    ],
  },
  'OL-IG-002': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.hasImage,
    acceptsInputTypes: ['text'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
    ],
  },
  'OL-IG-003': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.hasImage,
    acceptsInputTypes: ['text'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
    ],
  },
  'OL-IG-004': {
    component: ImgGenTextVariant,
    isApplicable: (ctx) => !ctx.hasImage,
    acceptsInputTypes: ['text'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
    ],
  },
  // imageGenerate — Volcengine (Jimeng) text-to-image with optional reference images
  'OL-IG-005': {
    component: ImgGenVolcVariant,
    isApplicable: () => true,
    acceptsInputTypes: ['text', 'image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'images', mediaType: 'image', labelKey: 'slot.referenceImages', min: 0, max: 4, allowManualInput: true, overflowStrategy: 'truncate' },
    ],
  },
  'OL-IG-006': {
    component: ImgGenVolcVariant,
    isApplicable: () => true,
    acceptsInputTypes: ['text', 'image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'images', mediaType: 'image', labelKey: 'slot.referenceImages', min: 0, max: 4, allowManualInput: true, overflowStrategy: 'truncate' },
    ],
  },
  // imageInpaint — requires node's own image for mask painting
  'OL-IP-001': {
    component: ImgInpaintVolcVariant,
    isApplicable: (ctx) => ctx.nodeHasImage,
    maskPaint: true,
    maskRequired: true,
    acceptsInputTypes: ['image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'image', mediaType: 'image', labelKey: 'slot.sourceImage', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  // imageStyleTransfer (requires image: node or upstream)
  'OL-ST-001': {
    component: ImgStyleVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
    acceptsInputTypes: ['image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'style', mediaType: 'image', labelKey: 'slot.style', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  'OL-ST-002': {
    component: ImgStyleVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
    acceptsInputTypes: ['image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'style', mediaType: 'image', labelKey: 'slot.style', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  // upscale (requires image: node or upstream)
  'OL-UP-001': {
    component: UpscaleQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
    acceptsInputTypes: ['image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'image', mediaType: 'image', labelKey: 'slot.sourceImage', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  // outpaint (requires image: node or upstream)
  'OL-OP-001': {
    component: OutpaintQwenVariant,
    isApplicable: (ctx) => ctx.hasImage,
    acceptsInputTypes: ['image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'image', mediaType: 'image', labelKey: 'slot.sourceImage', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
  // imageEdit — Plus (qwen-image-edit-plus, mask support)
  'OL-IE-001': {
    component: ImgEditPlusVariant,
    isApplicable: (ctx) => ctx.hasImage,
    maskPaint: true,
    acceptsInputTypes: ['image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'images', mediaType: 'image', labelKey: 'slot.referenceImages', min: 1, max: 3, allowManualInput: true, overflowStrategy: 'truncate' },
    ],
  },
  // imageEdit — Wan (wan2.6, enable_interleave)
  'OL-IE-002': {
    component: ImgEditWanVariant,
    isApplicable: (ctx) => ctx.hasImage,
    acceptsInputTypes: ['image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
      { id: 'images', mediaType: 'image', labelKey: 'slot.referenceImages', min: 0, max: 4, allowManualInput: true, overflowStrategy: 'truncate' },
    ],
  },
  // materialExtract (requires image: node or upstream)
  'OL-ME-001': {
    component: MatExtractVolcVariant,
    isApplicable: (ctx) => ctx.hasImage,
    acceptsInputTypes: ['image'],
    producesOutputType: 'image',
    inputSlots: [
      { id: 'image', mediaType: 'image', labelKey: 'slot.sourceImage', min: 1, max: 1, allowManualInput: true, overflowStrategy: 'rotate' },
    ],
  },
}

/** Feature IDs whose variants may use mask painting on the node. */
export const MASK_PAINT_FEATURES = new Set([
  'imageInpaint',
  'imageEdit',
])
