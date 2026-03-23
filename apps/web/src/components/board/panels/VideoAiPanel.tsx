/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Loader2,
} from 'lucide-react'
import type { CanvasNodeElement } from '../engine/types'
import type { UpstreamData } from '../engine/upstream-data'
import type { VideoNodeProps } from '../nodes/VideoNode'
import type { AiGenerateConfig } from '../board-contracts'
import { MEDIA_FEATURES, type MediaFeatureId } from '@openloaf-saas/sdk'
import { useCapabilities } from '@/hooks/use-capabilities'
import { resolveAllMediaInputs } from '@/lib/media-upload'
import { GenerateActionBar } from './GenerateActionBar'
import { VIDEO_VARIANTS } from './variants/video'
import type { VariantContext } from './variants/types'
import type { MediaReference, PersistedSlotMap } from './variants/slot-types'
import type { ResolvedSlotInputs } from './variants/shared/InputSlotBar'
import { ScrollableTabBar } from '../ui/ScrollableTabBar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** v3-aware generate params emitted by the panel. */
export type VideoGenerateParams = {
  /** v3 feature id (e.g. 'videoGenerate', 'lipSync'). */
  feature: string
  /** v3 variant id (e.g. 'OL-VG-001'). Optional for legacy callers. */
  variant?: string
  /** v3 inputs (images, audio, prompt etc.). */
  inputs?: Record<string, unknown>
  /** v3 params (style, duration, aspectRatio etc.). */
  params?: Record<string, unknown>
  /** Number of results to generate. */
  count?: number
  /** Seed for reproducibility. */
  seed?: number
  /** Credits per call for this variant (informational). */
  creditsPerCall?: number

  // ── Legacy fields kept for backward compat with VideoNode caller ──
  /** @deprecated Use inputs/params instead. */
  prompt?: string
  /** @deprecated Use params.aspectRatio instead. */
  aspectRatio?: string
  /** @deprecated Use params.duration instead. */
  duration?: number
  /** @deprecated Use params.quality instead. */
  quality?: string
  /** @deprecated Use params.mode instead. */
  mode?: string
  /** @deprecated Use params.withAudio instead. */
  withAudio?: boolean
  /** @deprecated Use inputs.startImage instead. */
  firstFrameImageSrc?: string
  /** @deprecated Use inputs.endImage instead. */
  endFrameImageSrc?: string
  /** @deprecated Use inputs.images instead. */
  referenceImageSrcs?: string[]
  /** @deprecated Use inputs.person instead. */
  personSrc?: string
  /** @deprecated Use inputs.audio instead. */
  audioSrc?: string
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
  rawUpstream: _rawUpstream,
  boardId,
  projectId,
  boardFolderUri,
  readonly = false,
  editing = false,
  onUnlock,
  onCancelEdit,
}: VideoAiPanelProps) {
  const { t, i18n } = useTranslation('board')
  const prefLang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const aiConfig = element.props.aiConfig

  // ── v3 Capabilities ──
  const {
    data: capsData,
    loading: capsLoading,
    error: capsError,
    refresh: capsRefresh,
  } = useCapabilities('video')

  const features = useMemo(() => capsData?.features ?? [], [capsData])

  // ── Feature tab state ──
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>(
    (aiConfig?.feature as string) ?? '',
  )

  // Auto-select first feature when caps load.
  useEffect(() => {
    if (features.length > 0 && !features.find((f) => f.id === selectedFeatureId)) {
      setSelectedFeatureId(features[0].id)
    }
  }, [features, selectedFeatureId])

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId],
  )

  // ── Variant context & applicability ──
  const variantCtx: VariantContext = useMemo(() => ({
    nodeHasImage: false, // video nodes don't have a "current image"
    hasImage: Boolean(upstreamImages?.length),
    hasAudio: Boolean(upstreamAudioUrl),
    hasVideo: Boolean(upstreamVideoUrl),
  }), [upstreamImages?.length, upstreamAudioUrl, upstreamVideoUrl])

  const isVariantApplicable = useCallback((variantId: string) => {
    const def = VIDEO_VARIANTS[variantId]
    return !def || def.isApplicable(variantCtx)
  }, [variantCtx])

  // ── Variant selector state ──
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')

  // Auto-select first applicable variant when feature changes.
  useEffect(() => {
    if (selectedFeature?.variants?.length) {
      const current = selectedFeature.variants.find((v) => v.id === selectedVariantId && isVariantApplicable(v.id))
      if (!current) {
        const first = selectedFeature.variants.find(v => isVariantApplicable(v.id))
        setSelectedVariantId(first?.id ?? selectedFeature.variants[0].id)
      }
    }
  }, [selectedFeature, selectedVariantId, isVariantApplicable])

  const selectedVariant = useMemo(
    () => {
      if (!selectedFeature?.variants?.length) return null
      if (selectedVariantId) {
        const found = selectedFeature.variants.find((v) => v.id === selectedVariantId && isVariantApplicable(v.id))
        if (found) return found
      }
      return selectedFeature.variants.find(v => isVariantApplicable(v.id))
        ?? selectedFeature.variants[0]
    },
    [selectedFeature, selectedVariantId, isVariantApplicable],
  )

  // ── Variant warning ──
  const [variantWarning, setVariantWarning] = useState<string | null>(null)

  // Clear warning when feature/variant changes
  useEffect(() => {
    setVariantWarning(null)
  }, [selectedFeatureId, selectedVariantId])

  // ── Variant form params (updated by variant component) ──
  const latestParams = useRef<{
    inputs: Record<string, unknown>
    params: Record<string, unknown>
    count?: number
    seed?: number
    slotAssignment?: PersistedSlotMap
  }>({ inputs: {}, params: {} })

  // ── Params cache — in-memory map for instant reads, async persist to node ──
  const aiConfigRef = useRef(aiConfig)
  aiConfigRef.current = aiConfig
  const activeKeyRef = useRef('')
  const paramsCacheLocal = useRef(
    (aiConfig?.paramsCache ?? {}) as Record<string, typeof latestParams.current>,
  )

  const persistCacheToNode = useCallback(() => {
    const key = activeKeyRef.current
    if (key) paramsCacheLocal.current[key] = latestParams.current
    onUpdate({
      aiConfig: {
        prompt: '',
        ...aiConfigRef.current,
        paramsCache: { ...paramsCacheLocal.current },
      },
    })
  }, [onUpdate])

  // Save old variant to local cache before switching
  useEffect(() => {
    const newKey = selectedVariant ? `${selectedFeatureId}:${selectedVariant.id}` : ''
    const prevKey = activeKeyRef.current
    if (prevKey && prevKey !== newKey) {
      paramsCacheLocal.current[prevKey] = { ...latestParams.current }
      persistCacheToNode()
    }
    activeKeyRef.current = newKey
  }, [selectedFeatureId, selectedVariant?.id, persistCacheToNode])

  // Persist to node when panel unmounts
  useEffect(() => {
    return () => persistCacheToNode()
  }, [persistCacheToNode])

  const handleParamsChange = useCallback(
    (params: {
      inputs: Record<string, unknown>
      params: Record<string, unknown>
      count?: number
      seed?: number
      slotAssignment?: PersistedSlotMap
    }) => {
      latestParams.current = params
      const key = activeKeyRef.current
      if (key) paramsCacheLocal.current[key] = params
    },
    [],
  )

  // ── Slot system ──

  /** Persist slot assignment to paramsCache so it survives panel close/reopen. */
  const handleSlotAssignmentPersist = useCallback((map: PersistedSlotMap) => {
    latestParams.current = { ...latestParams.current, slotAssignment: map }
    const key = activeKeyRef.current
    if (key) {
      paramsCacheLocal.current[key] = { ...latestParams.current, slotAssignment: map }
    }
  }, [])

  /** Receive resolved slot inputs from InputSlotBar and merge into state. */
  const [resolvedSlots, setResolvedSlots] = useState<Record<string, MediaReference[]>>({})

  const handleSlotInputsChange = useCallback((resolved: ResolvedSlotInputs) => {
    setResolvedSlots(resolved.mediaRefs)
    // Merge slot-resolved inputs into the current params
    latestParams.current = {
      ...latestParams.current,
      inputs: { ...latestParams.current.inputs, ...resolved.inputs },
    }
    const key = activeKeyRef.current
    if (key) paramsCacheLocal.current[key] = latestParams.current
  }, [])

  // ── Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)

  const isGenerateDisabled = useMemo(() => {
    if (!selectedFeature || !selectedVariant) return true
    const def = VIDEO_VARIANTS[selectedVariant.id]
    if (def?.isDisabled?.(variantCtx)) return true
    return false
  }, [selectedFeature, selectedVariant, variantCtx])

  /** Collect params without uploading media — fast, for immediate node creation. */
  const collectParams = useCallback((): VideoGenerateParams => {
    const p = latestParams.current
    const promptValue =
      (p.params?.prompt as string) ??
      (p.inputs?.prompt as string) ??
      ''

    return {
      feature: selectedFeatureId,
      variant: selectedVariantId,
      inputs: { ...p.inputs },
      params: p.params,
      count: p.count,
      seed: p.seed,
      creditsPerCall: selectedVariant?.creditsPerCall,
      // Legacy compat fields
      prompt: promptValue,
      aspectRatio: (p.params?.aspectRatio as string) ?? 'auto',
      duration: (p.params?.duration as number) ?? 5,
      quality: (p.params?.quality as string) ?? undefined,
      mode: (p.params?.mode as string) ?? undefined,
    }
  }, [selectedFeatureId, selectedVariantId, selectedVariant])

  /** Build VideoGenerateParams with media uploaded to public URLs. */
  const buildParams = useCallback(async (): Promise<VideoGenerateParams> => {
    const params = collectParams()
    const resolvedInputs = params.inputs ? await resolveAllMediaInputs(params.inputs, boardId) : params.inputs
    return { ...params, inputs: resolvedInputs }
  }, [collectParams, boardId])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)

    const params = await buildParams()

    // Snapshot current variant params into local cache before persisting
    const key = activeKeyRef.current
    if (key) paramsCacheLocal.current[key] = latestParams.current
    const config: AiGenerateConfig = {
      ...aiConfigRef.current,
      feature: params.feature as AiGenerateConfig['feature'],
      prompt: params.prompt ?? '',
      aspectRatio: params.aspectRatio as AiGenerateConfig['aspectRatio'],
      paramsCache: { ...paramsCacheLocal.current },
    }
    onUpdate({
      origin: 'ai-generate',
      aiConfig: config,
    })

    onGenerate?.(params)
    setTimeout(() => setIsGenerating(false), 300)
  }, [isGenerating, buildParams, onUpdate, onGenerate])

  const handleGenerateNew = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)

    // Use collectParams (no S3 upload) so the child node is created immediately.
    const params = collectParams()
    onGenerateNewNode?.(params)
    setTimeout(() => setIsGenerating(false), 300)
  }, [isGenerating, collectParams, onGenerateNewNode])

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
    [upstreamText, upstreamImages, upstreamImagePaths, upstreamAudioUrl, upstreamVideoUrl, boardId, projectId, boardFolderUri],
  )

  // ── Resolve variant form component ──
  const VariantForm = selectedVariant
    ? VIDEO_VARIANTS[selectedVariant.id]?.component ?? null
    : null

  const showFallback = !features.length

  return (
    <div
      className={[
        'flex w-[420px] flex-col gap-2.5 rounded-3xl border border-border bg-card p-3 shadow-lg',
        readonly ? 'opacity-80' : '',
      ].join(' ')}
    >
      {/* -- Fallback: loading / error / empty -- */}
      {showFallback ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 py-6">
          {capsLoading ? (
            <>
              <Loader2 size={20} className="animate-spin text-muted-foreground/60" />
              <span className="text-xs text-muted-foreground">{t('v3.common.loading')}</span>
            </>
          ) : capsError ? (
            <>
              <span className="text-sm font-medium text-muted-foreground">{t('v3.common.loadError')}</span>
              <span className="text-[11px] text-muted-foreground/60">{t('v3.common.loadErrorHint')}</span>
              <button
                type="button"
                className="mt-1 rounded-full border border-border px-3.5 py-1 text-xs text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
                onClick={() => capsRefresh()}
              >
                {t('v3.common.retry')}
              </button>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-muted-foreground">{t('v3.common.loadError')}</span>
              <span className="text-[11px] text-muted-foreground/60">{t('v3.common.loadErrorHint')}</span>
              <button
                type="button"
                className="mt-1 rounded-full border border-border px-3.5 py-1 text-xs text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
                onClick={() => capsRefresh()}
              >
                {t('v3.common.retry')}
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* -- Feature Tabs (dynamic from capabilities) -- */}
      {!showFallback ? (
        <ScrollableTabBar className="items-center">
          {features
            .filter((f) => {
              if (readonly && !editing) return f.id === selectedFeatureId
              if (f.variants.every(v => !isVariantApplicable(v.id))) return false
              return true
            })
            .map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={readonly && !editing}
                className={[
                  'shrink-0 whitespace-nowrap rounded-3xl px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                  selectedFeatureId === f.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
                onClick={() => setSelectedFeatureId(f.id)}
              >
                {MEDIA_FEATURES[f.id as MediaFeatureId]?.label[prefLang] ?? f.id}
              </button>
            ))}
        </ScrollableTabBar>
      ) : null}

      {/* -- Variant Form -- */}
      {selectedVariant && VariantForm ? (
        <VariantForm
          variant={selectedVariant}
          upstream={upstream}
          nodeResourceUrl={undefined}
          disabled={readonly}
          initialParams={paramsCacheLocal.current[`${selectedFeatureId}:${selectedVariant.id}`] ?? aiConfig?.paramsCache?.[`${selectedFeatureId}:${selectedVariant.id}`]}
          onParamsChange={handleParamsChange}
          onWarningChange={setVariantWarning}
          resolvedSlots={resolvedSlots}
        />
      ) : selectedVariant ? (
        // Fallback for unknown variants
        <div className="flex flex-col items-center justify-center gap-1 rounded-3xl bg-ol-surface-muted px-3 py-4">
          <span className="text-xs text-muted-foreground">
            {t('v3.unknownVariant', {
              defaultValue: 'This variant is not yet supported in the UI',
            })}
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            {selectedVariant.id}
          </span>
        </div>
      ) : null}

      {/* -- Generate Action Bar -- */}
      {!showFallback ? <GenerateActionBar
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
        creditsPerCall={selectedVariant?.creditsPerCall}
        warningMessage={variantWarning}
        variants={selectedFeature?.variants
          ?.filter((v) => isVariantApplicable(v.id))
          .map((v) => {
            return {
              id: v.id,
              displayName: v.featureTabName ?? v.id,
              creditsPerCall: v.creditsPerCall,
            }
          })}
        selectedVariantId={selectedVariant?.id ?? undefined}
        onVariantChange={setSelectedVariantId}
      /> : null}
    </div>
  )
}
