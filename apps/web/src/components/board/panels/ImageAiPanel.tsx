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
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { saveBoardAssetFile } from '../utils/board-asset'
import type { CanvasNodeElement } from '../engine/types'
import type { UpstreamData } from '../engine/upstream-data'
import type { ImageNodeProps } from '../nodes/node-types'
import type { BoardFileContext } from '../board-contracts'
import { serializeForGenerate } from './variants/serialize'
import type { MediaReference, MediaType, PersistedSlotMap } from './variants/slot-types'
import { InputSlotBar, type ResolvedSlotInputs } from './variants/shared/InputSlotBar'
import { GenericVariantForm } from './variants/shared/GenericVariantForm'
import { isCameraAngleParams } from './variants/shared/CameraAngleControl'
import { GenerateActionBar } from './GenerateActionBar'
import { useVariantPanel } from './hooks/useVariantPanel'
import { useVariantCache } from './hooks/useVariantCache'
import { CapabilitiesFallback } from './shared/CapabilitiesFallback'
import { FeatureTabBar } from './shared/FeatureTabBar'

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
  // 便于节点快照与 aiConfig 记录的附加元数据
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
  /** Raw upstream data for InputSlotBar (with entries for slot assignment). */
  rawUpstream?: UpstreamData | null
  /** Resolved browser-friendly source URL for the current image. */
  resolvedImageSrc?: string
  /** Board context for variant MediaSlot preview resolution & file saving. */
  boardId?: string
  projectId?: string
  boardFolderUri?: string
  /** Full file context object (optional, derived from boardId/projectId/boardFolderUri if not provided). */
  fileContext?: BoardFileContext
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
  rawUpstream,
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
  fileContext: fileContextProp,
}: ImageAiPanelProps) {
  const { t } = useTranslation('board')
  const aiConfig = element.props.aiConfig

  // ── Compute node media type & upstream types ──
  const nodeHasImage = Boolean(element.props.previewSrc || element.props.originalSrc)
  const nodeMediaType: MediaType | undefined = nodeHasImage ? 'image' : undefined
  const upstreamTypes = useMemo(() => {
    const types = new Set<MediaType>()
    if (upstreamImages?.length) types.add('image')
    if (upstreamAudioUrl) types.add('audio')
    if (upstreamVideoUrl) types.add('video')
    return types
  }, [upstreamImages?.length, upstreamAudioUrl, upstreamVideoUrl])

  // ── Shared panel hook ──
  const initialFeatureId = aiConfig?.lastUsed?.feature
    ?? (nodeHasImage ? 'imageEdit' : 'imageGenerate')

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
    category: 'image',
    nodeMediaType,
    upstreamTypes,
    initialFeatureId,
    cachedFeatureId: aiConfig?.lastUsed?.feature,
  })

  // ── Params cache ──
  const aiConfigRef = useRef(aiConfig)
  aiConfigRef.current = aiConfig

  const activeKey = selectedVariant ? `${selectedFeatureId}:${selectedVariant.id}` : ''

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

  // ── Pricing params (reactive for estimate API) ──
  const [pricingParams, setPricingParams] = useState<Record<string, unknown>>({})

  // ── Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)
  const [slotsValid, setSlotsValid] = useState(false)

  /** Whether the node currently has a resource. */
  const hasResource = Boolean(element.props.previewSrc || element.props.originalSrc)

  /** Whether the current variant has a mask slot (for enabling paint UI). */
  const hasMaskSlot = selectedVariant && !(readonly && !editing)
    ? (mergedSlots?.some(s => 'role' in s && s.role === 'mask') ?? false)
    : false

  /** Whether mask painting is required (mask slot exists AND is required). */
  const needsMaskPaint = hasMaskSlot
    && (mergedSlots?.some(s => 'role' in s && s.role === 'mask' && ('min' in s ? (s.min ?? 1) : 1) > 0) ?? false)

  // When variant changes or hasMaskSlot becomes false, deactivate mask painting.
  useEffect(() => {
    if (!hasMaskSlot) {
      onToggleMaskPaint?.(false)
    }
  }, [hasMaskSlot, onToggleMaskPaint])

  // ── Camera angle detection → text slot portal ──
  const hasCameraAngle = useMemo(() => {
    if (!remoteParams?.length) return false
    return isCameraAngleParams(remoteParams)
  }, [remoteParams])
  const [textSlotPortalEl, setTextSlotPortalEl] = useState<HTMLElement | null>(null)

  // ── Resolved slot inputs (populated by InputSlotBar callback) ──
  const [resolvedSlots, setResolvedSlots] = useState<Record<string, MediaReference[]>>({})

  // ── Callbacks ──

  /** Resolve mask data and return as MediaInput (saves blob to asset dir when possible). */
  const resolveMaskInput = useCallback(async () => {
    if (!hasMaskSlot || !maskResult) return undefined
    if (maskResult.maskBlob && (boardId || boardFolderUri)) {
      const maskFile = new File([maskResult.maskBlob], `mask_${Date.now()}.png`, { type: 'image/png' })
      try {
        const maskPath = await saveBoardAssetFile({
          file: maskFile,
          fallbackName: 'mask.png',
          projectId,
          boardId,
          boardFolderUri,
        })
        return { path: maskPath }
      } catch {
        if (maskResult.maskDataUrl) return { url: maskResult.maskDataUrl }
      }
    } else if (maskResult.maskDataUrl) {
      return { url: maskResult.maskDataUrl }
    }
    return undefined
  }, [hasMaskSlot, maskResult, boardId, boardFolderUri, projectId])

  /** Collect params without uploading media — fast, for immediate node creation. */
  const collectParams = useCallback(async (): Promise<ImageGenerateParams> => {
    if (!selectedVariant) throw new Error('No variant definition available')
    const vp = cache.get(activeKey) ?? { inputs: {}, params: {} }

    // Prepend upstream text to prompt for submission (variants store user prompt only)
    const userPromptFromInputs = (vp.inputs.prompt as string) ?? ''
    const userPromptFromParams = (vp.params.prompt as string) ?? ''
    const userPrompt = userPromptFromInputs || userPromptFromParams
    const effectivePrompt = [upstreamText, userPrompt].filter(s => s?.trim()).join('\n')

    // V3 path: use serializeForGenerate with declarative slots
    const maskInput = await resolveMaskInput()
    const paintResults: Record<string, { path?: string; url?: string }> = {}
    if (maskInput) paintResults.mask = maskInput

    // Convert resolvedSlots (MediaReference[]) to MediaInput[]
    const slotAssignments: Record<string, { path?: string; url?: string }[]> = {}
    for (const [key, refs] of Object.entries(resolvedSlots)) {
      slotAssignments[key] = refs.map((r) => (r.path ? { path: r.path } : { url: r.url }))
    }

    const selfPath = element.props.originalSrc
    const v3Result = serializeForGenerate(mergedSlots ?? [], {
      prompt: effectivePrompt,
      paintResults,
      slotAssignments,
      resolvedInputs: vp.inputs ?? {},
      taskRefs: {},
      params: vp.params,
      count: vp.count,
    })

    return {
      feature: selectedFeature?.id ?? 'imageGenerate',
      variant: selectedVariant.id,
      ...v3Result,
      // 便于节点快照与 aiConfig 记录的附加元数据
      prompt: effectivePrompt,
      aspectRatio: (vp.params.aspectRatio as string | undefined),
    }
  }, [selectedFeature, selectedVariant, upstreamText, resolvedSlots, element.props.originalSrc, resolveMaskInput, mergedSlots, cache, activeKey])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      const params = await collectParams()
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
      console.error('[ImageAiPanel] handleGenerate failed:', err)
      toast.error(t('v3.errors.prepareFailed', { defaultValue: '准备生成参数失败，请重试' }))
    } finally {
      setTimeout(() => setIsGenerating(false), 600)
    }
  }, [isGenerating, collectParams, onUpdate, onGenerate, t, cache])

  const handleGenerateNewNode = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      const params = await collectParams()
      onUpdate({
        aiConfig: {
          ...aiConfig,
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
      console.error('[ImageAiPanel] handleGenerateNewNode failed:', err)
      toast.error(t('v3.errors.prepareFailed', { defaultValue: '准备生成参数失败，请重试' }))
    } finally {
      setTimeout(() => setIsGenerating(false), 600)
    }
  }, [isGenerating, onGenerateNewNode, collectParams, onUpdate, aiConfig, t])

  const handleFeatureSelect = useCallback((featureId: string) => {
    setSelectedFeatureId(featureId)
    setSelectedVariantId(null)
  }, [setSelectedFeatureId, setSelectedVariantId])

  /** Whether generate should be disabled. */
  const isGenerateDisabled = (() => {
    if (!selectedVariant) return true
    if (!slotsValid) return true
    const maskRequired = needsMaskPaint
    if (maskRequired && !maskResult?.maskDataUrl) return true
    return false
  })()

  // Panel-level warning for mask painting
  const maskRequired = needsMaskPaint
  const panelWarning = maskRequired && resolvedImageSrc && !maskResult?.maskDataUrl
    ? t('imagePanel.maskRequired', { defaultValue: 'Please paint the area to modify' })
    : null
  const effectiveWarning = variantWarning ?? panelWarning

  // ── Derive fileContext from props ──
  const fileContext = useMemo<BoardFileContext | undefined>(
    () => fileContextProp ?? (boardId || projectId || boardFolderUri
      ? { boardId, projectId, boardFolderUri }
      : undefined),
    [fileContextProp, boardId, projectId, boardFolderUri],
  )

  // ── Node resource descriptor for InputSlotBar ──
  const nodeResource = useMemo(() => {
    const path = element.props.originalSrc
    if (!path) return undefined
    return { type: 'image' as const, path, url: resolvedImageSrc }
  }, [element.props.originalSrc, resolvedImageSrc])

  const handleSlotInputsChange = useCallback((resolved: ResolvedSlotInputs) => {
    setResolvedSlots(resolved.mediaRefs)
    setSlotsValid(resolved.isValid)
    if (activeKey) {
      cache.update(activeKey, { inputs: resolved.inputs })
    }
  }, [cache, activeKey])

  const handleSlotAssignmentPersist = useCallback((map: PersistedSlotMap) => {
    if (activeKey) {
      cache.update(activeKey, { slotAssignment: map })
    }
  }, [cache, activeKey])

  const handleUserTextsChange = useCallback((texts: Record<string, string>) => {
    if (activeKey) {
      cache.update(activeKey, { userTexts: texts })
    }
  }, [cache, activeKey])

  const variantUpstream = useMemo(() => ({
    textContent: upstreamText,
    images: upstreamImages?.length ? upstreamImages : undefined,
    imagePaths: upstreamImagePaths?.length ? upstreamImagePaths : undefined,
    audioUrl: upstreamAudioUrl,
    videoUrl: upstreamVideoUrl,
    boardId,
    projectId,
    boardFolderUri,
  }), [upstreamText, upstreamImages, upstreamImagePaths, upstreamAudioUrl, upstreamVideoUrl, boardId, projectId, boardFolderUri])

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
        disabled={readonly && !editing}
      />

      {/* ── InputSlotBar (V3 declarative slot assignment) ── */}
      {mergedSlots?.length && selectedVariant ? (
        <InputSlotBar
          slots={mergedSlots}
          upstream={rawUpstream ?? { textList: [], imageList: [], videoList: [], audioList: [], entries: [] }}
          fileContext={fileContext}
          nodeResource={nodeResource}
          disabled={readonly && !editing}
          cachedAssignment={
            cache.get(`${selectedFeatureId}:${selectedVariant.id}`)?.slotAssignment as PersistedSlotMap | undefined
          }
          cachedUserTexts={cache.get(`${selectedFeatureId}:${selectedVariant.id}`)?.userTexts}
          onAssignmentChange={handleSlotInputsChange}
          onSlotAssignmentChange={handleSlotAssignmentPersist}
          onUserTextsChange={handleUserTextsChange}
          maskPaintRef={hasMaskSlot ? maskPaintRef : undefined}
          maskPainting={hasMaskSlot ? maskPainting : undefined}
          maskResult={hasMaskSlot ? maskResult : undefined}
          brushSize={hasMaskSlot ? brushSizeProp : undefined}
          onMaskPaintToggle={hasMaskSlot ? onToggleMaskPaint : undefined}
          textSlotPortalTarget={hasCameraAngle ? textSlotPortalEl : undefined}
        />
      ) : null}

      {/* ── Variant-specific form ── */}
      <AnimatePresence mode="wait">
        {selectedVariant ? (
          <motion.div
            key={selectedVariant.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <GenericVariantForm
              variantId={selectedVariant.id}
              upstream={variantUpstream}
              nodeResourceUrl={resolvedImageSrc}
              nodeResourcePath={element.props.originalSrc}
              disabled={readonly && !editing}
              initialParams={cache.get(`${selectedFeatureId}:${selectedVariant.id}`)}
              onParamsChange={(snapshot) => {
                if (activeKey) {
                  cache.update(activeKey, { params: snapshot.params })
                }
                setPricingParams(snapshot.params ?? {})
              }}
              onWarningChange={setVariantWarning}
              resolvedSlots={resolvedSlots}
              overrideParams={remoteParams}
              cameraChildren={
                hasCameraAngle ? <div ref={setTextSlotPortalEl} className="flex flex-col gap-3" /> : undefined
              }
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

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
        estimateParams={pricingParams}
        warningMessage={effectiveWarning}
        variants={selectedFeature?.variants
          ?.filter((v) => isVariantApplicable(v.id))
          .map((v) => {
            return {
              id: v.id,
              displayName: v.displayName || v.featureTabName || v.id,
            }
          })}
        selectedVariantId={selectedVariant?.id}
        onVariantChange={setSelectedVariantId}
      /> : null}
    </div>
  )
}
