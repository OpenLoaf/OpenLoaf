/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  Expand,
  FileText,
  Languages,
  Paintbrush,
  Plus,
  Redo2,
  Settings,
  Undo2,
  Wand2,
  Zap,
} from 'lucide-react'
import { BRUSH_MIN_SIZE, BRUSH_MAX_SIZE } from '../nodes/MaskPaintOverlay'
import type { CanvasNodeElement } from '../engine/types'
import type { ImageNodeProps } from '../nodes/ImageNode'
import type { AiGenerateConfig } from '../board-contracts'
import {
  IMAGE_GENERATE_ASPECT_RATIO_OPTIONS,
  GENERATE_RESOLUTION_OPTIONS,
} from '../nodes/node-config'
import {
  BOARD_GENERATE_INPUT,
  BOARD_GENERATE_BTN_IMAGE,
} from '../ui/board-style-system'
import { useMediaModels } from '@/hooks/use-media-models'
import { filterImageMediaModels } from '../nodes/lib/image-generation'
import { estimateImageCredits } from '../services/credit-estimate'
import { ResultPagination } from './ResultPagination'
import { GenerateActionBar } from './GenerateActionBar'

/** Max upstream image slot limit. */
const UPSTREAM_IMAGE_SLOT_LIMIT = 10

/** Generation mode tab values. */
type GenerateMode = 'text2img' | 'img2img'

/** Image panel mode. */
export type ImagePanelMode = 'auto' | 'upscale' | 'inpaint' | 'erase' | 'matting' | 'multiview' | 'outpaint'

/** All image panel modes with their enabled status. */
const IMAGE_MODES: Array<{ id: ImagePanelMode; enabled: boolean }> = [
  { id: 'auto', enabled: true },
  { id: 'upscale', enabled: true },
  { id: 'inpaint', enabled: true },
  { id: 'erase', enabled: true },
  { id: 'matting', enabled: false },
  { id: 'multiview', enabled: false },
  { id: 'outpaint', enabled: false },
]

/** Fallback model options used when no cloud models are available. */
const FALLBACK_MODEL_OPTIONS = [
  { id: 'dall-e-3', label: 'DALL-E 3' },
  { id: 'stable-diffusion-xl', label: 'Stable Diffusion XL' },
  { id: 'midjourney-v6', label: 'Midjourney v6' },
] as const

/** Parameters passed to the onGenerate callback. */
export type ImageGenerateParams = {
  prompt: string
  negativePrompt?: string
  modelId: string
  aspectRatio: string
  resolution: string
  mode: GenerateMode
  /** @deprecated Use referenceImageSrcs instead. */
  referenceImageSrc?: string
  /** All upstream reference images. */
  referenceImageSrcs?: string[]
  /** Upscale scale factor. */
  upscaleScale?: number
  /** Panel mode that triggered the generation. */
  panelMode?: ImagePanelMode
}

export type ImageAiPanelProps = {
  element: CanvasNodeElement<ImageNodeProps>
  onUpdate: (patch: Partial<ImageNodeProps>) => void
  upstreamText?: string
  upstreamImages?: string[]
  /** Resolved browser-friendly source URL for the current image. */
  resolvedImageSrc?: string
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
  /** Editing mode — user unlocked an existing result to tweak params. */
  editing?: boolean
  /** Callback to unlock the panel for editing (override readonly). */
  onUnlock?: () => void
}

/**
 * Upstream slot wrapper that portals the hover preview to document.body,
 * escaping DomNodeLayer's stacking context so the preview appears above
 * AnchorOverlay and SelectionToolbar.
 */
function UpstreamSlotPreview({
  className,
  children,
  preview,
}: {
  className?: string
  children: ReactNode
  preview: ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  return (
    <div
      ref={ref}
      className={className}
      onPointerEnter={() => {
        setHovered(true)
        if (ref.current) setRect(ref.current.getBoundingClientRect())
      }}
      onPointerLeave={() => setHovered(false)}
    >
      {children}
      {hovered && rect && createPortal(
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: rect.left + rect.width / 2,
            top: rect.top - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {preview}
        </div>,
        document.body,
      )}
    </div>
  )
}

/** AI image generation parameter panel displayed below image nodes. */
export function ImageAiPanel({
  element,
  onUpdate,
  upstreamText,
  upstreamImages,
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
}: ImageAiPanelProps) {
  const { t } = useTranslation('board')
  const aiConfig = element.props.aiConfig
  const { imageModels, loaded: mediaModelsLoaded } = useMediaModels()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const [panelMode, setPanelModeRaw] = useState<ImagePanelMode>('auto')
  // 逻辑：切到 inpaint/erase 自动开启 mask 编辑，切走时自动关闭。
  const setPanelMode = useCallback((mode: ImagePanelMode) => {
    setPanelModeRaw(mode)
    const needsMask = mode === 'inpaint' || mode === 'erase'
    onToggleMaskPaint?.(needsMask)
  }, [onToggleMaskPaint])

  const imageCount = upstreamImages?.length ?? 0
  const filteredModels = useMemo(
    () =>
      mediaModelsLoaded && imageModels.length > 0
        ? filterImageMediaModels(imageModels, {
            imageCount,
            hasMask: panelMode === 'inpaint' || panelMode === 'erase',
            outputCount: 1,
          })
        : [],
    [imageModels, mediaModelsLoaded, imageCount, panelMode],
  )

  const [prompt, setPrompt] = useState(aiConfig?.prompt ?? upstreamText ?? '')
  const [modelId, setModelId] = useState(aiConfig?.modelId ?? 'auto')
  const [aspectRatio, setAspectRatio] = useState<AiGenerateConfig['aspectRatio']>(
    aiConfig?.aspectRatio ?? 'auto',
  )
  const [resolution, setResolution] = useState<(typeof GENERATE_RESOLUTION_OPTIONS)[number]>('1K')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateCount, setGenerateCount] = useState(1)
  const [showCountDropdown, setShowCountDropdown] = useState(false)
  const [upscaleScale, setUpscaleScale] = useState(2)

  const estimatedCredits = useMemo(
    () =>
      estimateImageCredits(
        { modelId, aspectRatio: aspectRatio ?? '1:1', resolution, count: generateCount },
        filteredModels,
      ),
    [modelId, aspectRatio, resolution, generateCount, filteredModels],
  )

  const aiResults = aiConfig?.results
  const selectedIndex = aiConfig?.selectedIndex ?? 0

  /** Whether the node currently has a resource. */
  const hasResource = Boolean(element.props.previewSrc || element.props.originalSrc)

  const handleResultSelect = useCallback(
    (index: number) => {
      if (!aiResults || index < 0 || index >= aiResults.length) return
      const result = aiResults[index]
      onUpdate({
        previewSrc: result.previewSrc,
        originalSrc: result.originalSrc,
        aiConfig: {
          ...aiConfig!,
          selectedIndex: index,
        },
      })
    },
    [aiResults, aiConfig, onUpdate],
  )

  /** Build params from current panel state. */
  const buildParams = useCallback((): ImageGenerateParams => {
    const hasRefImages = (upstreamImages?.length ?? 0) > 0
    const resolvedModelId = modelId === 'auto'
      ? (filteredModels[0]?.id ?? '')
      : modelId
    return {
      prompt,
      modelId: resolvedModelId,
      aspectRatio: aspectRatio ?? '1:1',
      resolution,
      mode: hasRefImages ? 'img2img' : 'text2img',
      referenceImageSrc: hasRefImages ? upstreamImages?.[0] : undefined,
      referenceImageSrcs: hasRefImages ? upstreamImages : undefined,
      upscaleScale: panelMode === 'upscale' ? upscaleScale : undefined,
      panelMode,
    }
  }, [prompt, modelId, aspectRatio, resolution, upstreamImages, filteredModels, panelMode, upscaleScale])

  const handleGenerate = useCallback(() => {
    if (isGenerating) return
    setIsGenerating(true)
    const config: AiGenerateConfig = {
      modelId,
      prompt,
      aspectRatio,
    }
    onUpdate({
      origin: 'ai-generate',
      aiConfig: config,
    })

    if (onGenerate) {
      onGenerate(buildParams())
    }
    setTimeout(() => setIsGenerating(false), 600)
  }, [isGenerating, modelId, prompt, aspectRatio, onUpdate, onGenerate, buildParams])

  const handleGenerateNewNode = useCallback(() => {
    if (isGenerating) return
    setIsGenerating(true)
    if (onGenerateNewNode) {
      onGenerateNewNode(buildParams())
    }
    setTimeout(() => setIsGenerating(false), 600)
  }, [isGenerating, onGenerateNewNode, buildParams])

  /** Handle manual upload click. */
  const handleUploadClick = useCallback(() => {
    uploadInputRef.current?.click()
  }, [])

  /** Whether generate should be disabled based on current mode. */
  const isGenerateDisabled = panelMode === 'auto' && !prompt.trim()

  /** Whether prompt is shown for the current mode. */
  const showPrompt = panelMode === 'auto' || panelMode === 'inpaint'
  /** Whether parameter bar is shown for the current mode. */
  const showParamBar = panelMode === 'auto'

  return (
    <div className="flex w-[420px] flex-col gap-2.5 rounded-xl border border-border bg-card p-3 shadow-lg">
      {/* ── Mode Tabs ── */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-ol-surface-muted p-0.5">
        {IMAGE_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={readonly || !m.enabled}
            className={[
              'relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150',
              readonly || !m.enabled
                ? 'cursor-not-allowed text-muted-foreground/40'
                : panelMode === m.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            onClick={() => !readonly && m.enabled && setPanelMode(m.id)}
          >
            {t(`imagePanel.mode.${m.id}`)}
            {!m.enabled ? (
              <span className="ml-1 inline-flex items-center rounded bg-muted-foreground/10 px-1 py-px text-[9px] font-semibold leading-none text-muted-foreground/50">
                {t('imagePanel.comingSoon')}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Mode: Auto (text2img / img2img) ── */}
      {panelMode === 'auto' ? (
        <>
          {/* Upstream Slots */}
          {(upstreamText || imageCount > 0) ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {upstreamText ? (
                  <UpstreamSlotPreview
                    className="relative h-[52px] w-[52px] shrink-0 rounded-md border border-border bg-ol-surface-muted flex items-center justify-center cursor-default"
                    preview={
                      <div className="w-52 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <p className="whitespace-pre-wrap break-words">{upstreamText}</p>
                      </div>
                    }
                  >
                    <FileText size={18} className="text-muted-foreground" />
                  </UpstreamSlotPreview>
                ) : null}
                {(upstreamImages ?? []).map((src, idx) => (
                  <UpstreamSlotPreview
                    key={`upstream-${idx}`}
                    className="relative h-[52px] w-[52px] shrink-0 rounded-md border border-border bg-ol-surface-muted cursor-default"
                    preview={
                      <div className="overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                        <img src={src} alt={`preview-${idx}`} className="max-h-40 max-w-48 object-contain" draggable={false} />
                      </div>
                    }
                  >
                    <img
                      src={src}
                      alt={`ref-${idx}`}
                      className="absolute inset-0 h-full w-full rounded-md object-cover"
                      draggable={false}
                    />
                  </UpstreamSlotPreview>
                ))}
                {!readonly ? (
                  <button
                    type="button"
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
                    onClick={handleUploadClick}
                    title={t('imagePanel.uploadReference')}
                  >
                    <Plus size={16} />
                  </button>
                ) : null}
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                multiple
              />
            </div>
          ) : null}
        </>
      ) : null}

      {/* ── Mode: Upscale ── */}
      {panelMode === 'upscale' ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('imagePanel.upscaleScale')}
          </span>
          <div className="flex gap-2">
            {[2, 4].map((scale) => (
              <button
                key={scale}
                type="button"
                disabled={readonly}
                className={[
                  'flex-1 rounded-lg border py-2 text-sm font-medium transition-colors duration-150',
                  upscaleScale === scale
                    ? 'border-foreground/30 bg-foreground/5 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                  readonly ? 'cursor-not-allowed opacity-60' : '',
                ].join(' ')}
                onClick={() => !readonly && setUpscaleScale(scale)}
              >
                {scale}x
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Mode: Inpaint / Erase — inline brush controls (auto-activated) ── */}
      {(panelMode === 'inpaint' || panelMode === 'erase') ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            {/* Clear mask */}
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
          {panelMode === 'erase' ? (
            <p className="text-[10px] text-muted-foreground/60">
              {t('imagePanel.erasePlaceholder')}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Prompt (auto / inpaint modes) ── */}
      {showPrompt ? (
        <div className="relative flex flex-col gap-1">
          <textarea
            className={[
              'min-h-[68px] w-full resize-none rounded-lg border px-3 py-2 pr-9 text-sm leading-relaxed',
              BOARD_GENERATE_INPUT,
              readonly ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
            placeholder={t('imagePanel.promptPlaceholder')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            disabled={readonly}
          />
        </div>
      ) : null}

      {/* ── Result Pagination ── */}
      {aiResults && aiResults.length > 1 ? (
        <ResultPagination
          results={aiResults}
          currentIndex={selectedIndex}
          onSelect={handleResultSelect}
        />
      ) : null}

      {/* ── Parameter Bar (auto mode only) ── */}
      {showParamBar ? (
        <div className="flex items-center gap-1.5 border-t border-border pt-2">
          {/* Model Selector */}
          <select
            className={[
              'h-7 max-w-[120px] truncate rounded-md border border-border bg-transparent px-1.5 text-[11px] text-foreground outline-none transition-colors duration-150',
              readonly ? 'opacity-60 cursor-not-allowed appearance-none' : 'hover:bg-foreground/5',
            ].join(' ')}
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={readonly}
          >
            <option value="auto">{t('imagePanel.autoRecommend')}</option>
            {filteredModels.length > 0
              ? filteredModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id}
                  </option>
                ))
              : FALLBACK_MODEL_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
          </select>

          {/* Aspect Ratio Selector */}
          <select
            className={[
              'h-7 rounded-md border border-border bg-transparent px-1.5 text-[11px] text-foreground outline-none transition-colors duration-150',
              readonly ? 'opacity-60 cursor-not-allowed appearance-none' : 'hover:bg-foreground/5',
            ].join(' ')}
            value={aspectRatio ?? 'auto'}
            disabled={readonly}
            onChange={(e) => setAspectRatio(e.target.value as AiGenerateConfig['aspectRatio'])}
          >
            {IMAGE_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio === 'auto' ? t('imagePanel.ratioAuto', { defaultValue: 'Auto' }) : ratio}
              </option>
            ))}
          </select>

          {/* Resolution Selector */}
          <select
            className={[
              'h-7 rounded-md border border-border bg-transparent px-1.5 text-[11px] text-foreground outline-none transition-colors duration-150',
              readonly ? 'opacity-60 cursor-not-allowed appearance-none' : 'hover:bg-foreground/5',
            ].join(' ')}
            value={resolution}
            disabled={readonly}
            onChange={(e) => setResolution(e.target.value as (typeof GENERATE_RESOLUTION_OPTIONS)[number])}
          >
            {GENERATE_RESOLUTION_OPTIONS.map((res) => (
              <option key={res} value={res}>{res}</option>
            ))}
          </select>

          <div className="flex-1" />

          {/* Settings Button */}
          <button
            type="button"
            className={[
              'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150',
              readonly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-foreground/8 dark:hover:bg-foreground/10',
            ].join(' ')}
            title={t('imagePanel.settings')}
            disabled={readonly}
            onClick={() => !readonly && setShowAdvanced(!showAdvanced)}
          >
            <Settings size={14} />
          </button>

          {/* Credits Indicator */}
          <div className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[11px] text-muted-foreground" title={t('imagePanel.estimatedCredits')}>
            <Zap size={12} />
            <span>{estimatedCredits != null ? `≈${estimatedCredits}` : '--'}</span>
          </div>

          {/* Count Dropdown */}
          <div className="relative">
            <button
              type="button"
              className={[
                'inline-flex h-7 items-center gap-0.5 rounded-md border border-border px-1.5 text-[11px] text-foreground transition-colors duration-150',
                readonly ? 'opacity-60 cursor-not-allowed' : 'hover:bg-foreground/5',
              ].join(' ')}
              onClick={() => !readonly && setShowCountDropdown(!showCountDropdown)}
              disabled={readonly}
            >
              <span>{generateCount}x</span>
              {!readonly ? <ChevronDown size={10} /> : null}
            </button>
            {showCountDropdown ? (
              <div className="absolute bottom-full right-0 mb-1 flex flex-col rounded-md border border-border bg-card py-0.5 shadow-md">
                {[1, 2, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={[
                      'px-4 py-1 text-[11px] transition-colors duration-150 hover:bg-foreground/5',
                      generateCount === n ? 'text-foreground font-medium' : 'text-muted-foreground',
                    ].join(' ')}
                    onClick={() => {
                      setGenerateCount(n)
                      setShowCountDropdown(false)
                    }}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Advanced Settings (toggled by gear button) ── */}
      {showAdvanced && panelMode === 'auto' ? (
        <div className="rounded-lg border border-border bg-ol-surface-muted/50 p-3 text-xs text-muted-foreground">
          {t('imagePanel.advancedSettingsPlaceholder')}
        </div>
      ) : null}

      {/* ── Generate Action Bar ── */}
      <GenerateActionBar
        hasResource={hasResource}
        generating={isGenerating}
        disabled={isGenerateDisabled}
        buttonClassName="bg-foreground text-background hover:bg-foreground/90"
        onGenerate={handleGenerate}
        onGenerateNewNode={handleGenerateNewNode}
        readonly={readonly}
        editing={editing}
        onUnlock={onUnlock}
      />

    </div>
  )
}
