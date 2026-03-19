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
import { ImagePlus, Sparkles } from 'lucide-react'
import type { CanvasNodeElement } from '../engine/types'
import type { VideoNodeProps } from '../nodes/VideoNode'
import type { AiGenerateConfig } from '../board-contracts'
import {
  VIDEO_GENERATE_ASPECT_RATIO_OPTIONS,
  VIDEO_GENERATE_DURATION_OPTIONS,
} from '../nodes/node-config'
import {
  BOARD_GENERATE_INPUT,
  BOARD_GENERATE_BTN_VIDEO,
} from '../ui/board-style-system'

/** Hardcoded model options (placeholder until real model list is integrated). */
const MODEL_OPTIONS = [
  { id: 'auto', labelKey: 'videoPanel.autoRecommend' },
  { id: 'kling-v1', label: 'Kling v1' },
  { id: 'runway-gen3', label: 'Runway Gen-3' },
  { id: 'pika-v2', label: 'Pika v2' },
] as const

export type VideoGenerateParams = {
  prompt: string
  modelId: string
  aspectRatio: string
  duration: number
  firstFrameImageSrc?: string
}

export type VideoAiPanelProps = {
  element: CanvasNodeElement<VideoNodeProps>
  onUpdate: (patch: Partial<VideoNodeProps>) => void
  onGenerate?: (params: VideoGenerateParams) => void
  upstreamText?: string
  upstreamImages?: string[]
}

/** AI video generation parameter panel displayed below video nodes. */
export function VideoAiPanel({
  element,
  onUpdate,
  onGenerate,
  upstreamText,
  upstreamImages,
}: VideoAiPanelProps) {
  const { t } = useTranslation('board')
  const aiConfig = element.props.aiConfig

  const [prompt, setPrompt] = useState(aiConfig?.prompt ?? upstreamText ?? '')
  const [modelId, setModelId] = useState(aiConfig?.modelId ?? 'auto')
  const [aspectRatio, setAspectRatio] = useState<AiGenerateConfig['aspectRatio']>(
    aiConfig?.aspectRatio ?? '16:9',
  )
  const [duration, setDuration] = useState<(typeof VIDEO_GENERATE_DURATION_OPTIONS)[number]>(5)
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

    const firstFrameImageSrc = upstreamImages?.[0]
    if (onGenerate) {
      onGenerate({ prompt, modelId, aspectRatio: aspectRatio ?? '16:9', duration, firstFrameImageSrc })
    }

    // Reset generating state after a short delay (actual task tracking is done by LoadingNode).
    setTimeout(() => setIsGenerating(false), 300)
  }, [isGenerating, modelId, prompt, aspectRatio, duration, upstreamImages, onUpdate, onGenerate])

  const hasUpstreamImages = upstreamImages && upstreamImages.length > 0

  return (
    <div className="flex w-[420px] flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
      {/* ── Prompt ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ol-text-secondary">
          {t('videoPanel.prompt')}
        </label>
        <textarea
          className={[
            'min-h-[72px] w-full resize-none rounded-lg border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
          ].join(' ')}
          placeholder={t('videoPanel.promptPlaceholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
      </div>

      {/* ── First Frame Image ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ol-text-secondary">
          {t('videoPanel.firstFrame')}
        </label>
        {hasUpstreamImages ? (
          <div className="flex gap-2">
            {upstreamImages.slice(0, 3).map((src) => (
              <div
                key={src}
                className="h-14 w-14 overflow-hidden rounded-lg border border-ol-divider bg-ol-surface-muted"
              >
                <img
                  src={src}
                  alt="First frame"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            <span className="self-center text-xs text-ol-text-auxiliary">
              {t('videoPanel.firstFrameAuto')}
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-ol-divider bg-ol-surface-muted text-xs text-ol-text-auxiliary transition-colors duration-150 hover:border-ol-purple hover:text-ol-purple"
          >
            <ImagePlus size={16} />
            {t('videoPanel.firstFrameUpload')}
          </button>
        )}
      </div>

      {/* ── Model Select ── */}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('videoPanel.model')}
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
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('videoPanel.aspectRatio')}
        </label>
        <div className="flex gap-1.5">
          {VIDEO_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) => (
            <button
              key={ratio}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                aspectRatio === ratio
                  ? 'bg-ol-purple/10 text-ol-purple'
                  : 'bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-purple/5 hover:text-ol-purple',
              ].join(' ')}
              onClick={() => setAspectRatio(ratio)}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* ── Duration ── */}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('videoPanel.duration')}
        </label>
        <div className="flex gap-1.5">
          {VIDEO_GENERATE_DURATION_OPTIONS.map((dur) => (
            <button
              key={dur}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                duration === dur
                  ? 'bg-ol-purple/10 text-ol-purple'
                  : 'bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-purple/5 hover:text-ol-purple',
              ].join(' ')}
              onClick={() => setDuration(dur)}
            >
              {dur}s
            </button>
          ))}
        </div>
      </div>

      {/* ── Footer: Generate Button ── */}
      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          disabled={isGenerating || !prompt.trim()}
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150',
            BOARD_GENERATE_BTN_VIDEO,
            (isGenerating || !prompt.trim())
              ? 'cursor-not-allowed opacity-50'
              : '',
          ].join(' ')}
          onClick={handleGenerate}
        >
          <Sparkles size={14} />
          {isGenerating ? t('videoPanel.generating') : t('videoPanel.generate')}
        </button>
      </div>
    </div>
  )
}
