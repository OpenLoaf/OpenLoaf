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
  images?: string[]
  audioUrl?: string
  videoUrl?: string
}

/** Common props shared by all variant form components. */
export interface VariantFormProps {
  /** The selected v3 variant descriptor. */
  variant: V3Variant
  /** Upstream data from connected nodes. */
  upstream: VariantUpstream
  /** URL of the node's existing image resource (for edit/upscale/outpaint). */
  nodeResourceUrl?: string
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
