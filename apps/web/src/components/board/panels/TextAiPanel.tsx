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
 * TextAiPanel — AI panel for text nodes on the canvas.
 *
 * Uses the same v3 capabilities API pattern as Image/Video/Audio panels:
 * FeatureTabBar → InputSlotBar → GenericVariantForm → GenerateActionBar.
 *
 * Text generation uses streaming mode via v3TextGenerateStream.
 */

import { useCallback, useMemo, useRef } from 'react'
import type { CanvasNodeElement, BoardFileContext } from '../engine/types'
import type { TextNodeProps } from '../nodes/text-node-types'
import type { UpstreamData } from '../engine/upstream-data'
import type { MediaType } from './variants/slot-types'
import { VariantFormTransition } from './variants/shared/VariantFormTransition'
import { InputSlotBar } from './variants/shared/InputSlotBar'
import { GenericVariantForm } from './variants/shared/GenericVariantForm'
import { GenerateActionBar } from './GenerateActionBar'
import { FeatureTabBar } from './shared/FeatureTabBar'
import { CapabilitiesFallback } from './shared/CapabilitiesFallback'
import { useVariantPanel } from './hooks/useVariantPanel'
import { useVariantCache } from './hooks/useVariantCache'
import { useSlotHandlers } from './hooks/useSlotHandlers'
import { serializeForGenerate } from './variants/serialize'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters passed to the onGenerate callback (v3-compatible). */
export type TextGenerateParams = {
  feature: string
  variant: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
}

export type TextAiPanelProps = {
  element: CanvasNodeElement<TextNodeProps>
  upstream: UpstreamData | null
  /** Board file context for resolving media paths in InputSlotBar. */
  fileContext?: BoardFileContext
  /** Callback to trigger text generation on the current node. */
  onGenerate?: (params: TextGenerateParams) => void
  /** Callback to generate into a new derived node. */
  onGenerateNewNode?: (params: TextGenerateParams) => void
  /** Whether a generation is in progress (controlled by parent). */
  generating?: boolean
  /** Abort the current generation. */
  onStop?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** AI text generation parameter panel displayed below text nodes (v3 capabilities). */
export function TextAiPanel({
  upstream,
  fileContext,
  onGenerate,
  onGenerateNewNode,
  generating = false,
  onStop,
}: TextAiPanelProps) {
  // ── Upstream types for variant applicability ──
  const upstreamTypes = useMemo(() => {
    const types = new Set<MediaType>()
    if (upstream?.imageList.length) types.add('image')
    if (upstream?.videoList.length) types.add('video')
    if (upstream?.audioList.length) types.add('audio')
    return types
  }, [upstream?.imageList.length, upstream?.videoList.length, upstream?.audioList.length])

  // ── Shared panel hook (v3 capabilities) ──
  const {
    features,
    capsLoading,
    capsError,
    capsRefresh,
    selectedFeatureId,
    setSelectedFeatureId,
    selectedFeature,
    setSelectedVariantId,
    selectedVariant,
    isVariantApplicable,
    mergedSlots,
    remoteParams,
    prefLang,
    variantWarning,
    setVariantWarning,
  } = useVariantPanel({
    category: 'text',
    upstreamTypes,
  })

  // ── Params cache (in-memory only, text nodes have no persistent aiConfig) ──
  const activeKey = selectedVariant ? `${selectedFeatureId}:${selectedVariant.id}` : ''

  const cache = useVariantCache({
    onFlush: () => {},
  })

  // Migrate text slot content when switching models within the same feature
  const prevActiveKeyRef = useRef('')
  if (activeKey && activeKey !== prevActiveKeyRef.current) {
    cache.migrateUserTexts(prevActiveKeyRef.current, activeKey)
  }
  prevActiveKeyRef.current = activeKey

  // ── Slot handlers ──
  const { resolvedSlots, slotsValid, handleSlotInputsChange, handleSlotAssignmentPersist, handleUserTextsChange } = useSlotHandlers(cache, activeKey)

  // ── Collect params for generation ──
  const collectParams = useCallback((): TextGenerateParams | null => {
    if (!selectedVariant || !selectedFeature) return null
    const vp = cache.get(activeKey) ?? { inputs: {}, params: {} }
    const v3Result = serializeForGenerate(mergedSlots ?? [], {
      prompt: (vp.inputs.prompt as string) ?? '',
      paintResults: {},
      slotAssignments: {},
      resolvedInputs: vp.inputs ?? {},
      taskRefs: {},
      params: vp.params,
      count: vp.count,
    })
    return {
      feature: selectedFeature.id,
      variant: selectedVariant.id,
      inputs: v3Result.inputs,
      params: v3Result.params,
    }
  }, [selectedVariant, selectedFeature, mergedSlots, cache, activeKey])

  // ── Generate handlers — delegate to parent ──
  const handleGenerate = useCallback(() => {
    if (generating) return
    const params = collectParams()
    if (params) onGenerate?.(params)
  }, [generating, collectParams, onGenerate])

  const handleGenerateNewNode = useCallback(() => {
    if (generating) return
    const params = collectParams()
    if (params) onGenerateNewNode?.(params)
  }, [generating, collectParams, onGenerateNewNode])

  const handleFeatureSelect = useCallback((featureId: string) => {
    setSelectedFeatureId(featureId)
    setSelectedVariantId(null)
    onStop?.()
  }, [setSelectedFeatureId, setSelectedVariantId, onStop])

  // ── Upstream for InputSlotBar ──
  const upstreamForSlots = useMemo(
    () => upstream ?? { textList: [], imageList: [], videoList: [], audioList: [], entries: [] },
    [upstream],
  )

  // ── Generate disabled ──
  const isGenerateDisabled = !selectedVariant || !slotsValid || generating

  // ── Loading / Error fallback ──
  const showFallback = !features.length

  return (
    <div className="flex w-[480px] flex-col gap-2.5 rounded-3xl border border-border bg-card p-3 shadow-lg">
      {/* ── Fallback: loading / error / empty ── */}
      {showFallback ? (
        <CapabilitiesFallback loading={capsLoading} error={capsError} onRetry={capsRefresh} />
      ) : null}

      {/* ── Feature Tabs ── */}
      <FeatureTabBar
        features={features}
        selectedFeatureId={selectedFeatureId}
        onSelect={handleFeatureSelect}
        isVariantApplicable={isVariantApplicable}
        prefLang={prefLang}
        disabled={generating}
      />

      {/* ── InputSlotBar (V3 declarative slot assignment) ── */}
      {mergedSlots?.length && selectedVariant ? (
        <InputSlotBar
          key={`${selectedFeatureId}:${selectedVariant.id}`}
          slots={mergedSlots}
          upstream={upstreamForSlots}
          fileContext={fileContext}
          disabled={generating}
          onAssignmentChange={handleSlotInputsChange}
          onSlotAssignmentChange={handleSlotAssignmentPersist}
          onUserTextsChange={handleUserTextsChange}
        />
      ) : null}

      {/* ── Variant-specific form (paramsSchema) ── */}
      {selectedVariant ? (
        <VariantFormTransition variantKey={selectedVariant.id}>
          <GenericVariantForm
            variantId={selectedVariant.id}
            upstream={{}}
            disabled={generating}
            initialParams={cache.get(activeKey)}
            onParamsChange={(snapshot) => {
              if (activeKey) {
                cache.update(activeKey, { params: snapshot.params })
              }
            }}
            onWarningChange={setVariantWarning}
            resolvedSlots={resolvedSlots}
            overrideParams={remoteParams}
          />
        </VariantFormTransition>
      ) : null}

      {/* ── Generate Action Bar ── */}
      {!showFallback ? (
        <GenerateActionBar
          hasResource={false}
          generating={generating}
          disabled={isGenerateDisabled}
          buttonClassName="bg-foreground text-background hover:bg-foreground/90"
          onGenerate={handleGenerate}
          onGenerateNewNode={handleGenerateNewNode}
          skipEstimate
          warningMessage={variantWarning}
          variants={selectedFeature?.variants
            ?.filter((v) => isVariantApplicable(v.id))
            .map((v) => ({
              id: v.id,
              displayName: v.displayName || v.featureTabName || v.id,
            }))}
          selectedVariantId={selectedVariant?.id}
          onVariantChange={setSelectedVariantId}
        />
      ) : null}
    </div>
  )
}
