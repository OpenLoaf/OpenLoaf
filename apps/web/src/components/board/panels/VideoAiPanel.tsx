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
import type { VideoNodeProps } from '../nodes/VideoNode'
import type { AiGenerateConfig } from '../board-contracts'
import { useCapabilities } from '@/hooks/use-capabilities'
import { GenerateActionBar } from './GenerateActionBar'
import { VIDEO_VARIANT_REGISTRY } from './variants/video'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** v3-aware generate params emitted by the panel. */
export type VideoGenerateParams = {
  /** v3 feature id (e.g. 'videoGenerate', 'lipSync'). */
  feature: string
  /** v3 variant id (e.g. 'vid-gen-qwen'). Optional for legacy callers. */
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
  upstreamImages?: string[]
  upstreamAudioUrl?: string
  upstreamVideoUrl?: string
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
  upstreamAudioUrl,
  upstreamVideoUrl,
  readonly = false,
  editing = false,
  onUnlock,
  onCancelEdit,
}: VideoAiPanelProps) {
  const { t } = useTranslation('board')
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

  // ── Variant selector state ──
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')

  // Auto-select first variant when feature changes.
  useEffect(() => {
    if (selectedFeature?.variants?.length) {
      const current = selectedFeature.variants.find((v) => v.id === selectedVariantId)
      if (!current) {
        setSelectedVariantId(selectedFeature.variants[0].id)
      }
    }
  }, [selectedFeature, selectedVariantId])

  const selectedVariant = useMemo(
    () => selectedFeature?.variants?.find((v) => v.id === selectedVariantId) ?? null,
    [selectedFeature, selectedVariantId],
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
  }>({ inputs: {}, params: {} })

  const handleParamsChange = useCallback(
    (params: {
      inputs: Record<string, unknown>
      params: Record<string, unknown>
      count?: number
      seed?: number
    }) => {
      latestParams.current = params
    },
    [],
  )

  // ── Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)

  const isGenerateDisabled = useMemo(() => {
    if (!selectedFeature || !selectedVariant) return true
    return false
  }, [selectedFeature, selectedVariant])

  /** Build VideoGenerateParams from the current state. */
  const buildParams = useCallback((): VideoGenerateParams => {
    const p = latestParams.current
    const promptValue =
      (p.params?.prompt as string) ??
      (p.inputs?.prompt as string) ??
      ''

    return {
      feature: selectedFeatureId,
      variant: selectedVariantId,
      inputs: p.inputs,
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

  const handleGenerate = useCallback(() => {
    if (isGenerating) return
    setIsGenerating(true)

    const params = buildParams()

    const config: AiGenerateConfig = {
      feature: params.feature as AiGenerateConfig['feature'],
      prompt: params.prompt ?? '',
      aspectRatio: params.aspectRatio as AiGenerateConfig['aspectRatio'],
    }
    onUpdate({
      origin: 'ai-generate',
      aiConfig: config,
    })

    onGenerate?.(params)
    setTimeout(() => setIsGenerating(false), 300)
  }, [isGenerating, buildParams, onUpdate, onGenerate])

  const handleGenerateNew = useCallback(() => {
    if (isGenerating) return
    setIsGenerating(true)

    const params = buildParams()
    onGenerateNewNode?.(params)
    setTimeout(() => setIsGenerating(false), 300)
  }, [isGenerating, buildParams, onGenerateNewNode])

  const hasResource = Boolean(element.props.sourcePath)

  // ── Upstream data for variant components ──
  const upstream = useMemo(
    () => ({
      textContent: upstreamText,
      images: upstreamImages,
      audioUrl: upstreamAudioUrl,
      videoUrl: upstreamVideoUrl,
    }),
    [upstreamText, upstreamImages, upstreamAudioUrl, upstreamVideoUrl],
  )

  // ── Resolve variant form component ──
  const VariantForm = selectedVariant
    ? VIDEO_VARIANT_REGISTRY[selectedVariant.id] ?? null
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
            <span className="text-xs text-muted-foreground">{t('v3.common.noVariants')}</span>
          )}
        </div>
      ) : null}

      {/* -- Feature Tabs (dynamic from capabilities) -- */}
      {!showFallback ? (
        <div className="flex items-center gap-1 rounded-3xl bg-ol-surface-muted p-0.5">
          {features
            .filter((f) => (readonly && !editing ? f.id === selectedFeatureId : true))
            .map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={readonly && !editing}
                className={[
                  'flex-1 rounded-3xl px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                  selectedFeatureId === f.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
                onClick={() => setSelectedFeatureId(f.id)}
              >
                {t(`v3.features.${f.id}`, { defaultValue: f.displayName })}
              </button>
            ))}
        </div>
      ) : null}

      {/* -- Variant Form -- */}
      {selectedVariant && VariantForm ? (
        <VariantForm
          variant={selectedVariant}
          upstream={upstream}
          nodeResourceUrl={undefined}
          disabled={readonly}
          onParamsChange={handleParamsChange}
          onWarningChange={setVariantWarning}
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
        creditsPerCall={selectedVariant?.creditsPerCall}
        warningMessage={variantWarning}
        variants={selectedFeature?.variants?.map((v) => ({
          id: v.id,
          displayName: t(`v3.variants.${v.id}`, { defaultValue: v.displayName }),
          creditsPerCall: v.creditsPerCall,
        }))}
        selectedVariantId={selectedVariant?.id ?? undefined}
        onVariantChange={setSelectedVariantId}
      />
    </div>
  )
}
