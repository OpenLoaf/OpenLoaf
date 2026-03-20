/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ImagePlus,
  Languages,
  Layers,
  Link as LinkIcon,
  Lock,
  Replace,
  Sparkles,
  Video,
  Wand2,
  Zap,
} from 'lucide-react'
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
import { useMediaModels } from '@/hooks/use-media-models'
import { filterVideoMediaModels } from '../nodes/lib/image-generation'

/** Fallback model options used when no cloud models are available. */
const FALLBACK_MODEL_OPTIONS = [
  { id: 'kling-v1', label: 'Kling v1' },
  { id: 'runway-gen3', label: 'Runway Gen-3' },
  { id: 'pika-v2', label: 'Pika v2' },
] as const

/** Video generation mode. */
type VideoMode = 'text2video' | 'universalRef' | 'img2video' | 'startEndFrame' | 'videoEdit'

/** All modes with their i18n key and enabled status. */
const VIDEO_MODES: Array<{ id: VideoMode; key: string; enabled: boolean }> = [
  { id: 'text2video', key: 'mode.textToVideo', enabled: true },
  { id: 'universalRef', key: 'mode.universalRef', enabled: true },
  { id: 'img2video', key: 'mode.imageToVideo', enabled: true },
  { id: 'startEndFrame', key: 'mode.startEndFrame', enabled: true },
  { id: 'videoEdit', key: 'mode.videoEdit', enabled: false },
]

/** Reference feature buttons for universalRef mode. */
const REF_FEATURES = ['mark', 'effect', 'subject', 'camera'] as const

export type VideoGenerateParams = {
  prompt: string
  modelId: string
  aspectRatio: string
  duration: number
  firstFrameImageSrc?: string
  /** Whether to stack (default) or overwrite the primary version. */
  generateMode?: 'stack' | 'overwrite'
}

export type VideoAiPanelProps = {
  element: CanvasNodeElement<VideoNodeProps>
  onUpdate: (patch: Partial<VideoNodeProps>) => void
  onGenerate?: (params: VideoGenerateParams) => void
  upstreamText?: string
  upstreamImages?: string[]
  /** When true, all inputs are disabled and the generate button is hidden. */
  readonly?: boolean
}

/** AI video generation parameter panel displayed below video nodes. */
export function VideoAiPanel({
  element,
  onUpdate,
  onGenerate,
  upstreamText,
  upstreamImages,
  readonly = false,
}: VideoAiPanelProps) {
  const { t } = useTranslation('board')
  const aiConfig = element.props.aiConfig
  const { videoModels, loaded: mediaModelsLoaded } = useMediaModels()

  const [mode, setMode] = useState<VideoMode>('text2video')

  const imageCount = upstreamImages?.length ?? 0
  const filteredModels = useMemo(
    () =>
      mediaModelsLoaded && videoModels.length > 0
        ? filterVideoMediaModels(videoModels, {
            imageCount,
            hasReference: mode === 'universalRef',
            hasStartEnd: mode === 'startEndFrame',
            withAudio: false,
          })
        : [],
    [videoModels, mediaModelsLoaded, imageCount, mode],
  )

  const usedUpstreamText = !aiConfig?.prompt && !!upstreamText
  const [prompt, setPrompt] = useState(aiConfig?.prompt ?? upstreamText ?? '')
  const [modelId, setModelId] = useState(aiConfig?.modelId ?? 'auto')
  const [aspectRatio, setAspectRatio] = useState<AiGenerateConfig['aspectRatio']>(
    aiConfig?.aspectRatio ?? '16:9',
  )
  const [duration, setDuration] = useState<(typeof VIDEO_GENERATE_DURATION_OPTIONS)[number]>(5)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateCount, setGenerateCount] = useState(1)
  const [showCountDropdown, setShowCountDropdown] = useState(false)
  const [generateMode, setGenerateMode] = useState<'stack' | 'overwrite'>('stack')
  const [showGenerateDropdown, setShowGenerateDropdown] = useState(false)

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
      onGenerate({ prompt, modelId, aspectRatio: aspectRatio ?? '16:9', duration, firstFrameImageSrc, generateMode })
    }

    // Reset generating state after a short delay (actual task tracking is done by LoadingNode).
    setTimeout(() => setIsGenerating(false), 300)
  }, [isGenerating, modelId, prompt, aspectRatio, duration, upstreamImages, onUpdate, onGenerate, generateMode])

  const hasUpstreamImages = upstreamImages && upstreamImages.length > 0

  return (
    <div className={[
      'flex w-[420px] flex-col gap-2.5 rounded-xl border border-border bg-card p-3 shadow-lg',
      readonly ? 'opacity-80' : '',
    ].join(' ')}>
      {/* ── Readonly Banner ── */}
      {readonly ? (
        <div className="flex items-center gap-1.5 rounded-md bg-foreground/5 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Lock size={12} />
          <span>{t('videoPanel.parametersLocked', { defaultValue: 'Parameters locked' })}</span>
        </div>
      ) : null}
      {/* ── Mode Tabs ── */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-ol-surface-muted p-0.5">
        {VIDEO_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={readonly || !m.enabled}
            className={[
              'relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150',
              readonly || !m.enabled
                ? 'cursor-not-allowed text-muted-foreground/40'
                : mode === m.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            onClick={() => !readonly && m.enabled && setMode(m.id)}
          >
            {t(`videoPanel.${m.key}`)}
            {!m.enabled ? (
              <span className="ml-1 inline-flex items-center rounded bg-muted-foreground/10 px-1 py-px text-[9px] font-semibold leading-none text-muted-foreground/50">
                {t('videoPanel.modeV2Badge')}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Upstream Banner ── */}
      {usedUpstreamText ? (
        <div className="flex items-center gap-1.5 rounded-md bg-foreground/5 px-2.5 py-1.5 text-xs text-muted-foreground">
          <LinkIcon size={12} />
          <span>{t('videoPanel.upstreamLoaded')}</span>
        </div>
      ) : null}

      {/* ── Slot Area: per mode ── */}
      {mode === 'img2video' ? (
        <SlotArea
          label={t('videoPanel.firstFrame')}
          images={hasUpstreamImages ? upstreamImages.slice(0, 1) : undefined}
          upstreamBanner={hasUpstreamImages ? t('videoPanel.upstreamImageLoaded') : undefined}
          uploadLabel={t('videoPanel.firstFrameUpload')}
        />
      ) : null}

      {mode === 'startEndFrame' ? (
        <div className="flex gap-2">
          <SlotArea
            label={t('videoPanel.firstFrame')}
            images={hasUpstreamImages ? upstreamImages.slice(0, 1) : undefined}
            uploadLabel={t('videoPanel.firstFrameUpload')}
            compact
          />
          <SlotArea
            label={t('videoPanel.lastFrame')}
            images={hasUpstreamImages && upstreamImages.length > 1 ? upstreamImages.slice(1, 2) : undefined}
            uploadLabel={t('videoPanel.firstFrameUpload')}
            compact
          />
        </div>
      ) : null}

      {mode === 'universalRef' ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            {REF_FEATURES.map((feat) => (
              <button
                key={feat}
                type="button"
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
              >
                {t(`videoPanel.refFeatures.${feat}`)}
              </button>
            ))}
          </div>
          {hasUpstreamImages ? (
            <div className="flex flex-wrap gap-1.5">
              {upstreamImages.slice(0, 4).map((src, idx) => (
                <div
                  key={`ref-${idx}`}
                  className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-md border border-border bg-ol-surface-muted"
                >
                  <img
                    src={src}
                    alt={`ref-${idx}`}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'videoEdit' ? (
        <SlotArea
          label={t('videoPanel.sourceVideo')}
          uploadLabel={t('videoPanel.firstFrameUpload')}
          disabled
          icon={<Video size={16} />}
        />
      ) : null}

      {/* ── Prompt ── */}
      <div className="relative flex flex-col gap-1">
        <textarea
          className={[
            'min-h-[68px] w-full resize-none rounded-lg border px-3 py-2 pr-9 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
            readonly ? 'cursor-not-allowed opacity-60' : '',
          ].join(' ')}
          placeholder={t('videoPanel.promptPlaceholder')}
          value={prompt}
          onChange={(e) => !readonly && setPrompt(e.target.value)}
          readOnly={readonly}
          rows={3}
        />
        {/* Prompt Enhancement Button */}
        <button
          type="button"
          className="absolute right-2 bottom-2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 dark:hover:bg-foreground/10 transition-colors duration-150"
          title={t('videoPanel.enhancePrompt')}
        >
          <Wand2 size={14} />
        </button>
      </div>

      {/* ── Bottom Bar ── */}
      <div className="flex items-center gap-1.5 border-t border-border pt-2">
        {/* Model Selector */}
        <select
          className={[
            'h-7 max-w-[120px] truncate rounded-md border border-border bg-transparent px-1.5 text-[11px] text-foreground outline-none transition-colors duration-150 hover:bg-foreground/5',
            readonly ? 'cursor-not-allowed opacity-60' : '',
          ].join(' ')}
          value={modelId}
          onChange={(e) => !readonly && setModelId(e.target.value)}
          disabled={readonly}
        >
          <option value="auto">{t('videoPanel.autoRecommend')}</option>
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

        {/* Quality + Ratio + Duration Selector */}
        <select
          className={[
            'h-7 rounded-md border border-border bg-transparent px-1.5 text-[11px] text-foreground outline-none transition-colors duration-150 hover:bg-foreground/5',
            readonly ? 'cursor-not-allowed opacity-60' : '',
          ].join(' ')}
          value={`${aspectRatio}·${duration}s`}
          disabled={readonly}
          onChange={(e) => {
            const [r, d] = e.target.value.split('·')
            setAspectRatio(r as AiGenerateConfig['aspectRatio'])
            setDuration(Number.parseInt(d, 10) as (typeof VIDEO_GENERATE_DURATION_OPTIONS)[number])
          }}
        >
          {VIDEO_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) =>
            VIDEO_GENERATE_DURATION_OPTIONS.map((dur) => (
              <option key={`${ratio}·${dur}s`} value={`${ratio}·${dur}s`}>
                {ratio} · {dur}s
              </option>
            )),
          )}
        </select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Translate Button */}
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/8 dark:hover:bg-foreground/10 transition-colors duration-150"
          title={t('videoPanel.translate')}
        >
          <Languages size={14} />
        </button>

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

        {/* Credits Indicator */}
        <div className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[11px] text-muted-foreground">
          <Zap size={12} />
          <span>--</span>
        </div>

        {/* Send / Generate Split Button */}
        {readonly ? null : (
          <div className="relative flex items-center">
            {/* Main generate button */}
            <button
              type="button"
              disabled={isGenerating || !prompt.trim()}
              className={[
                'inline-flex items-center gap-1 rounded-l-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-150',
                BOARD_GENERATE_BTN_VIDEO,
                (isGenerating || !prompt.trim())
                  ? 'cursor-not-allowed opacity-50'
                  : '',
              ].join(' ')}
              onClick={handleGenerate}
            >
              <Sparkles size={12} />
              {isGenerating ? t('videoPanel.generating') : t('videoPanel.generate')}
            </button>
            {/* Dropdown trigger */}
            <button
              type="button"
              disabled={isGenerating || !prompt.trim()}
              className={[
                'inline-flex h-full items-center rounded-r-full border-l border-white/20 px-1.5 py-1.5 transition-colors duration-150',
                BOARD_GENERATE_BTN_VIDEO,
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
                  {t('videoPanel.stackMode')}
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
                  {t('videoPanel.overwriteMode')}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SlotArea — reusable image/video upload slot
// ---------------------------------------------------------------------------

type SlotAreaProps = {
  label: string
  images?: string[]
  upstreamBanner?: string
  uploadLabel: string
  compact?: boolean
  disabled?: boolean
  icon?: React.ReactNode
}

function SlotArea({
  label,
  images,
  upstreamBanner,
  uploadLabel,
  compact,
  disabled,
  icon,
}: SlotAreaProps) {
  const hasImages = images && images.length > 0

  return (
    <div className={[
      'flex flex-col gap-1.5',
      compact ? 'flex-1 min-w-0' : '',
    ].join(' ')}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {upstreamBanner && hasImages ? (
        <div className="flex items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11px] text-muted-foreground">
          <LinkIcon size={10} />
          <span className="truncate">{upstreamBanner}</span>
        </div>
      ) : null}
      {hasImages ? (
        <div className="flex gap-1.5">
          {images.map((src, idx) => (
            <div
              key={`slot-${idx}`}
              className={[
                'overflow-hidden rounded-md border border-border bg-ol-surface-muted',
                compact ? 'h-[52px] w-full' : 'h-14 w-14',
              ].join(' ')}
            >
              <img
                src={src}
                alt={label}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          className={[
            'flex items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs transition-colors duration-150',
            compact ? 'h-[52px] w-full' : 'h-14 w-full',
            disabled
              ? 'cursor-not-allowed bg-ol-surface-muted/50 text-muted-foreground/30'
              : 'bg-ol-surface-muted text-muted-foreground hover:border-foreground/30 hover:text-foreground',
          ].join(' ')}
        >
          {icon ?? <ImagePlus size={16} />}
          {compact ? null : uploadLabel}
        </button>
      )}
    </div>
  )
}
