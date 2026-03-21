/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  FileText,
  Paintbrush,
  Plus,
  Redo2,
  Settings,
  Undo2,
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
} from '../ui/board-style-system'
import { ResultPagination } from './ResultPagination'
import { GenerateActionBar } from './GenerateActionBar'

/** Max upstream image slot limit. */
const UPSTREAM_IMAGE_SLOT_LIMIT = 10

// ---------------------------------------------------------------------------
// SDK v2 feature types
// ---------------------------------------------------------------------------

/** SDK v2 image feature. */
type ImageFeature = 'imageGenerate' | 'poster' | 'imageEdit' | 'upscale' | 'outpaint' | 'matting'

/** imageGenerate sub-mode. */
type ImageGenerateMode = 'text' | 'reference' | 'sketch' | 'character'

/** imageEdit sub-mode. */
type ImageEditMode = 'instruct' | 'stylize' | 'colorize' | 'inpaint' | 'erase' | 'eraseWatermark'

/** All image feature tabs. */
const FEATURE_TABS: Array<{ id: ImageFeature; needsImage: boolean }> = [
  { id: 'imageGenerate', needsImage: false },
  { id: 'poster', needsImage: false },
  { id: 'imageEdit', needsImage: true },
  { id: 'upscale', needsImage: true },
  { id: 'outpaint', needsImage: true },
  { id: 'matting', needsImage: true },
]

/** @deprecated Use ImageFeature instead. */
export type ImagePanelMode = ImageFeature

/** Parameters passed to the onGenerate callback. */
export type ImageGenerateParams = {
  feature: ImageFeature
  prompt?: string
  negativePrompt?: string
  style?: string
  aspectRatio?: string
  resolution?: string
  count?: 1 | 2 | 4
  quality?: 'draft' | 'standard' | 'hd'
  seed?: number
  // imageGenerate
  generateMode?: ImageGenerateMode
  inputImages?: string[]
  isSketch?: boolean
  // poster
  posterTitle?: string
  posterSubTitle?: string
  posterBodyText?: string
  // imageEdit
  editMode?: ImageEditMode
  sourceImage?: string
  maskImage?: string
  strength?: number
  // upscale
  upscaleScale?: 2 | 4
  // outpaint
  outpaintDirection?: { top: number; bottom: number; left: number; right: number }
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
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  // ── Feature & mode state ──
  const [feature, setFeatureRaw] = useState<ImageFeature>('imageGenerate')
  const [generateMode, setGenerateMode] = useState<ImageGenerateMode>('text')
  const [editMode, setEditModeRaw] = useState<ImageEditMode>('instruct')
  const [quality, setQuality] = useState<'draft' | 'standard' | 'hd'>('standard')
  const [seed, setSeed] = useState<string>('')
  const [strength, setStrength] = useState(0.75)
  const [posterTitle, setPosterTitle] = useState('')
  const [posterSubTitle, setPosterSubTitle] = useState('')
  const [posterBodyText, setPosterBodyText] = useState('')
  const [outpaintDir, setOutpaintDir] = useState({ top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 })

  const setFeature = useCallback((f: ImageFeature) => {
    setFeatureRaw(f)
    const needsMask = f === 'imageEdit' && (editMode === 'inpaint' || editMode === 'erase')
    onToggleMaskPaint?.(needsMask)
  }, [editMode, onToggleMaskPaint])

  const setEditMode = useCallback((m: ImageEditMode) => {
    setEditModeRaw(m)
    const needsMask = m === 'inpaint' || m === 'erase'
    onToggleMaskPaint?.(needsMask)
  }, [onToggleMaskPaint])

  const imageCount = upstreamImages?.length ?? 0

  const [prompt, setPrompt] = useState(aiConfig?.prompt ?? upstreamText ?? '')
  const [aspectRatio, setAspectRatio] = useState<AiGenerateConfig['aspectRatio']>(
    aiConfig?.aspectRatio ?? 'auto',
  )
  const [resolution, setResolution] = useState<(typeof GENERATE_RESOLUTION_OPTIONS)[number]>('1K')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateCount, setGenerateCount] = useState(1)
  const [showCountDropdown, setShowCountDropdown] = useState(false)
  const [upscaleScale, setUpscaleScale] = useState<2 | 4>(2)

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
    const base: Partial<ImageGenerateParams> = {
      prompt,
      count: generateCount as 1 | 2 | 4,
      quality,
      seed: seed ? Number(seed) : undefined,
    }

    switch (feature) {
      case 'imageGenerate':
        return {
          ...base,
          feature: 'imageGenerate',
          aspectRatio: aspectRatio ?? '1:1',
          resolution,
          generateMode: hasRefImages ? 'reference' : generateMode,
          inputImages: hasRefImages ? upstreamImages : undefined,
        }
      case 'poster':
        return {
          ...base,
          feature: 'poster',
          aspectRatio: aspectRatio ?? '1:1',
          posterTitle,
          posterSubTitle,
          posterBodyText,
        }
      case 'imageEdit':
        return {
          ...base,
          feature: 'imageEdit',
          editMode,
          sourceImage: resolvedImageSrc,
          strength,
        }
      case 'upscale':
        return { feature: 'upscale', upscaleScale }
      case 'outpaint':
        return {
          ...base,
          feature: 'outpaint',
          sourceImage: resolvedImageSrc,
          outpaintDirection: outpaintDir,
        }
      default:
        return { ...base, feature: 'imageGenerate' }
    }
  }, [feature, prompt, generateCount, quality, seed, aspectRatio, resolution,
    generateMode, upstreamImages, posterTitle, posterSubTitle, posterBodyText,
    editMode, resolvedImageSrc, strength, upscaleScale, outpaintDir])

  const handleGenerate = useCallback(() => {
    if (isGenerating) return
    setIsGenerating(true)
    const config: AiGenerateConfig = {
      feature,
      prompt,
      aspectRatio,
      quality,
    }
    onUpdate({
      origin: 'ai-generate',
      aiConfig: config,
    })

    if (onGenerate) {
      onGenerate(buildParams())
    }
    setTimeout(() => setIsGenerating(false), 600)
  }, [isGenerating, feature, prompt, aspectRatio, quality, onUpdate, onGenerate, buildParams])

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

  /** Whether prompt is shown for the current feature. */
  const showPrompt = feature === 'imageGenerate'
    || feature === 'poster'
    || feature === 'outpaint'
    || (feature === 'imageEdit' && editMode !== 'erase' && editMode !== 'eraseWatermark' && editMode !== 'colorize')

  /** Whether generate should be disabled based on current feature. */
  const isGenerateDisabled = (() => {
    switch (feature) {
      case 'imageGenerate': return !prompt.trim()
      case 'poster': return !posterTitle.trim() || !prompt.trim()
      case 'imageEdit':
        if (editMode === 'inpaint' || editMode === 'erase') return !resolvedImageSrc
        if (editMode === 'instruct' || editMode === 'stylize') return !prompt.trim() || !resolvedImageSrc
        return !resolvedImageSrc
      case 'upscale': return !resolvedImageSrc
      case 'outpaint': return !resolvedImageSrc || Object.values(outpaintDir).every(v => v <= 1.0)
      default: return true
    }
  })()

  /** Whether parameter bar is shown for the current feature. */
  const showParamBar = feature === 'imageGenerate' || feature === 'poster' || feature === 'outpaint' || feature === 'imageEdit'

  return (
    <div className="flex w-[420px] flex-col gap-2.5 rounded-xl border border-border bg-card p-3 shadow-lg">
      {/* ── Feature Tabs ── */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-ol-surface-muted p-0.5">
        {FEATURE_TABS.map((tab) => {
          const disabled = readonly || (tab.needsImage && !hasResource)
          return (
            <button
              key={tab.id}
              type="button"
              disabled={disabled}
              className={[
                'relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                disabled
                  ? 'cursor-not-allowed text-muted-foreground/40'
                  : feature === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
              onClick={() => !disabled && setFeature(tab.id)}
              title={tab.needsImage && !hasResource ? t('imagePanel.needsImage') : undefined}
            >
              {t(`imagePanel.feature.${tab.id}`)}
            </button>
          )
        })}
      </div>

      {/* ── imageGenerate mode pills ── */}
      {feature === 'imageGenerate' ? (
        <div className="flex gap-1">
          {(['text', 'reference', 'sketch', 'character'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={readonly}
              className={[
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
                generateMode === m
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
              onClick={() => setGenerateMode(m)}
            >
              {t(`imagePanel.generateMode.${m}`)}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── imageEdit mode pills ── */}
      {feature === 'imageEdit' ? (
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {(['instruct', 'stylize', 'colorize', 'inpaint', 'erase', 'eraseWatermark'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={readonly}
              className={[
                'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
                editMode === m
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
              onClick={() => setEditMode(m)}
            >
              {t(`imagePanel.editMode.${m}`)}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Feature: imageGenerate — Upstream Slots ── */}
      {feature === 'imageGenerate' ? (
        <>
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

      {/* ── Feature: Poster — Title/Subtitle/Body fields ── */}
      {feature === 'poster' ? (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            placeholder={t('imagePanel.posterTitlePlaceholder')}
            value={posterTitle}
            onChange={(e) => setPosterTitle(e.target.value)}
            disabled={readonly}
          />
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs"
            placeholder={t('imagePanel.posterSubTitle')}
            value={posterSubTitle}
            onChange={(e) => setPosterSubTitle(e.target.value)}
            disabled={readonly}
          />
          <textarea
            className="min-h-[48px] w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-xs"
            placeholder={t('imagePanel.posterBodyText')}
            value={posterBodyText}
            onChange={(e) => setPosterBodyText(e.target.value)}
            rows={2}
            disabled={readonly}
          />
        </div>
      ) : null}

      {/* ── Feature: imageEdit — Mask brush controls (inpaint/erase) ── */}
      {(feature === 'imageEdit' && (editMode === 'inpaint' || editMode === 'erase')) ? (
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
          {editMode === 'erase' ? (
            <p className="text-[10px] text-muted-foreground/60">
              {t('imagePanel.erasePlaceholder')}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Feature: imageEdit — Strength slider ── */}
      {feature === 'imageEdit' ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t('imagePanel.strength')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground"
            disabled={readonly}
          />
          <span className="w-8 text-right text-[11px] text-muted-foreground">{strength.toFixed(2)}</span>
        </div>
      ) : null}

      {/* ── Feature: Upscale ── */}
      {feature === 'upscale' ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('imagePanel.upscaleScale')}
          </span>
          <div className="flex gap-2">
            {([2, 4] as const).map((scale) => (
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

      {/* ── Feature: Outpaint — Direction controls ── */}
      {feature === 'outpaint' ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {(['top', 'bottom', 'left', 'right'] as const).map((dir) => (
              <div key={dir} className="flex items-center gap-1.5">
                <span className="w-6 text-[11px] text-muted-foreground">{t(`imagePanel.outpaint${dir.charAt(0).toUpperCase() + dir.slice(1)}`)}</span>
                <input
                  type="number"
                  min={1.0}
                  max={2.0}
                  step={0.1}
                  value={outpaintDir[dir]}
                  onChange={(e) => setOutpaintDir(prev => ({ ...prev, [dir]: Number(e.target.value) }))}
                  className="h-7 w-full rounded-md border border-border bg-transparent px-2 text-[11px]"
                  disabled={readonly}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/60">{t('imagePanel.outpaintHint')}</p>
        </div>
      ) : null}

      {/* ── Prompt (for features that use it) ── */}
      {showPrompt ? (
        <div className="relative flex flex-col gap-1">
          <textarea
            className={[
              'min-h-[68px] w-full resize-none rounded-lg border px-3 py-2 pr-9 text-sm leading-relaxed',
              BOARD_GENERATE_INPUT,
              readonly ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
            placeholder={
              feature === 'poster'
                ? t('imagePanel.posterPromptPlaceholder')
                : t('imagePanel.promptPlaceholder')
            }
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

      {/* ── Parameter Bar ── */}
      {showParamBar ? (
        <div className="flex items-center gap-1.5 border-t border-border pt-2">
          {/* Aspect Ratio Selector (imageGenerate, poster) */}
          {(feature === 'imageGenerate' || feature === 'poster') ? (
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
          ) : null}

          {/* Resolution Selector (imageGenerate only) */}
          {feature === 'imageGenerate' ? (
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
          ) : null}

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
            <span>--</span>
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
      {showAdvanced ? (
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
