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
import {
  ChevronDown,
  ChevronRight,
  Expand,
  FileText,
  Languages,
  Layers,
  Lock,
  Plus,
  Replace,
  Settings,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react'
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
import { ResultPagination } from './ResultPagination'

/** Max upstream image slot limit. */
const UPSTREAM_IMAGE_SLOT_LIMIT = 10

/** Generation mode tab values. */
type GenerateMode = 'text2img' | 'img2img'

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
  referenceImageSrc?: string
  /** Whether to stack (default) or overwrite the primary version. */
  generateMode?: 'stack' | 'overwrite'
}

export type ImageAiPanelProps = {
  element: CanvasNodeElement<ImageNodeProps>
  onUpdate: (patch: Partial<ImageNodeProps>) => void
  upstreamText?: string
  upstreamImages?: string[]
  /** Callback to trigger actual image generation. */
  onGenerate?: (params: ImageGenerateParams) => void
  /** When true, all inputs are disabled and generate button is hidden (post-generation lock). */
  readonly?: boolean
}

/** AI image generation parameter panel displayed below image nodes. */
export function ImageAiPanel({
  element,
  onUpdate,
  upstreamText,
  upstreamImages,
  onGenerate,
  readonly = false,
}: ImageAiPanelProps) {
  const { t } = useTranslation('board')
  const aiConfig = element.props.aiConfig
  const { imageModels, loaded: mediaModelsLoaded } = useMediaModels()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const imageCount = upstreamImages?.length ?? 0
  const filteredModels = useMemo(
    () =>
      mediaModelsLoaded && imageModels.length > 0
        ? filterImageMediaModels(imageModels, {
            imageCount,
            hasMask: false,
            outputCount: 1,
          })
        : [],
    [imageModels, mediaModelsLoaded, imageCount],
  )

  const [prompt, setPrompt] = useState(aiConfig?.prompt ?? upstreamText ?? '')
  const [modelId, setModelId] = useState(aiConfig?.modelId ?? 'auto')
  const [aspectRatio, setAspectRatio] = useState<AiGenerateConfig['aspectRatio']>(
    aiConfig?.aspectRatio ?? '1:1',
  )
  const [resolution, setResolution] = useState<(typeof GENERATE_RESOLUTION_OPTIONS)[number]>('1K')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateCount, setGenerateCount] = useState(1)
  const [showCountDropdown, setShowCountDropdown] = useState(false)
  const [generateMode, setGenerateMode] = useState<'stack' | 'overwrite'>('stack')
  const [showGenerateDropdown, setShowGenerateDropdown] = useState(false)

  const aiResults = aiConfig?.results
  const selectedIndex = aiConfig?.selectedIndex ?? 0

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
      const hasRefImages = (upstreamImages?.length ?? 0) > 0
      // auto 时取第一个可用模型，避免传空 modelId 导致 SaaS 400
      const resolvedModelId = modelId === 'auto'
        ? (filteredModels[0]?.id ?? '')
        : modelId
      const params: ImageGenerateParams = {
        prompt,
        modelId: resolvedModelId,
        aspectRatio: aspectRatio ?? '1:1',
        resolution,
        mode: hasRefImages ? 'img2img' : 'text2img',
        referenceImageSrc: hasRefImages ? upstreamImages?.[0] : undefined,
        generateMode,
      }
      onGenerate(params)
    }
    // 逻辑：isGenerating 状态由外部 LoadingNode 接管后不再需要客户端重置，
    // 但仍设置一个短超时以防 onGenerate 未提供时 UI 不会卡住。
    setTimeout(() => setIsGenerating(false), 600)
  }, [isGenerating, modelId, prompt, aspectRatio, resolution, upstreamImages, onUpdate, onGenerate, generateMode])

  /** Handle manual upload click. */
  const handleUploadClick = useCallback(() => {
    uploadInputRef.current?.click()
  }, [])

  return (
    <div className="flex w-[420px] flex-col gap-2.5 rounded-xl border border-border bg-card p-3 shadow-lg">
      {/* ── Upstream Slots ── */}
      {(upstreamText || imageCount > 0) ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t('imagePanel.upstreamSlots')}
            </span>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 dark:hover:bg-foreground/10 transition-colors duration-150"
              title={t('imagePanel.expandUpstream')}
            >
              <Expand size={12} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Text slot */}
            {upstreamText ? (
              <div className="group relative h-[52px] w-[52px] shrink-0 rounded-md border border-border bg-ol-surface-muted flex items-center justify-center cursor-default">
                <FileText size={18} className="text-muted-foreground" />
                {/* Hover preview — above slot */}
                <div className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 w-52 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <p className="whitespace-pre-wrap break-words">{upstreamText}</p>
                </div>
              </div>
            ) : null}
            {/* Image slots */}
            {(upstreamImages ?? []).map((src, idx) => (
              <div
                key={`upstream-${idx}`}
                className="group relative h-[52px] w-[52px] shrink-0 rounded-md border border-border bg-ol-surface-muted cursor-default"
              >
                <img
                  src={src}
                  alt={`ref-${idx}`}
                  className="absolute inset-0 h-full w-full rounded-md object-cover"
                  draggable={false}
                />
                {/* Hover preview — above slot */}
                <div className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                  <img src={src} alt={`preview-${idx}`} className="max-h-40 max-w-48 object-contain" draggable={false} />
                </div>
              </div>
            ))}
            {/* Upload button */}
            <button
              type="button"
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
              onClick={handleUploadClick}
              title={t('imagePanel.uploadReference')}
            >
              <Plus size={16} />
            </button>
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

      {/* ── Prompt ── */}
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
        {/* Prompt action buttons */}
        <div className="absolute right-2 bottom-2 flex items-center gap-0.5">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 dark:hover:bg-foreground/10 transition-colors duration-150"
            title={t('imagePanel.translate')}
          >
            <Languages size={14} />
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 dark:hover:bg-foreground/10 transition-colors duration-150"
            title={t('imagePanel.enhancePrompt')}
          >
            <Wand2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Advanced Settings Toggle ── */}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors duration-150"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <ChevronRight
          size={14}
          className={[
            'transition-transform duration-150',
            showAdvanced ? 'rotate-90' : '',
          ].join(' ')}
        />
        {t('imagePanel.advancedSettings')}
      </button>

      {showAdvanced ? (
        <div className="rounded-lg border border-border bg-ol-surface-muted/50 p-3 text-xs text-muted-foreground">
          {t('imagePanel.advancedSettingsPlaceholder')}
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

      {/* ── Bottom Bar ── */}
      <div className="flex items-center gap-1.5 border-t border-border pt-2">
        {/* Model Selector */}
        <select
          className={[
            'h-7 max-w-[120px] truncate rounded-md border border-border bg-transparent px-1.5 text-[11px] text-foreground outline-none transition-colors duration-150 hover:bg-foreground/5',
            readonly ? 'opacity-60 cursor-not-allowed' : '',
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

        {/* Ratio + Resolution Selector */}
        <select
          className={[
            'h-7 rounded-md border border-border bg-transparent px-1.5 text-[11px] text-foreground outline-none transition-colors duration-150 hover:bg-foreground/5',
            readonly ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          value={`${aspectRatio}·${resolution}`}
          disabled={readonly}
          onChange={(e) => {
            const [r, res] = e.target.value.split('·')
            setAspectRatio(r as AiGenerateConfig['aspectRatio'])
            setResolution(res as (typeof GENERATE_RESOLUTION_OPTIONS)[number])
          }}
        >
          {IMAGE_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) =>
            GENERATE_RESOLUTION_OPTIONS.map((res) => (
              <option key={`${ratio}·${res}`} value={`${ratio}·${res}`}>
                {ratio} · {res}
              </option>
            )),
          )}
        </select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings Button */}
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/8 dark:hover:bg-foreground/10 transition-colors duration-150"
          title={t('imagePanel.settings')}
        >
          <Settings size={14} />
        </button>

        {/* Credits Indicator */}
        <div className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[11px] text-muted-foreground">
          <Zap size={12} />
          <span>--</span>
        </div>

        {/* Count Dropdown */}
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-0.5 rounded-md border border-border px-1.5 text-[11px] text-foreground hover:bg-foreground/5 transition-colors duration-150"
            onClick={() => setShowCountDropdown(!showCountDropdown)}
          >
            <span>{generateCount}x</span>
            <ChevronDown size={10} />
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

        {/* Generate Button / Readonly Indicator */}
        {readonly ? (
          <div className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/50">
            <Lock size={10} />
            <span>{t('imageNode.parametersLocked')}</span>
          </div>
        ) : (
          <div className="relative flex items-center">
            {/* Main generate button */}
            <button
              type="button"
              disabled={isGenerating || !prompt.trim()}
              className={[
                'inline-flex items-center gap-1 rounded-l-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-150',
                BOARD_GENERATE_BTN_IMAGE,
                (isGenerating || !prompt.trim())
                  ? 'cursor-not-allowed opacity-50'
                  : '',
              ].join(' ')}
              onClick={handleGenerate}
            >
              <Sparkles size={12} />
              {isGenerating ? t('imagePanel.generating') : t('imagePanel.generate')}
            </button>
            {/* Dropdown trigger */}
            <button
              type="button"
              disabled={isGenerating || !prompt.trim()}
              className={[
                'inline-flex h-full items-center rounded-r-full border-l border-white/20 px-1.5 py-1.5 transition-colors duration-150',
                BOARD_GENERATE_BTN_IMAGE,
                (isGenerating || !prompt.trim())
                  ? 'cursor-not-allowed opacity-50'
                  : '',
              ].join(' ')}
              onClick={() => setShowGenerateDropdown(!showGenerateDropdown)}
            >
              <ChevronDown size={10} />
            </button>
            {/* Dropdown menu */}
            {showGenerateDropdown ? (
              <div className="absolute bottom-full right-0 mb-1 flex min-w-[140px] flex-col rounded-md border border-border bg-card py-0.5 shadow-md">
                <button
                  type="button"
                  className={[
                    'flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors duration-150 hover:bg-foreground/5',
                    generateMode === 'stack' ? 'font-medium text-foreground' : 'text-muted-foreground',
                  ].join(' ')}
                  onClick={() => { setGenerateMode('stack'); setShowGenerateDropdown(false) }}
                >
                  <Layers size={12} />
                  {t('imagePanel.stackMode')}
                </button>
                <button
                  type="button"
                  className={[
                    'flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors duration-150 hover:bg-foreground/5',
                    generateMode === 'overwrite' ? 'font-medium text-foreground' : 'text-muted-foreground',
                  ].join(' ')}
                  onClick={() => { setGenerateMode('overwrite'); setShowGenerateDropdown(false) }}
                >
                  <Replace size={12} />
                  {t('imagePanel.overwriteMode')}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
