/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * useCrossModalTargets — cross-modal derive suggestions for a source node.
 *
 * Given the source node's media type, scans all four category capabilities
 * (image/video/audio/text) for features whose variants have at least one
 * input slot accepting that type. Returns ONE entry per matching feature,
 * labelled with the feature's displayName.
 *
 * Cross-modal variants are authoritatively registered in the TARGET
 * category. This hook only projects shortcuts onto the source side — no
 * duplicated registry, new features bubble up automatically.
 */

import { useEffect, useMemo } from 'react'
import {
  useCapabilities,
  ensureAllCapabilitiesLoaded,
} from '@/hooks/use-capabilities'
import type {
  CapabilitiesCategory,
  V3Feature,
  V3Variant,
} from '@/lib/saas-media'
import type { MediaType } from '../variants/slot-types'

export interface CrossModalTarget {
  /** Target node category (also determines new node type). */
  targetCategory: CapabilitiesCategory
  /** Target node type for deriveNode. */
  targetType: 'image' | 'video' | 'audio' | 'text'
  /** Feature matched by this chip. */
  feature: V3Feature
  /** Variant within the feature that best consumes the source type. */
  variant: V3Variant
  /** The source-accepting slot role on the chosen variant. */
  sourceSlotRole: string
  /** Chip label — feature displayName (falls back to feature id). */
  label: string
}

/**
 * Pick the first variant in `feature` whose inputSlots accept `sourceType`.
 * Returns the matched variant together with the accepting slot role.
 */
function pickVariantForSource(
  feature: V3Feature,
  sourceType: MediaType,
): { variant: V3Variant; role: string } | null {
  for (const variant of feature.variants) {
    const slots = variant.inputSlots ?? []
    for (const slot of slots) {
      if (slot.accept === sourceType) {
        return { variant, role: slot.role }
      }
    }
  }
  return null
}

export interface UseCrossModalTargetsOptions {
  /** Source node's primary media type. */
  sourceType: MediaType
  /** Current UI language ('zh' | 'en'). */
  lang: 'zh' | 'en'
}

/**
 * Build the cross-modal target list for a source node.
 *
 * Returns one chip per feature (across all four categories, excluding the
 * source category) whose variants can consume the source media type.
 * Order is stable: video → text → audio → image, then by feature order
 * within each category.
 */
export function useCrossModalTargets({
  sourceType,
  lang: _lang,
}: UseCrossModalTargetsOptions): CrossModalTarget[] {
  // Trigger prefetch of all capabilities on first mount. Idempotent.
  useEffect(() => {
    ensureAllCapabilitiesLoaded()
  }, [])

  const image = useCapabilities('image')
  const video = useCapabilities('video')
  const audio = useCapabilities('audio')
  const text = useCapabilities('text')

  return useMemo(() => {
    const sources: Array<{
      category: CapabilitiesCategory
      features: V3Feature[] | undefined
    }> = [
      { category: 'video', features: video.data?.features },
      { category: 'text', features: text.data?.features },
      { category: 'audio', features: audio.data?.features },
      { category: 'image', features: image.data?.features },
    ]

    const out: CrossModalTarget[] = []
    for (const { category, features } of sources) {
      if (category === sourceType) continue
      if (!features || features.length === 0) continue
      for (const feature of features) {
        const pick = pickVariantForSource(feature, sourceType)
        if (!pick) continue
        const label = feature.displayName?.trim() || feature.id
        out.push({
          targetCategory: category,
          targetType: category,
          feature,
          variant: pick.variant,
          sourceSlotRole: pick.role,
          label,
        })
      }
    }
    return out
  }, [sourceType, image.data, video.data, audio.data, text.data])
}
