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
import { Link as LinkIcon, Sparkles } from 'lucide-react'
import type { CanvasNodeElement } from '../engine/types'
import type { AudioNodeProps } from '../nodes/AudioNode'
import type { AiGenerateConfig } from '../board-contracts'
import {
  BOARD_GENERATE_INPUT,
  BOARD_GENERATE_BTN_CHAT,
} from '../ui/board-style-system'

/** Duration presets in seconds. */
const AUDIO_DURATION_OPTIONS = [5, 10, 30, 60] as const

/** Audio type options. */
const AUDIO_TYPE_OPTIONS = ['music', 'voiceover', 'sfx'] as const
type AudioType = (typeof AUDIO_TYPE_OPTIONS)[number]

/** Fallback model options used when no cloud models are available. */
const FALLBACK_MODEL_OPTIONS = [
  { id: 'auto', label: '' },
  { id: 'suno-v4', label: 'Suno v4' },
  { id: 'udio-v1', label: 'Udio v1' },
] as const

export type AudioGenerateParams = {
  prompt: string
  modelId: string
  audioType: AudioType
  duration: number
}

export type AudioAiPanelProps = {
  element: CanvasNodeElement<AudioNodeProps>
  onUpdate: (patch: Partial<AudioNodeProps>) => void
  onGenerate?: (params: AudioGenerateParams) => void
  upstreamText?: string
}

/** AI audio generation parameter panel displayed below audio nodes. */
export function AudioAiPanel({
  element,
  onUpdate,
  onGenerate,
  upstreamText,
}: AudioAiPanelProps) {
  const { t } = useTranslation('board')
  const aiConfig = element.props.aiConfig

  const usedUpstreamText = !aiConfig?.prompt && !!upstreamText
  const [prompt, setPrompt] = useState(aiConfig?.prompt ?? upstreamText ?? '')
  const [modelId, setModelId] = useState(aiConfig?.modelId ?? 'auto')
  const [audioType, setAudioType] = useState<AudioType>('music')
  const [duration, setDuration] = useState<(typeof AUDIO_DURATION_OPTIONS)[number]>(10)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = useCallback(() => {
    if (isGenerating) return
    setIsGenerating(true)
    const config: AiGenerateConfig = {
      modelId,
      prompt,
    }
    onUpdate({
      origin: 'ai-generate',
      aiConfig: config,
    })

    if (onGenerate) {
      onGenerate({ prompt, modelId, audioType, duration })
    }

    // Reset generating state after a short delay (actual task tracking is done by LoadingNode).
    setTimeout(() => setIsGenerating(false), 300)
  }, [isGenerating, modelId, prompt, audioType, duration, onUpdate, onGenerate])

  return (
    <div className="flex w-[420px] flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
      {/* -- Upstream Banner -- */}
      {usedUpstreamText ? (
        <div className="flex items-center gap-1.5 rounded-md bg-ol-green/5 px-2.5 py-1.5 text-xs text-ol-green">
          <LinkIcon size={12} />
          <span>{t('audioPanel.upstreamLoaded')}</span>
        </div>
      ) : null}

      {/* -- Audio Type -- */}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('audioPanel.type')}
        </label>
        <div className="flex gap-1.5">
          {AUDIO_TYPE_OPTIONS.map((type) => (
            <button
              key={type}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                audioType === type
                  ? 'bg-ol-green/10 text-ol-green'
                  : 'bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-green/5 hover:text-ol-green',
              ].join(' ')}
              onClick={() => setAudioType(type)}
            >
              {t(`audioPanel.${type}`)}
            </button>
          ))}
        </div>
      </div>

      {/* -- Prompt -- */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ol-text-secondary">
          {t('audioPanel.prompt')}
        </label>
        <textarea
          className={[
            'min-h-[72px] w-full resize-none rounded-lg border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
          ].join(' ')}
          placeholder={t('audioPanel.promptPlaceholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
      </div>

      {/* -- Model Select -- */}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('audioPanel.model')}
        </label>
        <select
          className={[
            'flex-1 rounded-lg border px-3 py-1.5 text-sm',
            BOARD_GENERATE_INPUT,
          ].join(' ')}
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        >
          {FALLBACK_MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.id === 'auto' ? t('audioPanel.autoRecommend') : opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* -- Duration -- */}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-ol-text-secondary">
          {t('audioPanel.duration')}
        </label>
        <div className="flex gap-1.5">
          {AUDIO_DURATION_OPTIONS.map((dur) => (
            <button
              key={dur}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                duration === dur
                  ? 'bg-ol-green/10 text-ol-green'
                  : 'bg-ol-surface-muted text-ol-text-secondary hover:bg-ol-green/5 hover:text-ol-green',
              ].join(' ')}
              onClick={() => setDuration(dur)}
            >
              {dur}s
            </button>
          ))}
        </div>
      </div>

      {/* -- Footer: Generate Button -- */}
      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          disabled={isGenerating || !prompt.trim()}
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150',
            BOARD_GENERATE_BTN_CHAT,
            (isGenerating || !prompt.trim())
              ? 'cursor-not-allowed opacity-50'
              : '',
          ].join(' ')}
          onClick={handleGenerate}
        >
          <Sparkles size={14} />
          {isGenerating ? t('audioPanel.generating') : t('audioPanel.generate')}
        </button>
      </div>
    </div>
  )
}
