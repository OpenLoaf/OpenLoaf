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
  Paintbrush,
  Redo2,
  Undo2,
} from 'lucide-react'
import { MEDIA_PREFERENCES, MEDIA_FEATURES, type MediaPreferenceId, type MediaFeatureId } from '@openloaf-saas/sdk'
import { useCapabilities } from '@/hooks/use-capabilities'
import type { V3Feature, V3Variant } from '@/lib/saas-media'
import { BRUSH_MIN_SIZE, BRUSH_MAX_SIZE } from '../nodes/MaskPaintOverlay'
import { resolveAllMediaInputs } from '@/lib/media-upload'
import { saveBoardAssetFile } from '../utils/board-asset'
import type { CanvasNodeElement } from '../engine/types'
import type { ImageNodeProps } from '../nodes/ImageNode'
import type { AiGenerateConfig } from '../board-contracts'
import {
  BOARD_GENERATE_INPUT,
} from '../ui/board-style-system'
import { IMAGE_VARIANTS } from './variants/image'
import type { VariantContext, VariantFormProps } from './variants/types'
import { GenerateActionBar } from './GenerateActionBar'
import { ScrollableTabBar } from '../ui/ScrollableTabBar'

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Parameters passed to the onGenerate callback (v3-compatible). */
export type ImageGenerateParams = {
  feature: string
  variant: string
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  seed?: number
  // Backward compat fields
  prompt?: string
  aspectRatio?: string
}


export type ImageAiPanelProps = {
  element: CanvasNodeElement<ImageNodeProps>
  onUpdate: (patch: Partial<ImageNodeProps>) => void
  upstreamText?: string
  /** Resolved browser-friendly URLs for display/thumbnails. */
  upstreamImages?: string[]
  /** Raw board-relative paths for API submission (e.g. "asset/xxx.jpg"). */
  upstreamImagePaths?: string[]
  upstreamAudioUrl?: string
  upstreamVideoUrl?: string
  /** Resolved browser-friendly source URL for the current image. */
  resolvedImageSrc?: string
  /** Board context for variant MediaSlot preview resolution & file saving. */
  boardId?: string
  projectId?: string
  boardFolderUri?: string
  /** Callback to trigger actual image generation. */
  onGenerate?: (params: ImageGenerateParams) => void
  /** Callback to generate into a new derived node. */
  onGenerateNewNode?: (params: ImageGenerateParams) => void
  /** Whether mask painting is currently active on the node. */
  maskPainting?: boolean
  /** Toggle mask painting mode on the node. */
  onToggleMaskPaint?: (active: boolean) => void
  /** Current mask data from the node overlay. */
  maskResult?: import('../nodes/MaskPaintOverlay').MaskPaintResult | null
  /** Ref to the MaskPaintOverlay for brush controls. */
  maskPaintRef?: React.RefObject<import('../nodes/MaskPaintOverlay').MaskPaintHandle | null>
  /** Current brush size from the overlay (reactive state). */
  brushSize?: number
  /** When true, all inputs are disabled and generate button is hidden (post-generation lock). */
  readonly?: boolean
  /** Editing mode -- user unlocked an existing result to tweak params. */
  editing?: boolean
  /** Callback to unlock the panel for editing (override readonly). */
  onUnlock?: () => void
  /** Callback to cancel editing mode (re-lock the panel). */
  onCancelEdit?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generic fallback for unknown variant IDs.
 * Shows a simple prompt field so the user can still generate.
 */
function GenericVariantFallback({
  variant,
  upstream,
  disabled,
  onParamsChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')
  const [prompt, setPrompt] = useState('')

  const sync = useCallback(() => {
    onParamsChange({
      inputs: { prompt },
      params: {},
    })
  }, [prompt, onParamsChange])

  useEffect(() => { sync() }, [sync])

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className={[
          'min-h-[68px] w-full resize-none rounded-3xl border px-3 py-2 text-sm leading-relaxed',
          BOARD_GENERATE_INPUT,
          disabled ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}
        placeholder={t('v3.params.prompt', { defaultValue: 'Describe what you want...' })}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        disabled={disabled}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** AI image generation parameter panel displayed below image nodes (v3). */
export function ImageAiPanel({
  element,
  onUpdate,
  upstreamText,
  upstreamImages,
  upstreamImagePaths,
  upstreamAudioUrl,
  upstreamVideoUrl,
  resolvedImageSrc,
  onGenerate,
  onGenerateNewNode,
  maskPainting = false,
  onToggleMaskPaint,
  maskResult,
  maskPaintRef,
  brushSize: brushSizeProp = 40,
  readonly = false,
  editing = false,
  onUnlock,
  onCancelEdit,
  boardId,
  projectId,
  boardFolderUri,
}: ImageAiPanelProps) {
  const { t, i18n } = useTranslation('board')
  const prefLang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const aiConfig = element.props.aiConfig

  // ── v3 capabilities ──
  const {
    data: capabilities,
    loading: capsLoading,
    error: capsError,
    refresh: capsRefresh,
  } = useCapabilities('image')
  const features = capabilities?.features ?? []

  // ── Feature & variant selection state ──
  // When the node already has an image, default to imageEdit (user intent is to
  // modify the existing image, not generate from scratch).
  const nodeHasImage = Boolean(element.props.previewSrc || element.props.originalSrc)
  const initialFeatureId = (aiConfig?.feature as string | undefined)
    ?? (nodeHasImage ? 'imageEdit' : 'imageGenerate')
  const [selectedFeatureId, setSelectedFeatureId] = useState(initialFeatureId)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)

  // Resolve current feature and variant from capabilities
  const selectedFeature: V3Feature | undefined = useMemo(
    () => features.find(f => f.id === selectedFeatureId) ?? features[0],
    [features, selectedFeatureId],
  )

  // Build variant context — each variant uses this to decide applicability
  const variantCtx: VariantContext = useMemo(() => ({
    nodeHasImage,
    hasImage: Boolean(element.props.previewSrc || element.props.originalSrc || upstreamImages?.length),
    hasAudio: Boolean(upstreamAudioUrl),
    hasVideo: Boolean(upstreamVideoUrl),
  }), [nodeHasImage, element.props.previewSrc, element.props.originalSrc, upstreamImages?.length, upstreamAudioUrl, upstreamVideoUrl])

  /** Check if a variant is applicable in the current context. */
  const isVariantApplicable = useCallback((variantId: string) => {
    const def = IMAGE_VARIANTS[variantId]
    return !def || def.isApplicable(variantCtx)
  }, [variantCtx])

  // Smart default: pick the first applicable variant.
  const selectedVariant: V3Variant | undefined = useMemo(() => {
    if (!selectedFeature) return undefined
    // Explicit user selection — honour it if applicable
    if (selectedVariantId) {
      const found = selectedFeature.variants.find(v => v.id === selectedVariantId)
      if (found && isVariantApplicable(found.id)) return found
    }
    // Default: first applicable variant
    const applicable = selectedFeature.variants.find(v => isVariantApplicable(v.id))
    if (applicable) return applicable
    return selectedFeature.variants[0]
  }, [selectedFeature, selectedVariantId, isVariantApplicable])

  // Sync feature selection when capabilities arrive or aiConfig changes
  // Helper: does a feature have at least one applicable variant?
  const featureHasApplicable = useCallback(
    (feat: V3Feature) => feat.variants.some(v => isVariantApplicable(v.id)),
    [isVariantApplicable],
  )

  useEffect(() => {
    if (!features.length) return
    const configFeature = aiConfig?.feature as string | undefined
    // Honour cached feature if it has applicable variants
    if (configFeature) {
      const feat = features.find(f => f.id === configFeature)
      if (feat && featureHasApplicable(feat)) {
        setSelectedFeatureId(configFeature)
        return
      }
    }
    // Fallback: first feature with applicable variants
    const fallback = features.find(f => featureHasApplicable(f))
    if (fallback) {
      setSelectedFeatureId(fallback.id)
    } else if (!features.some(f => f.id === selectedFeatureId)) {
      setSelectedFeatureId(features[0].id)
    }
  }, [features, aiConfig?.feature, featureHasApplicable]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Variant params (collected from the active variant form) ──
  const variantParamsRef = useRef<{
    inputs: Record<string, unknown>
    params: Record<string, unknown>
    count?: number
    seed?: number
  }>({ inputs: {}, params: {} })

  // ── Params cache — in-memory map for instant reads, async persist to node ──
  const aiConfigRef = useRef(aiConfig)
  aiConfigRef.current = aiConfig
  const activeKeyRef = useRef('')
  // Local cache map — always up-to-date, survives feature/variant switching within same panel session.
  const paramsCacheLocal = useRef(
    (aiConfig?.paramsCache ?? {}) as Record<string, typeof variantParamsRef.current>,
  )

  const persistCacheToNode = useCallback(() => {
    // Flush current variant params into local map
    const key = activeKeyRef.current
    if (key) paramsCacheLocal.current[key] = variantParamsRef.current
    onUpdate({
      aiConfig: {
        prompt: '',
        ...aiConfigRef.current,
        paramsCache: { ...paramsCacheLocal.current },
      },
    })
  }, [onUpdate])

  // Track active key — save old variant to local cache before switching
  useEffect(() => {
    const newKey = selectedVariant ? `${selectedFeatureId}:${selectedVariant.id}` : ''
    const prevKey = activeKeyRef.current
    if (prevKey && prevKey !== newKey) {
      // Snapshot current params into local cache BEFORE new form overwrites variantParamsRef
      paramsCacheLocal.current[prevKey] = { ...variantParamsRef.current }
      persistCacheToNode()
    }
    activeKeyRef.current = newKey
  }, [selectedFeatureId, selectedVariant?.id, persistCacheToNode])

  // Persist to node when panel unmounts
  useEffect(() => {
    return () => persistCacheToNode()
  }, [persistCacheToNode])

  const handleVariantParamsChange = useCallback((params: {
    inputs: Record<string, unknown>
    params: Record<string, unknown>
    count?: number
    seed?: number
  }) => {
    variantParamsRef.current = params
    // Also keep local cache in sync for instant reads on switch
    const key = activeKeyRef.current
    if (key) paramsCacheLocal.current[key] = params
  }, [])

  // ── Variant warning ──
  const [variantWarning, setVariantWarning] = useState<string | null>(null)

  // Clear warning when feature/variant changes
  useEffect(() => {
    setVariantWarning(null)
  }, [selectedFeatureId, selectedVariantId])

  // ── Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)

  /** Whether the node currently has a resource. */
  const hasResource = Boolean(element.props.previewSrc || element.props.originalSrc)

  /** Whether mask painting is needed for the current variant. */
  // 逻辑：readonly（未解锁编辑）时不激活遮罩绘制，避免光标提前变成遮罩圆圈。
  const variantDef = selectedVariant ? IMAGE_VARIANTS[selectedVariant.id] : undefined
  const needsMaskPaint = selectedVariant && !(readonly && !editing)
    ? Boolean(variantDef?.maskPaint)
    : false

  // Toggle mask painting when variant changes
  useEffect(() => {
    onToggleMaskPaint?.(needsMaskPaint)
  }, [needsMaskPaint, onToggleMaskPaint])

  // ── Callbacks ──


  /** Collect params without uploading media — fast, for immediate node creation. */
  const collectParams = useCallback(async (): Promise<ImageGenerateParams> => {
    const vp = variantParamsRef.current
    const inputs = { ...vp.inputs }
    const params = { ...vp.params }

    // Prepend upstream text to prompt for submission (variants store user prompt only)
    const userPromptFromInputs = (inputs.prompt as string) ?? ''
    const userPromptFromParams = (params.prompt as string) ?? ''
    const userPrompt = userPromptFromInputs || userPromptFromParams
    const effectivePrompt = [upstreamText, userPrompt].filter(s => s?.trim()).join('\n')
    if (inputs.prompt !== undefined || !userPromptFromParams) {
      inputs.prompt = effectivePrompt
    } else {
      params.prompt = effectivePrompt
    }

    // Inject mask data for inpaint variants — save mask to asset dir first
    if (needsMaskPaint && maskResult?.maskBlob && boardFolderUri) {
      const maskFile = new File([maskResult.maskBlob], `mask_${Date.now()}.png`, { type: 'image/png' })
      try {
        const maskPath = await saveBoardAssetFile({
          file: maskFile,
          fallbackName: 'mask.png',
          projectId,
          boardFolderUri,
        })
        inputs.mask = { path: maskPath }
      } catch {
        // fallback: 保存失败时用 data URL
        if (maskResult.maskDataUrl) {
          inputs.mask = { url: maskResult.maskDataUrl }
        }
      }
    } else if (needsMaskPaint && maskResult?.maskDataUrl) {
      // fallback: 无 boardFolderUri 时用 data URL
      inputs.mask = { url: maskResult.maskDataUrl }
    }

    return {
      feature: selectedFeature?.id ?? 'imageGenerate',
      variant: selectedVariant?.id ?? '',
      inputs,
      params,
      count: vp.count,
      seed: vp.seed,
      // Backward compat
      prompt: effectivePrompt,
      aspectRatio: (vp.params.aspectRatio as string | undefined),
    }
  }, [selectedFeature, selectedVariant, needsMaskPaint, maskResult, boardFolderUri, projectId, upstreamText])

  /** Build v3-compatible generation params with media uploaded to public URLs. */
  const buildParams = useCallback(async (): Promise<ImageGenerateParams> => {
    const params = await collectParams()
    const resolvedInputs = await resolveAllMediaInputs(params.inputs, boardId)
    return { ...params, inputs: resolvedInputs }
  }, [collectParams, boardId])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)
    const params = await buildParams()
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
    setTimeout(() => setIsGenerating(false), 600)
  }, [isGenerating, buildParams, onUpdate, onGenerate])

  const handleGenerateNewNode = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)
    // Use collectParams (no S3 upload) so the child node is created immediately.
    // Media upload will happen in ImageNode.handleGenerateNewNode after node creation.
    const params = await collectParams()
    // Save current params to aiConfig so the panel can restore them on reopen
    onUpdate({
      aiConfig: {
        ...aiConfig,
        feature: params.feature as AiGenerateConfig['feature'],
        prompt: params.prompt ?? '',
        aspectRatio: params.aspectRatio as AiGenerateConfig['aspectRatio'],
      },
    })
    onGenerateNewNode?.(params)
    setTimeout(() => setIsGenerating(false), 600)
  }, [isGenerating, onGenerateNewNode, collectParams, onUpdate, aiConfig])

  const handleFeatureSelect = useCallback((featureId: string) => {
    setSelectedFeatureId(featureId)
    setSelectedVariantId(null) // Reset to first variant of the new feature
  }, [])

  /** Whether generate should be disabled. */
  const isGenerateDisabled = (() => {
    if (!selectedVariant) return true
    // Ask the variant definition if it should be disabled
    if (variantDef?.isDisabled?.(variantCtx)) return true
    // Mask-required variants need a painted mask
    if (variantDef?.maskRequired && !maskResult?.maskDataUrl) return true
    return false
  })()

  // Panel-level warning for mask painting (variant doesn't have access to mask state).
  const maskRequired = Boolean(variantDef?.maskRequired)
  const panelWarning = maskRequired && resolvedImageSrc && !maskResult?.maskDataUrl
    ? t('imagePanel.maskRequired', { defaultValue: 'Please paint the area to modify' })
    : null
  const effectiveWarning = variantWarning ?? panelWarning

  // ── Resolve variant component ──
  const VariantForm = selectedVariant
    ? IMAGE_VARIANTS[selectedVariant.id]?.component ?? GenericVariantFallback
    : null

  const variantUpstream = useMemo(() => ({
    textContent: upstreamText,
    // Always pass image data — each variant decides how to use it
    images: upstreamImages?.length ? upstreamImages : undefined,
    imagePaths: upstreamImagePaths?.length ? upstreamImagePaths : undefined,
    audioUrl: upstreamAudioUrl,
    videoUrl: upstreamVideoUrl,
    boardId,
    projectId,
    boardFolderUri,
  }), [upstreamText, upstreamImages, upstreamImagePaths, upstreamAudioUrl, upstreamVideoUrl, boardId, projectId, boardFolderUri])

  // ── Loading / Error fallback ──
  // 逻辑：loading 和 error 不再提前 return，而是渲染在主面板内部，
  // 避免面板高度跳动。仅在确实没有 features 时显示占位。

  const showFallback = !features.length

  return (
    <div className="flex w-[420px] flex-col gap-2.5 rounded-3xl border border-border bg-card p-3 shadow-lg">
      {/* ── Fallback: loading / error / empty ── */}
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

      {/* ── Feature Tabs ── */}
      {features.length > 0 ? (
        <ScrollableTabBar>
          {features
            .filter(feat => {
              // In readonly mode (not editing), only show the active feature
              if (readonly && !editing) return feat.id === selectedFeatureId
              // Hide features with no applicable variants in current context
              if (feat.variants.every(v => !isVariantApplicable(v.id))) return false
              return true
            })
            .map((feat) => {
              const tabDisabled = readonly && !editing
              return (
                <button
                  key={feat.id}
                  type="button"
                  disabled={tabDisabled}
                  className={[
                    'relative shrink-0 whitespace-nowrap rounded-3xl px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                    tabDisabled
                      ? 'cursor-not-allowed text-muted-foreground/40'
                      : selectedFeatureId === feat.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                  onClick={() => !tabDisabled && handleFeatureSelect(feat.id)}
                >
                  {MEDIA_FEATURES[feat.id as MediaFeatureId]?.label[prefLang] ?? feat.id}
                </button>
              )
            })}
        </ScrollableTabBar>
      ) : null}

      {/* ── Mask brush controls (for inpaint variants) ── */}
      {needsMaskPaint && resolvedImageSrc ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors"
              title={t('imagePanel.clearMask', { defaultValue: 'Clear mask' })}
              onClick={() => maskPaintRef?.current?.clear()}
            >
              <Paintbrush size={13} />
            </button>
            <input
              type="range"
              min={BRUSH_MIN_SIZE}
              max={BRUSH_MAX_SIZE}
              value={brushSizeProp}
              onChange={(e) => maskPaintRef?.current?.setBrushSize(Number(e.target.value))}
              className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground"
            />
            <span className="mx-0.5 h-4 w-px bg-border" />
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors disabled:opacity-30"
              onClick={() => maskPaintRef?.current?.undo()}
            >
              <Undo2 size={13} />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 transition-colors disabled:opacity-30"
              onClick={() => maskPaintRef?.current?.redo()}
            >
              <Redo2 size={13} />
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Variant-specific form ── */}
      {VariantForm && selectedVariant ? (
        <VariantForm
          variant={selectedVariant}
          upstream={variantUpstream}
          nodeResourceUrl={resolvedImageSrc}
          nodeResourcePath={element.props.originalSrc}
          disabled={readonly && !editing}
          initialParams={paramsCacheLocal.current[`${selectedFeatureId}:${selectedVariant.id}`] ?? aiConfig?.paramsCache?.[`${selectedFeatureId}:${selectedVariant.id}`]}
          onParamsChange={handleVariantParamsChange}
          onWarningChange={setVariantWarning}
        />
      ) : null}

      {/* ── Generate Action Bar ── */}
      {!showFallback ? <GenerateActionBar
        hasResource={hasResource}
        generating={isGenerating}
        disabled={isGenerateDisabled}
        buttonClassName="bg-foreground text-background hover:bg-foreground/90"
        onGenerate={handleGenerate}
        onGenerateNewNode={handleGenerateNewNode}
        readonly={readonly}
        editing={editing}
        onUnlock={onUnlock}
        onCancelEdit={onCancelEdit}
        creditsPerCall={selectedVariant?.creditsPerCall}
        warningMessage={effectiveWarning}
        variants={selectedFeature?.variants
          ?.filter((v) => isVariantApplicable(v.id))
          .map((v) => {
            const prefLabel = MEDIA_PREFERENCES[v.preference as MediaPreferenceId]?.label[prefLang]
            return {
              id: v.id,
              displayName: prefLabel ?? v.id,
              creditsPerCall: v.creditsPerCall,
            }
          })}
        selectedVariantId={selectedVariant?.id}
        onVariantChange={setSelectedVariantId}
      /> : null}
    </div>
  )
}
