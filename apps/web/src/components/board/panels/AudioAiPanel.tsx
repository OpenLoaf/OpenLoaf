/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Mic, Music, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@udecode/cn'
import type { V3Variant } from '@/lib/saas-media'
import type { UpstreamData } from '../engine/upstream-data'
import { GenerateActionBar } from './GenerateActionBar'
import { serializeForGenerate } from './variants/serialize'
import type { MediaReference, MediaType, PersistedSlotMap } from './variants/slot-types'
import type { ResolvedSlotInputs } from './variants/shared/InputSlotBar'
import { InputSlotBar } from './variants/shared'
import type { AiGenerateConfig, BoardFileContext, VariantSnapshot } from '../board-contracts'
import type { AudioNodeProps } from '../nodes/AudioNode'
import { GenericVariantForm } from './variants/shared/GenericVariantForm'
import { useVariantPanel } from './hooks/useVariantPanel'
import { useVariantCache } from './hooks/useVariantCache'
import { CapabilitiesFallback } from './shared/CapabilitiesFallback'
import { FeatureTabBar } from './shared/FeatureTabBar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Upstream data fed into the panel via connectors. */
export type AudioPanelUpstream = {
  /** Plain text from a connected text node (for TTS). */
  textContent?: string
  /** Audio source path from a connected audio node (for TTS reference voice). */
  referenceAudioSrc?: string
  /** Display name for the reference audio. */
  referenceAudioName?: string
  /** Board context for variant MediaSlot preview resolution & file saving. */
  boardId?: string
  projectId?: string
  boardFolderUri?: string
}

/** Audio generate params for v3. */
export type AudioGenerateParams = {
  feature: string
  variant: string
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
}

/** Props for the AudioAiPanel component. */
export type AudioAiPanelProps = {
  /** Canvas element for reading/writing aiConfig. */
  element: import('../engine/types').CanvasNodeElement<AudioNodeProps>
  /** Callback to patch node props (persists aiConfig). */
  onUpdate: (patch: Partial<AudioNodeProps>) => void
  /** Upstream data from connected nodes. */
  upstream?: AudioPanelUpstream
  /** Raw upstream data for InputSlotBar (with entries for slot assignment). */
  rawUpstream?: UpstreamData | null
  /** Callback when the user submits a generation request. */
  onGenerate?: (params: AudioGenerateParams) => void
  /** Callback to generate into a new derived node. */
  onGenerateNewNode?: (params: AudioGenerateParams) => void
  /** Whether the node currently has a resource. */
  hasResource?: boolean
  /** Whether the panel is in a generating state. */
  generating?: boolean
  /** When true, all inputs are disabled and the generate button is hidden. */
  readonly?: boolean
  /** Editing mode — user unlocked an existing result to tweak params. */
  editing?: boolean
  /** Callback to unlock the panel for editing. */
  onUnlock?: () => void
  /** Callback to cancel editing mode (re-lock the panel). */
  onCancelEdit?: () => void
  /** Additional class name for the root element. */
  className?: string
}

// ---------------------------------------------------------------------------
// Feature tab icons
// ---------------------------------------------------------------------------

const FEATURE_ICON_MAP: Record<string, typeof Mic> = {
  tts: Mic,
  music: Music,
  sfx: Volume2,
}

/** Well-known feature IDs for audio (used for coming-soon placeholders). */
const WELL_KNOWN_FEATURES = ['tts', 'music', 'sfx'] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Audio AI generation panel driven by v3 capabilities. */
export function AudioAiPanel({
  element,
  onUpdate,
  upstream,
  rawUpstream,
  onGenerate,
  onGenerateNewNode,
  hasResource = false,
  generating = false,
  readonly = false,
  editing = false,
  onUnlock,
  onCancelEdit,
  className,
}: AudioAiPanelProps) {
  const { t } = useTranslation('board')

  // ── Compute node media type & upstream types ──
  const nodeHasAudio = Boolean(upstream?.referenceAudioSrc)
  const nodeMediaType: MediaType | undefined = nodeHasAudio ? 'audio' : undefined
  const upstreamTypes = useMemo(() => {
    const types = new Set<MediaType>()
    if (nodeHasAudio) types.add('audio')
    return types
  }, [nodeHasAudio])

  // ── Shared panel hook ──
  const { features: apiFeatures, ...panel } = useVariantPanel({
    category: 'audio',
    nodeMediaType,
    upstreamTypes,
    initialFeatureId: 'tts',
  })

  // Well-known features fallback
  const features = apiFeatures.length
    ? apiFeatures
    : WELL_KNOWN_FEATURES.map((id) => ({
        id,
        displayName: id,
        variants: [] as V3Variant[],
      }))

  const {
    capsLoading, capsError, capsRefresh,
    selectedFeatureId, setSelectedFeatureId, selectedFeature,
    selectedVariantId, setSelectedVariantId, selectedVariant,
    isVariantApplicable,
    mergedSlots, remoteParams, prefLang,
    variantWarning, setVariantWarning,
  } = panel

  // ── Params cache ──
  const aiConfig = element.props.aiConfig
  const aiConfigRef = useRef(aiConfig)
  aiConfigRef.current = aiConfig

  const cacheKey = selectedFeatureId && selectedVariant?.id
    ? `${selectedFeatureId}:${selectedVariant.id}`
    : ''
  const cache = useVariantCache({
    initialCache: aiConfig?.cache,
    onFlush: (cacheMap) => {
      onUpdate({
        aiConfig: {
          ...aiConfigRef.current,
          cache: cacheMap,
        },
      })
    },
  })

  const [hasParams, setHasParams] = useState(false)
  const [pricingParams, setPricingParams] = useState<Record<string, unknown>>({})

  const handleParamsChange = useCallback(
    (snapshot: VariantSnapshot) => {
      if (cacheKey) {
        cache.update(cacheKey, { params: snapshot.params })
      }
      setPricingParams(snapshot.params ?? {})
      setHasParams(true)
    },
    [cache, cacheKey],
  )

  // ── Slot system ──
  const cachedSlotAssignment = cache.get(cacheKey)?.slotAssignment

  const handleSlotAssignmentPersist = useCallback((map: PersistedSlotMap) => {
    if (cacheKey) {
      cache.update(cacheKey, { slotAssignment: map })
    }
  }, [cache, cacheKey])

  const [resolvedSlots, setResolvedSlots] = useState<Record<string, MediaReference[]>>({})

  const [slotsValid, setSlotsValid] = useState(false)
  const handleSlotInputsChange = useCallback((resolved: ResolvedSlotInputs) => {
    setResolvedSlots(resolved.mediaRefs)
    setSlotsValid(resolved.isValid)
    if (cacheKey) {
      cache.update(cacheKey, { inputs: resolved.inputs })
    }
  }, [cache, cacheKey])

  const handleUserTextsChange = useCallback((texts: Record<string, string>) => {
    if (cacheKey) {
      cache.update(cacheKey, { userTexts: texts })
    }
  }, [cache, cacheKey])

  // ── Derived state ──
  const variants = selectedFeature?.variants ?? []
  const isComingSoon = variants.length === 0
  const resolvedVariantId = selectedVariant?.id ?? null

  // ── Upstream adapter ──
  const variantUpstream = useMemo(
    () => ({
      textContent: upstream?.textContent,
      audioUrl: upstream?.referenceAudioSrc,
      boardId: upstream?.boardId,
      projectId: upstream?.projectId,
      boardFolderUri: upstream?.boardFolderUri,
    }),
    [upstream?.textContent, upstream?.referenceAudioSrc, upstream?.boardId, upstream?.projectId, upstream?.boardFolderUri],
  )

  // ── File context for InputSlotBar ──
  const fileContext = useMemo<BoardFileContext | undefined>(
    () => (upstream?.boardId || upstream?.projectId || upstream?.boardFolderUri
      ? { boardId: upstream.boardId, projectId: upstream.projectId, boardFolderUri: upstream.boardFolderUri }
      : undefined),
    [upstream?.boardId, upstream?.projectId, upstream?.boardFolderUri],
  )

  // ── Generate handlers ──
  const buildGenerateParams = useCallback((): AudioGenerateParams | null => {
    const p = cacheKey ? cache.get(cacheKey) : undefined
    if (!selectedFeature || !resolvedVariantId || !p) return null

    const slotAssignments: Record<string, { path?: string; url?: string }[]> = {}
    for (const [key, refs] of Object.entries(resolvedSlots)) {
      slotAssignments[key] = refs.map((r) => (r.path ? { path: r.path } : { url: r.url }))
    }

    const v3Result = serializeForGenerate(mergedSlots ?? [], {
      prompt: (p.inputs?.prompt as string) ?? (p.params?.prompt as string),
      paintResults: {},
      slotAssignments,
      resolvedInputs: p.inputs ?? {},
      taskRefs: {},
      params: p.params ?? {},
      count: p.count,
    })

    return {
      feature: selectedFeature.id,
      variant: resolvedVariantId,
      ...v3Result,
    }
  }, [selectedFeature, resolvedVariantId, resolvedSlots, upstream?.referenceAudioSrc, mergedSlots, cache, cacheKey])

  const handleGenerate = useCallback(() => {
    const params = buildGenerateParams()
    if (params) onGenerate?.(params)
  }, [onGenerate, buildGenerateParams])

  const handleGenerateNew = useCallback(() => {
    const params = buildGenerateParams()
    if (params) onGenerateNewNode?.(params)
  }, [onGenerateNewNode, buildGenerateParams])

  const isGenerateDisabled = isComingSoon || !resolvedVariantId || !hasParams || !slotsValid

  const showFallback = !features.length

  // ── Render badge for coming-soon features ──
  const renderBadge = useCallback((feat: { variants: unknown[] }) => {
    if (feat.variants.length === 0) {
      return (
        <span className="ml-1 rounded bg-muted-foreground/10 px-1 py-px text-[9px] text-muted-foreground/50">
          {t('audioPanel.tabBadgeSoon')}
        </span>
      )
    }
    return null
  }, [t])

  return (
    <div
      className={cn(
        'flex w-[480px] flex-col gap-3 rounded-3xl border border-border bg-card p-3 shadow-lg',
        className,
      )}
    >
      {/* ---- Fallback: loading / error / empty ---- */}
      {showFallback ? (
        <CapabilitiesFallback
          loading={capsLoading}
          error={capsError}
          onRetry={capsRefresh}
        />
      ) : null}

      {/* ---- Feature Tab Row ---- */}
      {!showFallback ? (
        <FeatureTabBar
          features={features}
          selectedFeatureId={selectedFeatureId}
          onSelect={(id) => {
            setSelectedFeatureId(id)
            setSelectedVariantId(null)
          }}
          isVariantApplicable={isVariantApplicable}
          prefLang={prefLang}
          disabled={readonly && !editing}
          iconMap={FEATURE_ICON_MAP}
          renderBadge={renderBadge}
          showEmpty
        />
      ) : null}

      {/* ---- InputSlotBar ---- */}
      {mergedSlots?.length && selectedVariant ? (
        <InputSlotBar
          slots={mergedSlots}
          upstream={rawUpstream ?? { textList: [], imageList: [], videoList: [], audioList: [], entries: [] }}
          fileContext={fileContext}
          cachedAssignment={cachedSlotAssignment}
          cachedUserTexts={cache.get(cacheKey)?.userTexts}
          onAssignmentChange={handleSlotInputsChange}
          onSlotAssignmentChange={handleSlotAssignmentPersist}
          onUserTextsChange={handleUserTextsChange}
          disabled={readonly && !editing}
        />
      ) : null}

      {/* ---- Variant Form ---- */}
      <AnimatePresence mode="wait">
        {selectedVariant ? (
          <motion.div
            key={selectedVariant.id || resolvedVariantId}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <GenericVariantForm
              variantId={selectedVariant.id}
              upstream={variantUpstream}
              disabled={readonly && !editing}
              initialParams={cache.get(cacheKey)}
              onParamsChange={handleParamsChange}
              onWarningChange={setVariantWarning}
              resolvedSlots={resolvedSlots}
              overrideParams={remoteParams}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ---- Coming Soon Placeholder ---- */}
      {isComingSoon ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/40 bg-ol-surface-muted/50 px-4 py-8">
          {(() => {
            const PlaceholderIcon = FEATURE_ICON_MAP[selectedFeatureId] ?? Mic
            return (
              <PlaceholderIcon
                size={24}
                className="text-muted-foreground/40"
              />
            )
          })()}
          <span className="text-sm font-medium text-muted-foreground/60">
            {t(`audioPanel.comingSoon.${selectedFeatureId}.title`, {
              defaultValue: t('v3.features.comingSoonTitle'),
            })}
          </span>
          <span className="text-[11px] text-muted-foreground/40">
            {t(`audioPanel.comingSoon.${selectedFeatureId}.description`, {
              defaultValue: t('v3.features.comingSoonDescription'),
            })}
          </span>
        </div>
      ) : null}

      {/* ---- Generate Action Bar ---- */}
      {!isComingSoon && !(capsLoading || capsError) ? (
        <GenerateActionBar
          hasResource={hasResource}
          generating={generating}
          disabled={isGenerateDisabled}
          buttonClassName="bg-foreground text-background hover:bg-foreground/90"
          onGenerate={handleGenerate}
          onGenerateNewNode={handleGenerateNew}
          readonly={readonly}
          editing={editing}
          onUnlock={onUnlock}
          onCancelEdit={onCancelEdit}
          estimateParams={pricingParams}
          warningMessage={variantWarning}
          variants={variants.length > 0 ? variants.filter((v) => isVariantApplicable(v.id)).map((v) => ({
            id: v.id,
            displayName: v.displayName || v.featureTabName || v.id,
          })) : undefined}
          selectedVariantId={resolvedVariantId ?? undefined}
          onVariantChange={setSelectedVariantId}
        />
      ) : null}
    </div>
  )
}
