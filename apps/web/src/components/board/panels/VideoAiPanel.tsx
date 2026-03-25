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
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import type { CanvasNodeElement } from '../engine/types'
import type { UpstreamData } from '../engine/upstream-data'
import type { VideoNodeProps } from '../nodes/VideoNode'
import type { AiGenerateConfig } from '../board-contracts'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { fetchUserProfile } from '@/lib/saas-auth'
import { PricingDialog } from '@/components/billing/PricingDialog'
import { GenerateActionBar } from './GenerateActionBar'
import { serializeForGenerate } from './variants/serialize'
import type { MediaReference, MediaType, PersistedSlotMap } from './variants/slot-types'
import { InputSlotBar, type ResolvedSlotInputs } from './variants/shared/InputSlotBar'
import { GenericVariantForm } from './variants/shared/GenericVariantForm'
import type { BoardFileContext } from '../board-contracts'
import { useVariantPanel } from './hooks/useVariantPanel'
import { useVariantParamsCache } from './hooks/useVariantParamsCache'
import { CapabilitiesFallback } from './shared/CapabilitiesFallback'
import { FeatureTabBar } from './shared/FeatureTabBar'

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
  /** Seed for reproducibility. */
  seed?: number
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
  const isVideoLocked =
    loggedIn &&
    membershipLevel != null &&
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
    initialFeatureId: (aiConfig?.feature as string) ?? '',
    cachedFeatureId: aiConfig?.feature as string | undefined,
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

  const cache = useVariantParamsCache({
    activeKey: cacheKey,
    initialCache: (aiConfig?.paramsCache ?? {}) as Record<string, any>,
    onPersist: (cacheMap) => {
      onUpdate({
        aiConfig: {
          prompt: '',
          ...aiConfigRef.current,
          paramsCache: cacheMap,
        },
      })
    },
  })

  // ── Pricing params (reactive for estimate API) ──
  const [pricingParams, setPricingParams] = useState<Record<string, unknown>>({})

  // ── Slot system ──
  const [resolvedSlots, setResolvedSlots] = useState<Record<string, MediaReference[]>>({})

  const handleSlotInputsChange = useCallback(
    (resolved: ResolvedSlotInputs) => {
      setResolvedSlots(resolved.mediaRefs)
      setSlotsValid(resolved.isValid)
      cache.updateParams({
        ...cache.paramsRef.current,
        inputs: { ...cache.paramsRef.current.inputs, ...resolved.inputs },
      })
    },
    [cache],
  )

  const handleSlotAssignmentPersist = useCallback(
    (map: PersistedSlotMap) => {
      cache.updateParams({
        ...cache.paramsRef.current,
        slotAssignment: map,
      })
    },
    [cache],
  )

  // ── Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)
  const [slotsValid, setSlotsValid] = useState(false)

  const isGenerateDisabled = useMemo(() => {
    if (!selectedFeature || !selectedVariant) return true
    if (!slotsValid) return true
    return false
  }, [selectedFeature, selectedVariant, slotsValid])

  /** Collect params without uploading media — fast, for immediate node creation. */
  const collectParams = useCallback((): VideoGenerateParams => {
    const vid = selectedVariant?.id ?? selectedVariantId ?? ''
    if (!vid) throw new Error('No variant definition available')

    const p = cache.paramsRef.current
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
        taskRefs: {},
        params: p.params ?? {},
        count: p.count,
        seed: p.seed,
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
  ])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)

    try {
      const params = collectParams()

      const config: AiGenerateConfig = {
        ...aiConfigRef.current,
        feature: params.feature as AiGenerateConfig['feature'],
        prompt: params.prompt ?? '',
        aspectRatio: params.aspectRatio as AiGenerateConfig['aspectRatio'],
        paramsCache: {
          ...((aiConfigRef.current?.paramsCache as any) ?? {}),
          ...(cacheKey ? { [cacheKey]: cache.paramsRef.current } : {}),
        },
      }
      onUpdate({
        origin: 'ai-generate',
        aiConfig: config,
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
  }, [isGenerating, collectParams, onUpdate, onGenerate, t])

  const handleGenerateNew = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)

    try {
      const params = collectParams()
      onGenerateNewNode?.(params)
    } catch (err) {
      console.error('[VideoAiPanel] handleGenerateNew failed:', err)
      toast.error(
        t('v3.errors.prepareFailed', { defaultValue: '准备生成参数失败，请重试' }),
      )
    } finally {
      setTimeout(() => setIsGenerating(false), 300)
    }
  }, [isGenerating, collectParams, onGenerateNewNode, t])

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

      {/* -- Feature Tabs -- */}
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
        />
      ) : null}

      {/* -- InputSlotBar (V3 declarative slot assignment) -- */}
      {mergedSlots?.length && selectedVariant ? (
        <InputSlotBar
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
          cachedAssignment={
            cache.getCached(`${selectedFeatureId}:${selectedVariant.id}`)
              ?.slotAssignment as PersistedSlotMap | undefined
          }
          onAssignmentChange={handleSlotInputsChange}
          onSlotAssignmentChange={handleSlotAssignmentPersist}
        />
      ) : null}

      {/* -- Variant Form -- */}
      {selectedVariant ? (
        <GenericVariantForm
          key={selectedVariant.id}
          variantId={selectedVariant.id}
          upstream={upstream}
          nodeResourceUrl={undefined}
          disabled={readonly && !editing}
          initialParams={
            cache.getCached(`${selectedFeatureId}:${selectedVariant.id}`) ??
            aiConfig?.paramsCache?.[`${selectedFeatureId}:${selectedVariant.id}`]
          }
          onParamsChange={(snapshot) => {
            cache.updateParams({
              ...cache.paramsRef.current,
              params: snapshot.params,
              count: snapshot.count,
              seed: snapshot.seed,
            })
            setPricingParams(snapshot.params ?? {})
          }}
          onWarningChange={setVariantWarning}
          resolvedSlots={resolvedSlots}
          overrideParams={remoteParams}
        />
      ) : null}

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
          onCancelEdit={onCancelEdit}
          estimateParams={pricingParams}
          warningMessage={variantWarning}
          variants={selectedFeature?.variants
            ?.filter((v) => isVariantApplicable(v.id))
            .map((v) => ({
              id: v.id,
              displayName: v.displayName || v.featureTabName || v.id,
            }))}
          selectedVariantId={selectedVariant?.id ?? undefined}
          onVariantChange={setSelectedVariantId}
        />
      ) : null}
    </div>
  )
}
