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
 * useVariantPanel — shared hook for all three AI panels (Image, Video, Audio).
 *
 * Pure API-driven: no local variant registry. Applicability is inferred from
 * inputSlots, slots are converted directly from API data.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCapabilities } from '@/hooks/use-capabilities'
import type { V3Feature, V3Variant, CapabilitiesCategory } from '@/lib/saas-media'
import type { ParamField } from '../variants/types'
import type { AnySlot, MediaType } from '../variants/slot-types'
import { remoteSchemaToParamFields } from '../variants/remote-param-schema'
import { inferApplicability, apiSlotsToAnySlots } from '../variants/slot-conventions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantPanelOptions {
  /** Category for capabilities API */
  category: CapabilitiesCategory
  /** Node's own media type (if it has a resource) */
  nodeMediaType?: MediaType
  /** Media types available from upstream connections */
  upstreamTypes: Set<MediaType>
  /** Initial feature ID (from cached config or default) */
  initialFeatureId?: string
  /** Cached feature ID from aiConfig */
  cachedFeatureId?: string
}

export interface VariantPanelState {
  // Capabilities
  features: V3Feature[]
  capsLoading: boolean
  capsError: string | null
  capsRefresh: () => void

  // Feature selection
  selectedFeatureId: string
  setSelectedFeatureId: (id: string) => void
  selectedFeature: V3Feature | undefined

  // Variant selection
  selectedVariantId: string | null
  setSelectedVariantId: (id: string | null) => void
  selectedVariant: V3Variant | undefined
  isVariantApplicable: (variantId: string) => boolean

  // Derived
  mergedSlots: AnySlot[] | undefined
  remoteParams: ParamField[] | undefined
  prefLang: 'zh' | 'en'

  // Warning
  variantWarning: string | null
  setVariantWarning: (w: string | null) => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Score a feature by how well its variants' input slots match the upstream types.
 *
 * A feature whose variants require a media type (image/video/audio) that is
 * present in upstream gets a higher score. Features with only text/file slots
 * or no required media slots score 0.
 *
 * This allows auto-selecting the most relevant feature based on what's connected
 * upstream. For example, if an image node is connected upstream of a text node,
 * the "imageCaption" feature is preferred over "chat".
 */
function scoreFeatureByUpstream(
  feat: V3Feature,
  upstreamTypes: Set<MediaType>,
): number {
  if (upstreamTypes.size === 0) return 0
  let bestScore = 0
  for (const v of feat.variants) {
    if (!v.inputSlots?.length) continue
    let variantScore = 0
    for (const slot of v.inputSlots) {
      const accept = slot.accept as string
      if (accept === 'text' || accept === 'file') continue
      const isRequired = slot.required !== false && (slot.minCount ?? 1) > 0
      if (upstreamTypes.has(accept as MediaType)) {
        // Required media slot matched by upstream — strong signal
        variantScore += isRequired ? 2 : 1
      }
    }
    bestScore = Math.max(bestScore, variantScore)
  }
  return bestScore
}

export function useVariantPanel(options: VariantPanelOptions): VariantPanelState {
  const { category, nodeMediaType, upstreamTypes, initialFeatureId, cachedFeatureId } = options
  const { i18n } = useTranslation()
  const prefLang = (i18n.language.startsWith('zh') ? 'zh' : 'en') as 'zh' | 'en'

  // ── Capabilities ──
  const {
    data: capabilities,
    loading: capsLoading,
    error: capsError,
    refresh: capsRefresh,
  } = useCapabilities(category)
  const ownFeatures = capabilities?.features ?? []

  // ── Cross-category: text features that produce this category's media type ──
  // For empty nodes (no nodeMediaType), look in text capabilities for features
  // whose variants have resultType matching this panel's category (e.g. image).
  const needTextCross = category !== 'text' && !nodeMediaType
  const { data: textCapabilities } = useCapabilities('text')

  const features = useMemo(() => {
    if (!needTextCross || !textCapabilities?.features?.length) return ownFeatures
    // Filter text features: keep only variants whose resultType matches category
    const crossFeatures: V3Feature[] = []
    for (const feat of textCapabilities.features) {
      const matchingVariants = feat.variants.filter((v) => v.resultType === category)
      if (matchingVariants.length > 0) {
        crossFeatures.push({ ...feat, variants: matchingVariants })
      }
    }
    if (!crossFeatures.length) return ownFeatures
    return [...crossFeatures, ...ownFeatures]
  }, [needTextCross, textCapabilities?.features, ownFeatures, category])

  // ── Feature & variant selection ──
  const [selectedFeatureId, setSelectedFeatureId] = useState(initialFeatureId ?? '')
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [variantWarning, setVariantWarning] = useState<string | null>(null)

  // ── Applicability context ──
  const applicabilityCtx = useMemo(
    () => ({ nodeMediaType, upstreamTypes }),
    [nodeMediaType, upstreamTypes],
  )

  // ── Build variant lookup from features ──
  const variantMap = useMemo(() => {
    const map = new Map<string, V3Variant>()
    for (const f of features) {
      for (const v of f.variants) {
        map.set(v.id, v)
      }
    }
    return map
  }, [features])

  // ── Applicability ──
  const isVariantApplicable = useCallback(
    (variantId: string) => {
      const v = variantMap.get(variantId)
      if (!v?.inputSlots) return false
      return inferApplicability(v.inputSlots, applicabilityCtx)
    },
    [variantMap, applicabilityCtx],
  )

  const featureHasApplicable = useCallback(
    (feat: V3Feature) => feat.variants.some((v) => isVariantApplicable(v.id)),
    [isVariantApplicable],
  )

  // ── Auto-select feature on capabilities load ──
  // Priority: cachedFeatureId > upstream-matched feature > first applicable > first feature
  useEffect(() => {
    if (!features.length) return
    if (cachedFeatureId) {
      const feat = features.find((f) => f.id === cachedFeatureId)
      if (feat && featureHasApplicable(feat)) {
        setSelectedFeatureId(cachedFeatureId)
        return
      }
    }
    // Prefer features whose input slots match upstream types
    if (upstreamTypes.size > 0) {
      let bestFeat: V3Feature | undefined
      let bestScore = 0
      for (const f of features) {
        if (!featureHasApplicable(f)) continue
        const score = scoreFeatureByUpstream(f, upstreamTypes)
        if (score > bestScore) {
          bestScore = score
          bestFeat = f
        }
      }
      if (bestFeat) {
        setSelectedFeatureId(bestFeat.id)
        return
      }
    }
    const fallback = features.find((f) => featureHasApplicable(f))
    if (fallback) {
      setSelectedFeatureId(fallback.id)
    } else if (!features.some((f) => f.id === selectedFeatureId)) {
      setSelectedFeatureId(features[0].id)
    }
  }, [features, cachedFeatureId, featureHasApplicable, upstreamTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selected feature / variant resolution ──
  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selectedFeatureId) ?? features[0],
    [features, selectedFeatureId],
  )

  const selectedVariant = useMemo(() => {
    if (!selectedFeature) return undefined
    if (selectedVariantId) {
      const found = selectedFeature.variants.find((v) => v.id === selectedVariantId)
      if (found && isVariantApplicable(found.id)) return found
    }
    return selectedFeature.variants.find((v) => isVariantApplicable(v.id))
  }, [selectedFeature, selectedVariantId, isVariantApplicable])

  // ── Slots: direct conversion from API ──
  const mergedSlots = useMemo(() => {
    if (selectedVariant?.inputSlots?.length) {
      return apiSlotsToAnySlots(selectedVariant.inputSlots)
    }
    return undefined
  }, [selectedVariant?.inputSlots])

  // ── Remote params ──
  const remoteParams = useMemo(() => {
    if (selectedVariant?.paramsSchema?.length) {
      return remoteSchemaToParamFields(selectedVariant.paramsSchema, prefLang)
    }
    return undefined
  }, [selectedVariant?.paramsSchema, prefLang])

  // ── Clear warning on feature/variant change ──
  useEffect(() => {
    setVariantWarning(null)
  }, [selectedFeatureId, selectedVariantId])

  return {
    features,
    capsLoading,
    capsError,
    capsRefresh,
    selectedFeatureId,
    setSelectedFeatureId,
    selectedFeature,
    selectedVariantId,
    setSelectedVariantId,
    selectedVariant,
    isVariantApplicable,
    mergedSlots,
    remoteParams,
    prefLang,
    variantWarning,
    setVariantWarning,
  }
}
