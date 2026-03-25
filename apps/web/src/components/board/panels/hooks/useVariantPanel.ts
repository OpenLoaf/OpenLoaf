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
import type { V3Feature, V3Variant } from '@/lib/saas-media'
import type { ParamField } from '../variants/types'
import type { AnySlot, MediaType } from '../variants/slot-types'
import { remoteSchemaToParamFields } from '../variants/remote-param-schema'
import { inferApplicability, apiSlotsToAnySlots } from '../variants/slot-conventions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantPanelOptions {
  /** Media category for capabilities API */
  category: 'image' | 'video' | 'audio'
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
  const features = capabilities?.features ?? []

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
  useEffect(() => {
    if (!features.length) return
    if (cachedFeatureId) {
      const feat = features.find((f) => f.id === cachedFeatureId)
      if (feat && featureHasApplicable(feat)) {
        setSelectedFeatureId(cachedFeatureId)
        return
      }
    }
    const fallback = features.find((f) => featureHasApplicable(f))
    if (fallback) {
      setSelectedFeatureId(fallback.id)
    } else if (!features.some((f) => f.id === selectedFeatureId)) {
      setSelectedFeatureId(features[0].id)
    }
  }, [features, cachedFeatureId, featureHasApplicable]) // eslint-disable-line react-hooks/exhaustive-deps

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
