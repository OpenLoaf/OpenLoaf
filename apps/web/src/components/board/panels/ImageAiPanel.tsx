/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Link as LinkIcon, Sparkles } from 'lucide-react'
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

/** Generation mode tab values. */
type GenerateMode = 'text2img' | 'img2img'

/** Hardcoded model options (placeholder until real model list is integrated). */
const MODEL_OPTIONS = [
  { id: 'auto', labelKey: 'imagePanel.autoRecommend' },
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
}

export type ImageAiPanelProps = {
  element: CanvasNodeElement<ImageNodeProps>
  onUpdate: (patch: Partial<ImageNodeProps>) => void
  upstreamText?: string
  upstreamImages?: string[]
  /** Callback to trigger actual image generation via LoadingNode. */
  onGenerate?: (params: ImageGenerateParams) => void
}

/** AI image generation parameter panel displayed below image nodes. */
export function ImageAiPanel({
  element,
  onUpdate,
  upstreamText,
  upstreamImages,
  onGenerate,
}: ImageAiPanelProps) {
  const { t } = useTranslation('board')
  const aiConfig = element.props.aiConfig

  const [mode, setMode] = useState<GenerateMode>(
    upstreamImages?.length ? 'img2img' : 'text2img',
  )
  const usedUpstreamText = !aiConfig?.prompt && !!upstreamText
  const [prompt, setPrompt] = useState(aiConfig?.prompt ?? upstreamText ?? '')
  const [modelId, setModelId] = useState(aiConfig?.modelId ?? 'auto')
  const [aspectRatio, setAspectRatio] = useState<AiGenerateConfig['aspectRatio']>(
    aiConfig?.aspectRatio ?? '1:1',
  )
  const [resolution, setResolution] = useState<(typeof GENERATE_RESOLUTION_OPTIONS)[number]>('1K')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

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
      const params: ImageGenerateParams = {
        prompt,
        modelId,
        aspectRatio: aspectRatio ?? '1:1',
        resolution,
        mode,
        referenceImageSrc:
          mode === 'img2img' ? upstreamImages?.[0] : undefined,
      }
      onGenerate(params)
    }
    // 逻辑：isGenerating 状态由外部 LoadingNode 接管后不再需要客户端重置，
    // 但仍设置一个短超时以防 onGenerate 未提供时 UI 不会卡住。
    setTimeout(() => setIsGenerating(false), 600)
  }, [isGenerating, modelId, prompt, aspectRatio, resolution, mode, upstreamImages, onUpdate, onGenerate])

  return (
    <div className="flex w-[420px] flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
      {/* ── Mode Tabs ── */}
      <div className="flex gap-1 rounded-lg bg-ol-surface-muted p-0.5">
        <button
          type="button"
          className={[
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150',
            mode === 'text2img'
              ? 'bg-background text-ol-blue shadow-sm'
              : 'text-ol-text-secondary hover:text-ol-text-primary',
          ].join(' ')}
          onClick={() => setMode('text2img')}
        >
          {t('imagePanel.textToImage')}
        </button>
        <button
          type="button"
          className={[
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150',
            mode === 'img2img'
              ? 'bg-background text-ol-blue shadow-sm'
              : 'text-ol-text-secondary hover:text-ol-text-primary',
          ].join(' ')}
          onClick={() => setMode('img2img')}
        >
          {t('imagePanel.imageToImage')}
        </button>
      </div>

      {/* ── Upstream Banner ── */}
      {usedUpstreamText ? (
        <div className="flex items-center gap-1.5 rounded-md bg-ol-blue/5 px-2.5 py-1.5 text-xs text-ol-blue">
          <LinkIcon size={12} />
          <span>{t('imagePanel.upstreamLoaded')}</span>
        </div>
      ) : null}

      {/* ── Prompt ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ol-text-secondary">
          {t('imagePanel.prompt')}
        </label>
        <textarea
          className={[
            'min-h-[72px] w-full resize-none rounded-lg border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
          ].join(' ')}
          placeholder={t('imagePanel.promptPlaceholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
      </div>

      {/* ── Model Select ── */}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('imagePanel.model')}
        </label>
        <select
          className={[
            'flex-1 rounded-lg border px-3 py-1.5 text-sm',
            BOARD_GENERATE_INPUT,
          ].join(' ')}
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {'labelKey' in opt ? t(opt.labelKey) : opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Aspect Ratio ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ol-text-secondary">
          {t('imagePanel.aspectRatio')}
        </label>
        <div className="flex gap-1.5">
          {IMAGE_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) => (
            <button
              key={ratio}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                aspectRatio === ratio
                  ? 'bg-ol-blue/10 text-ol-blue'
                  : 'bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-blue/5 hover:text-ol-blue',
              ].join(' ')}
              onClick={() => setAspectRatio(ratio)}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* ── Resolution ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ol-text-secondary">
          {t('imagePanel.resolution')}
        </label>
        <div className="flex gap-1.5">
          {GENERATE_RESOLUTION_OPTIONS.map((res) => (
            <button
              key={res}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                resolution === res
                  ? 'bg-ol-blue/10 text-ol-blue'
                  : 'bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-blue/5 hover:text-ol-blue',
              ].join(' ')}
              onClick={() => setResolution(res)}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* ── Advanced Settings Toggle ── */}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-ol-text-auxiliary hover:text-ol-text-secondary transition-colors duration-150"
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
        <div className="rounded-lg border border-ol-divider bg-ol-surface-muted/50 p-3 text-xs text-ol-text-auxiliary">
          {/* Placeholder for advanced settings (negative prompt, style, etc.) */}
          {t('imagePanel.advancedSettingsPlaceholder')}
        </div>
      ) : null}

      {/* ── Footer: Generate Button ── */}
      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          disabled={isGenerating || !prompt.trim()}
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150',
            BOARD_GENERATE_BTN_IMAGE,
            (isGenerating || !prompt.trim())
              ? 'cursor-not-allowed opacity-50'
              : '',
          ].join(' ')}
          onClick={handleGenerate}
        >
          <Sparkles size={14} />
          {isGenerating ? t('imagePanel.generating') : t('imagePanel.generate')}
        </button>
      </div>
    </div>
  )
}
