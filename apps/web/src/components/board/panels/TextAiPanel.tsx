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
 * Supports the post-generation lock (readonly / editing) pattern so that once
 * a text node has AI-generated content, switching features is disabled until
 * the user explicitly unlocks to edit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasNodeElement, BoardFileContext } from '../engine/types'
import type { TextNodeProps } from '../nodes/text-node-types'
import type { UpstreamData } from '../engine/upstream-data'
import type { VariantSnapshot } from '../board-contracts'
import type { MediaType, PersistedSlotMap } from './variants/slot-types'
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
import { getPrimaryEntry } from '../engine/version-stack'
import { MEDIA_FEATURES, type MediaFeatureId } from '@openloaf-saas/sdk'

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
  /** Persist aiConfig/cache changes back onto the node. */
  onUpdate: (patch: Partial<TextNodeProps>) => void
  /** Callback to trigger text generation on the current node. */
  onGenerate?: (params: TextGenerateParams) => void
  /** Callback to generate into a new derived node. */
  onGenerateNewNode?: (params: TextGenerateParams) => void
  /** Whether a generation is in progress (controlled by parent). */
  generating?: boolean
  /** Abort the current generation. */
  onStop?: () => void
  /** When true, all inputs are disabled and generate button is hidden (post-generation lock). */
  readonly?: boolean
  /** Editing mode — user unlocked an existing result to tweak params. */
  editing?: boolean
  /** Callback to unlock the panel for editing (override readonly). */
  onUnlock?: () => void
  /** Callback to cancel editing mode (re-lock the panel). */
  onCancelEdit?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** AI text generation parameter panel displayed below text nodes (v3 capabilities). */
export function TextAiPanel({
  element,
  upstream,
  fileContext,
  onUpdate,
  onGenerate,
  onGenerateNewNode,
  generating = false,
  onStop,
  readonly = false,
  editing = false,
  onUnlock,
  onCancelEdit,
}: TextAiPanelProps) {
  const aiConfig = element.props.aiConfig

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
    selectedVariantId,
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
    initialFeatureId: aiConfig?.lastUsed?.feature,
    cachedFeatureId: aiConfig?.lastUsed?.feature,
  })

  // ── Params cache — persists to element.props.aiConfig.cache ──
  const aiConfigRef = useRef(aiConfig)
  aiConfigRef.current = aiConfig

  const activeKey = selectedVariant ? `${selectedFeatureId}:${selectedVariant.id}` : ''

  const cache = useVariantCache({
    initialCache: aiConfig?.cache,
    paused: editing,
    onFlush: (cacheMap) => {
      onUpdate({
        aiConfig: {
          ...aiConfigRef.current,
          cache: cacheMap,
        },
      })
    },
  })

  // Migrate text slot content when switching models within the same feature
  const prevActiveKeyRef = useRef(activeKey)
  if (activeKey && activeKey !== prevActiveKeyRef.current) {
    cache.migrateUserTexts(prevActiveKeyRef.current, activeKey)
  }
  prevActiveKeyRef.current = activeKey

  // ── Draft mode — snapshot/restore on edit cancel ──
  const editSnapshotRef = useRef<Record<string, VariantSnapshot> | null>(null)
  const [cancelCounter, setCancelCounter] = useState(0)

  useEffect(() => {
    if (editing) {
      editSnapshotRef.current = cache.takeSnapshot()
    }
  }, [editing, cache])

  const handleCancelEdit = useCallback(() => {
    if (editSnapshotRef.current) {
      cache.restoreSnapshot(editSnapshotRef.current)
      cache.flushNow()
      editSnapshotRef.current = null
    }
    setCancelCounter((c) => c + 1)
    onCancelEdit?.()
  }, [cache, onCancelEdit])

  // ── Per-version params — derive effective snapshot from version entry ──
  const primaryEntry = useMemo(
    () => getPrimaryEntry(element.props.versionStack),
    [element.props.versionStack],
  )

  const effectiveSnapshot = useMemo<VariantSnapshot | undefined>(() => {
    if (readonly && !editing && primaryEntry?.input?.parameters) {
      const p = primaryEntry.input.parameters as {
        feature?: string
        variant?: string
        inputs?: Record<string, unknown>
        params?: Record<string, unknown>
        count?: number
      }
      return {
        inputs: p.inputs ?? {},
        params: p.params ?? {},
        count: p.count,
      }
    }
    return cache.get(activeKey)
  }, [readonly, editing, primaryEntry, cache, activeKey])

  // Auto-select feature/variant matching the viewed version (readonly mode).
  useEffect(() => {
    if (!readonly) return
    const params = primaryEntry?.input?.parameters as
      | { feature?: string; variant?: string }
      | undefined
    if (params?.feature && params.feature !== selectedFeatureId) {
      setSelectedFeatureId(params.feature)
    }
    if (params?.variant && params.variant !== selectedVariantId) {
      setSelectedVariantId(params.variant)
    }
  }, [
    readonly,
    primaryEntry,
    selectedFeatureId,
    selectedVariantId,
    setSelectedFeatureId,
    setSelectedVariantId,
  ])

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
  const isGenerateDisabled = !selectedVariant || !slotsValid || generating || (readonly && !editing)

  // ── Loading / Error fallback ──
  const showFallback = !features.length

  return (
    <div className="flex w-[480px] flex-col gap-2.5 rounded-3xl border border-border bg-card p-3 shadow-lg">
      {/* ── Fallback: loading / error / empty ── */}
      {showFallback ? (
        <CapabilitiesFallback loading={capsLoading} error={capsError} onRetry={capsRefresh} />
      ) : null}

      {/* ── Feature Tabs / locked label ── */}
      {editing ? (
        <div className="px-1 py-1">
          <span className="text-[12px] font-medium text-muted-foreground">
            {selectedFeature?.displayName
              || MEDIA_FEATURES[selectedFeatureId as MediaFeatureId]?.label[prefLang]
              || selectedFeatureId}
          </span>
        </div>
      ) : (
        <FeatureTabBar
          features={features}
          selectedFeatureId={selectedFeatureId}
          onSelect={handleFeatureSelect}
          isVariantApplicable={isVariantApplicable}
          prefLang={prefLang}
          disabled={readonly || generating}
        />
      )}

      {/* ── InputSlotBar (V3 declarative slot assignment) ── */}
      {mergedSlots?.length && selectedVariant ? (
        <InputSlotBar
          key={`${selectedFeatureId}:${selectedVariant.id}:${readonly && !editing ? primaryEntry?.id : 'edit'}:${cancelCounter}`}
          slots={mergedSlots}
          upstream={upstreamForSlots}
          fileContext={fileContext}
          disabled={(readonly && !editing) || generating}
          cachedAssignment={effectiveSnapshot?.slotAssignment as PersistedSlotMap | undefined}
          cachedUserTexts={effectiveSnapshot?.userTexts}
          onAssignmentChange={handleSlotInputsChange}
          onSlotAssignmentChange={handleSlotAssignmentPersist}
          onUserTextsChange={handleUserTextsChange}
        />
      ) : null}

      {/* ── Variant-specific form (paramsSchema) ── */}
      {selectedVariant ? (
        <VariantFormTransition
          variantKey={`${selectedVariant.id}:${readonly && !editing ? primaryEntry?.id : 'edit'}:${cancelCounter}`}
        >
          <GenericVariantForm
            variantId={selectedVariant.id}
            upstream={{}}
            disabled={(readonly && !editing) || generating}
            initialParams={effectiveSnapshot}
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
          readonly={readonly}
          editing={editing}
          onUnlock={onUnlock}
          onCancelEdit={handleCancelEdit}
          skipEstimate
          warningMessage={variantWarning}
          variants={selectedFeature?.variants
            ?.filter((v) => isVariantApplicable(v.id))
            .map((v) => ({
              id: v.id,
              displayName: v.displayName || v.featureTabName || v.id,
            }))}
          selectedVariantId={selectedVariant?.id}
          onVariantChange={editing ? undefined : setSelectedVariantId}
        />
      ) : null}
    </div>
  )
}
