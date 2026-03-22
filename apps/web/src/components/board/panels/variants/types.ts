/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
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

/**
 * Declares what inputs a variant accepts/requires.
 * Used by panels to auto-filter incompatible variants and control input passing.
 */
export type VariantInputConstraints = {
  /** When true, the variant is pure text-to-media — node images and upstream images
   *  should NOT be passed as input. */
  textOnly?: boolean
  /** When true, variant requires the node to already have an image resource. */
  requiresImage?: boolean
  /** When true, variant requires audio input (from upstream or manual upload). */
  requiresAudio?: boolean
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
  /** Called whenever any form field changes with the latest params snapshot. */
  onParamsChange: (params: {
    inputs: Record<string, unknown>
    params: Record<string, unknown>
    count?: number
    seed?: number
  }) => void
  /** Report a blocking warning (e.g. "需要源图片"). Set to null/undefined to clear. */
  onWarningChange?: (warning: string | null) => void
}
