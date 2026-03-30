/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { type GenerateTarget } from './GenerateActionBar'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VariantFormTransition } from './variants/shared/VariantFormTransition'
import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import type { CanvasNodeElement } from '../engine/types'
import type { UpstreamData } from '../engine/upstream-data'
import type { VideoNodeProps } from '../nodes/node-types'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { fetchUserProfile } from '@/lib/saas-auth'
import { PricingDialog } from '@/components/billing/PricingDialog'
import { GenerateActionBar } from './GenerateActionBar'
import { serializeForGenerate } from './variants/serialize'
import type { MediaType, PersistedSlotMap } from './variants/slot-types'
import { InputSlotBar } from './variants/shared/InputSlotBar'
import { GenericVariantForm } from './variants/shared/GenericVariantForm'
import type { BoardFileContext, VariantSnapshot } from '../board-contracts'
import { getPrimaryEntry } from '../engine/version-stack'
import { useVariantPanel } from './hooks/useVariantPanel'
import { useVariantCache } from './hooks/useVariantCache'
import { useSlotHandlers } from './hooks/useSlotHandlers'
import { CapabilitiesFallback } from './shared/CapabilitiesFallback'
import { FeatureTabBar } from './shared/FeatureTabBar'
import { MEDIA_FEATURES, type MediaFeatureId } from '@openloaf-saas/sdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** v3-aware generate params emitted by the panel. */
export type VideoGenerateParams = {
  /** v3 feature id (e.g. 'videoGenerate', 'lipSync'). */
  feature: string
  /** v3 variant id (e.g. 'OL-VG-001'). */
  variant: string
  /** v3 inputs (images, audio, prompt etc.). */
  inputs?: Record<string, unknown>
  /** v3 params (style, duration, aspectRatio etc.). */
  params?: Record<string, unknown>
  /** Number of results to generate. */
  count?: number
  // 便于节点快照与 aiConfig 记录的附加元数据
  prompt?: string
  aspectRatio?: string
  duration?: number
  quality?: string
  mode?: string
  withAudio?: boolean
}

export type VideoAiPanelProps = {
  element: CanvasNodeElement<VideoNodeProps>
  onUpdate: (patch: Partial<VideoNodeProps>) => void
  onGenerate?: (params: VideoGenerateParams) => void
  /** Callback to generate into a new derived node. */
  onGenerateNewNode?: (params: VideoGenerateParams) => void
  upstreamText?: string
  /** Resolved browser-friendly URLs for display/thumbnails. */
  upstreamImages?: string[]
  /** Raw board-relative paths for API submission (e.g. "asset/xxx.jpg"). */
  upstreamImagePaths?: string[]
  upstreamAudioUrl?: string
  upstreamVideoUrl?: string
  /** Raw upstream data for InputSlotBar (with entries for slot assignment). */
  rawUpstream?: UpstreamData | null
  /** Board context for variant MediaSlot preview resolution & file saving. */
  boardId?: string
  projectId?: string
  boardFolderUri?: string
  /** Full file context object (optional, derived from boardId/projectId/boardFolderUri if not provided). */
  fileContext?: BoardFileContext
  /** When true, all inputs are disabled and the generate button is hidden. */
  readonly?: boolean
  /** Editing mode -- user unlocked an existing result to tweak params. */
  editing?: boolean
  /** Callback to unlock the panel for editing. */
  onUnlock?: () => void
  /** Callback to cancel editing mode (re-lock the panel). */
  onCancelEdit?: () => void
}

/** AI video generation parameter panel displayed below video nodes. */
export function VideoAiPanel({
  element,
  onUpdate,
  onGenerate,
  onGenerateNewNode,
  upstreamText,
  upstreamImages,
  upstreamImagePaths,
  upstreamAudioUrl,
  upstreamVideoUrl,
  rawUpstream,
  boardId,
  projectId,
  boardFolderUri,
  fileContext: fileContextProp,
  readonly = false,
  editing = false,
  onUnlock,
  onCancelEdit,
}: VideoAiPanelProps) {
  const { t } = useTranslation('board')

  // ── Membership gate: free/lite users cannot use video generation ──
  const loggedIn = useSaasAuth((s) => s.loggedIn)
  const profileQuery = useQuery({
    queryKey: ['saas', 'userProfile'],
    queryFn: fetchUserProfile,
    enabled: loggedIn,
    staleTime: 60_000,
  })
  const membershipLevel = profileQuery.data?.membershipLevel
  const isInternalUser = profileQuery.data?.isInternal === true
  const isVideoLocked =
    loggedIn &&
    membershipLevel != null &&
    !isInternalUser &&
    (membershipLevel === 'free' || membershipLevel === 'lite')
  const [pricingOpen, setPricingOpen] = useState(false)

  const aiConfig = element.props.aiConfig

  // ── Compute node media type & upstream types ──
  const nodeHasVideo = Boolean(element.props.sourcePath)
  const nodeMediaType: MediaType | undefined = nodeHasVideo ? 'video' : undefined
  const upstreamTypes = useMemo(() => {
    const types = new Set<MediaType>()
    if (upstreamImages?.length) types.add('image')
    if (upstreamAudioUrl) types.add('audio')
    if (upstreamVideoUrl) types.add('video')
    return types
  }, [upstreamImages?.length, upstreamAudioUrl, upstreamVideoUrl])

  // ── Shared variant panel hook ──
  const panel = useVariantPanel({
    category: 'video',
    nodeMediaType,
    upstreamTypes,
    initialFeatureId: aiConfig?.lastUsed?.feature ?? '',
    cachedFeatureId: aiConfig?.lastUsed?.feature,
  })

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
  } = panel

  // ── Params cache ──
  const aiConfigRef = useRef(aiConfig)
  aiConfigRef.current = aiConfig

  const cacheKey = selectedVariant ? `${selectedFeatureId}:${selectedVariant.id}` : ''

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
    setCancelCounter(c => c + 1)
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
    return cache.get(cacheKey)
  }, [readonly, editing, primaryEntry, cache, cacheKey])

  // Auto-select feature/variant matching the viewed version (readonly OR editing mode)
  useEffect(() => {
    if (!readonly) return
    const params = primaryEntry?.input?.parameters as {
      feature?: string
      variant?: string
    } | undefined
    if (params?.feature && params.feature !== selectedFeatureId) {
      setSelectedFeatureId(params.feature)
    }
    if (params?.variant && params.variant !== selectedVariantId) {
      setSelectedVariantId(params.variant)
    }
  }, [readonly, editing, primaryEntry, selectedFeatureId, selectedVariantId, setSelectedFeatureId, setSelectedVariantId])

  // ── Generate target persistence ──
  const handleTargetChange = useCallback((next: GenerateTarget) => {
    onUpdate({
      aiConfig: {
        ...aiConfigRef.current,
        generateTarget: next,
      },
    })
  }, [onUpdate])

  // ── Pricing params (reactive for estimate API) ──
  const [pricingParams, setPricingParams] = useState<Record<string, unknown>>({})

  // ── Slot system ──
  const { resolvedSlots, slotsValid, handleSlotInputsChange, handleSlotAssignmentPersist, handleUserTextsChange } = useSlotHandlers(cache, cacheKey)

  // ── Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)

  const isGenerateDisabled = useMemo(() => {
    if (!selectedFeature || !selectedVariant) return true
    if (!slotsValid) return true
    return false
  }, [selectedFeature, selectedVariant, slotsValid])

  /** Collect params without uploading media — fast, for immediate node creation. */
  const collectParams = useCallback((): VideoGenerateParams => {
    const vid = selectedVariant?.id ?? selectedVariantId ?? ''
    if (!vid) throw new Error('No variant definition available')

    const p = cache.get(cacheKey) ?? { inputs: {}, params: {} }
    const promptValue =
      (p.params?.prompt as string) ?? (p.inputs?.prompt as string) ?? ''

    // V3 path: use serializeForGenerate with declarative slots
    const slotAssignments: Record<string, { path?: string; url?: string }[]> = {}
    for (const [key, refs] of Object.entries(resolvedSlots)) {
      slotAssignments[key] = refs.map((r) => (r.path ? { path: r.path } : { url: r.url }))
    }

    const v3Result = serializeForGenerate(
      mergedSlots ?? [],
      {
        prompt: promptValue,
        paintResults: {},
        slotAssignments,
        resolvedInputs: p.inputs ?? {},
        taskRefs: {},
        params: p.params ?? {},
        count: p.count,
      },
    )

    return {
      feature: selectedFeatureId,
      variant: vid,
      ...v3Result,
      // 便于节点快照与 aiConfig 记录的附加元数据
      prompt: promptValue,
      aspectRatio: (p.params?.aspectRatio as string) ?? 'auto',
      duration: (p.params?.duration as number) ?? 5,
      quality: (p.params?.quality as string) ?? undefined,
      mode: (p.params?.mode as string) ?? undefined,
    }
  }, [
    selectedFeatureId,
    selectedVariantId,
    selectedVariant,
    resolvedSlots,
    element.props.sourcePath,
    mergedSlots,
    cache,
    cacheKey,
  ])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)

    try {
      const params = collectParams()

      cache.flushNow()
      onUpdate({
        origin: 'ai-generate',
        aiConfig: {
          ...aiConfigRef.current,
          lastUsed: { feature: params.feature, variant: params.variant },
          lastGeneration: {
            prompt: params.prompt ?? '',
            feature: params.feature,
            variant: params.variant,
            aspectRatio: params.aspectRatio,
            generatedAt: Date.now(),
          },
        },
      })

      onGenerate?.(params)
    } catch (err) {
      console.error('[VideoAiPanel] handleGenerate failed:', err)
      toast.error(
        t('v3.errors.prepareFailed', { defaultValue: '准备生成参数失败，请重试' }),
      )
    } finally {
      setTimeout(() => setIsGenerating(false), 300)
    }
  }, [isGenerating, collectParams, onUpdate, onGenerate, t, cache])

  const handleGenerateNew = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)

    try {
      const params = collectParams()
      cache.flushNow()
      onUpdate({
        aiConfig: {
          ...aiConfigRef.current,
          lastUsed: { feature: params.feature, variant: params.variant },
          lastGeneration: {
            prompt: params.prompt ?? '',
            feature: params.feature,
            variant: params.variant,
            aspectRatio: params.aspectRatio,
            generatedAt: Date.now(),
          },
        },
      })
      onGenerateNewNode?.(params)
    } catch (err) {
      console.error('[VideoAiPanel] handleGenerateNew failed:', err)
      toast.error(
        t('v3.errors.prepareFailed', { defaultValue: '准备生成参数失败，请重试' }),
      )
    } finally {
      setTimeout(() => setIsGenerating(false), 300)
    }
  }, [isGenerating, collectParams, onGenerateNewNode, onUpdate, t, cache])

  const hasResource = Boolean(element.props.sourcePath)

  // ── Upstream data for variant components ──
  const upstream = useMemo(
    () => ({
      textContent: upstreamText,
      images: upstreamImages,
      imagePaths: upstreamImagePaths,
      audioUrl: upstreamAudioUrl,
      videoUrl: upstreamVideoUrl,
      boardId,
      projectId,
      boardFolderUri,
    }),
    [
      upstreamText,
      upstreamImages,
      upstreamImagePaths,
      upstreamAudioUrl,
      upstreamVideoUrl,
      boardId,
      projectId,
      boardFolderUri,
    ],
  )

  // ── Derive fileContext from props ──
  const fileContext = useMemo<BoardFileContext | undefined>(
    () =>
      fileContextProp ??
      (boardId || projectId || boardFolderUri
        ? { boardId, projectId, boardFolderUri }
        : undefined),
    [fileContextProp, boardId, projectId, boardFolderUri],
  )

  const showFallback = !features.length

  if (isVideoLocked) {
    return (
      <div className="flex w-[480px] flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-card px-6 py-10 shadow-lg">
        <Lock size={24} className="text-muted-foreground" />
        <div className="text-center">
          <div className="text-sm font-medium text-foreground">
            {t('videoLocked.title')}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t('videoLocked.description')}
          </div>
        </div>
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors duration-150 hover:bg-foreground/90"
          onClick={() => setPricingOpen(true)}
        >
          {t('videoLocked.upgrade')}
        </button>
        <PricingDialog open={pricingOpen} onOpenChange={setPricingOpen} />
      </div>
    )
  }

  return (
    <div className="flex w-[480px] flex-col gap-2.5 rounded-3xl border border-border bg-card p-3 shadow-lg">
      {/* -- Fallback: loading / error / empty -- */}
      {showFallback ? (
        <CapabilitiesFallback
          loading={capsLoading}
          error={capsError}
          onRetry={capsRefresh}
        />
      ) : null}

      {/* -- Feature Tabs / locked label -- */}
      {!showFallback ? (
        editing ? (
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
            onSelect={(id) => {
              setSelectedFeatureId(id)
              setSelectedVariantId(null)
            }}
            isVariantApplicable={isVariantApplicable}
            prefLang={prefLang}
            disabled={readonly}
          />
        )
      ) : null}

      {/* -- InputSlotBar (V3 declarative slot assignment) -- */}
      {mergedSlots?.length && selectedVariant ? (
        <InputSlotBar
          key={`${selectedFeatureId}:${selectedVariant.id}:${readonly && !editing ? primaryEntry?.id : 'edit'}:${cancelCounter}`}
          slots={mergedSlots}
          upstream={
            rawUpstream ?? {
              textList: [],
              imageList: [],
              videoList: [],
              audioList: [],
              entries: [],
            }
          }
          fileContext={fileContext}
          disabled={readonly && !editing}
          cachedAssignment={effectiveSnapshot?.slotAssignment as PersistedSlotMap | undefined}
          cachedUserTexts={effectiveSnapshot?.userTexts}
          onAssignmentChange={handleSlotInputsChange}
          onSlotAssignmentChange={handleSlotAssignmentPersist}
          onUserTextsChange={handleUserTextsChange}
        />
      ) : null}

      {/* -- Variant Form -- */}
      <VariantFormTransition variantKey={selectedVariant ? `${selectedVariant.id}:${readonly && !editing ? primaryEntry?.id : 'edit'}:${cancelCounter}` : null}>
        {selectedVariant ? (
          <GenericVariantForm
            variantId={selectedVariant.id}
            upstream={upstream}
            nodeResourceUrl={undefined}
            disabled={readonly && !editing}
            initialParams={effectiveSnapshot}
            onParamsChange={(snapshot) => {
              cache.update(cacheKey, { params: snapshot.params })
              setPricingParams(snapshot.params ?? {})
            }}
            onWarningChange={setVariantWarning}
            resolvedSlots={resolvedSlots}
            overrideParams={remoteParams}
          />
        ) : null}
      </VariantFormTransition>

      {/* -- Generate Action Bar -- */}
      {!showFallback ? (
        <GenerateActionBar
          hasResource={hasResource}
          generating={isGenerating}
          disabled={isGenerateDisabled}
          buttonClassName="bg-foreground text-background hover:bg-foreground/90"
          onGenerate={handleGenerate}
          onGenerateNewNode={handleGenerateNew}
          readonly={readonly}
          editing={editing}
          onUnlock={onUnlock}
          onCancelEdit={handleCancelEdit}
          estimateParams={pricingParams}
          warningMessage={variantWarning}
          initialTarget={aiConfig?.generateTarget}
          onTargetChange={handleTargetChange}
          variants={selectedFeature?.variants
            ?.filter((v) => isVariantApplicable(v.id))
            .map((v) => ({
              id: v.id,
              displayName: v.displayName || v.featureTabName || v.id,
            }))}
          selectedVariantId={selectedVariant?.id ?? undefined}
          onVariantChange={editing ? undefined : setSelectedVariantId}
        />
      ) : null}
    </div>
  )
}
