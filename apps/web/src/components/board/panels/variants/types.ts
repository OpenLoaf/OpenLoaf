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
import type { V3Variant } from '@/lib/saas-media'

/** Upstream data piped from connected nodes. */
export interface VariantUpstream {
  textContent?: string
  /** Resolved browser-friendly URLs for display/thumbnails. */
  images?: string[]
  /** Raw board-relative paths for API submission (e.g. "asset/xxx.jpg"). */
  imagePaths?: string[]
  audioUrl?: string
  videoUrl?: string
  /** Board context for MediaSlot preview resolution & file saving. */
  boardId?: string
  projectId?: string
  boardFolderUri?: string
}

/** Context passed to variant methods for applicability / capability checks. */
export interface VariantContext {
  /** Whether the node already has an image resource. */
  nodeHasImage: boolean
  /** Whether image input is available (node resource or upstream). */
  hasImage: boolean
  /** Whether audio input is available. */
  hasAudio: boolean
  /** Whether video input is available. */
  hasVideo: boolean
}

/**
 * Object-oriented variant definition.
 * Each variant decides its own applicability and capabilities.
 */
export interface VariantDefinition {
  /** The React form component for this variant. */
  component: ComponentType<VariantFormProps>
  /** Whether this variant is applicable in the given context.
   *  Inapplicable variants are hidden from the UI entirely. */
  isApplicable: (ctx: VariantContext) => boolean
  /** Whether the generate button should be disabled for this variant.
   *  Called only when the variant is applicable. */
  isDisabled?: (ctx: VariantContext) => boolean
  /** Whether this variant uses mask painting on the node image. */
  maskPaint?: boolean
  /** Whether mask painting is required (generate disabled without mask). */
  maskRequired?: boolean
}


/** Snapshot of variant form params — used for caching and restoring. */
export interface VariantParamsSnapshot {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  seed?: number
}

/** Common props shared by all variant form components. */
export interface VariantFormProps {
  /** The selected v3 variant descriptor. */
  variant: V3Variant
  /** Upstream data from connected nodes. */
  upstream: VariantUpstream
  /** Resolved browser-friendly URL of the node's existing image resource (for display). */
  nodeResourceUrl?: string
  /** Raw board-relative path of the node's existing image resource (for API submission). */
  nodeResourcePath?: string
  /** When true, all inputs are disabled (readonly / generating state). */
  disabled?: boolean
  /** Previously cached params for this variant — used to restore form state. */
  initialParams?: VariantParamsSnapshot
  /** Called whenever any form field changes with the latest params snapshot. */
  onParamsChange: (params: VariantParamsSnapshot) => void
  /** Report a blocking warning (e.g. "需要源图片"). Set to null/undefined to clear. */
  onWarningChange?: (warning: string | null) => void
}
