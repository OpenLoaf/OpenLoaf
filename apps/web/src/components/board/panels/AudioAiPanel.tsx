/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useState, useMemo, useCallback } from 'react'
import {
  ChevronDown,
  Link2,
  Mic,
  Music,
  Sparkles,
  Volume2,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@udecode/cn'
import {
  BOARD_GENERATE_INPUT,
} from '../ui/board-style-system'
import { estimateAudioCredits } from '../services/credit-estimate'
import { GenerateActionBar } from './GenerateActionBar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Audio generation mode. */
export type AudioGenerateMode = 'tts' | 'music' | 'sfx'

/** Duration option in seconds. */
export type AudioDurationOption = 5 | 10 | 30 | 60

/** Upstream data fed into the panel via connectors. */
export type AudioPanelUpstream = {
  /** Plain text from a connected text node (for TTS). */
  textContent?: string
  /** Audio source path from a connected audio node (for TTS reference voice). */
  referenceAudioSrc?: string
  /** Display name for the reference audio. */
  referenceAudioName?: string
}

/** Audio generate params type. */
export type AudioGenerateParams = {
  mode: AudioGenerateMode
  prompt: string
  modelId: string
  duration: AudioDurationOption | 'auto'
  textContent?: string
  referenceAudioSrc?: string
}

/** Props for the AudioAiPanel component. */
export type AudioAiPanelProps = {
  /** Upstream data from connected nodes. */
  upstream?: AudioPanelUpstream
  /** Callback when the user submits a generation request. */
  onGenerate?: (params: AudioGenerateParams) => void
  /** Callback to generate into a new derived node. */
  onGenerateNewNode?: (params: AudioGenerateParams) => void
  /** Whether the node currently has a resource. */
  hasResource?: boolean
  /** Whether the panel is in a generating state. */
  generating?: boolean
  /** When true, all inputs are disabled and the generate button is hidden. */
  readonly?: boolean
  /** Editing mode — user unlocked an existing result to tweak params. */
  editing?: boolean
  /** Callback to unlock the panel for editing. */
  onUnlock?: () => void
  /** Additional class name for the root element. */
  className?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DURATION_OPTIONS: AudioDurationOption[] = [5, 10, 30, 60]

const TAB_CONFIG: { id: AudioGenerateMode; icon: typeof Mic }[] = [
  { id: 'tts', icon: Mic },
  { id: 'music', icon: Music },
  { id: 'sfx', icon: Volume2 },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Audio AI generation panel with TTS / Music / SFX tabs. */
export function AudioAiPanel({
  upstream,
  onGenerate,
  onGenerateNewNode,
  hasResource = false,
  generating = false,
  readonly = false,
  editing = false,
  onUnlock,
  className,
}: AudioAiPanelProps) {
  const { t } = useTranslation('board')

  // State
  const [mode, setMode] = useState<AudioGenerateMode>('tts')
  const [prompt, setPrompt] = useState('')
  const [modelId] = useState('')
  const [duration, setDuration] = useState<AudioDurationOption | 'auto'>('auto')
  const [durationOpen, setDurationOpen] = useState(false)

  const hasUpstreamText = Boolean(upstream?.textContent?.trim())
  const hasUpstreamAudio = Boolean(upstream?.referenceAudioSrc?.trim())

  // For TTS mode, duration is auto (based on text length)
  const showDuration = mode !== 'tts'

  const buildParams = useCallback((): AudioGenerateParams => ({
    mode,
    prompt,
    modelId,
    duration: mode === 'tts' ? 'auto' : duration,
    textContent: mode === 'tts' ? upstream?.textContent : undefined,
    referenceAudioSrc:
      mode === 'tts' ? upstream?.referenceAudioSrc : undefined,
  }), [mode, prompt, modelId, duration, upstream])

  const handleGenerate = useCallback(() => {
    onGenerate?.(buildParams())
  }, [onGenerate, buildParams])

  const handleGenerateNew = useCallback(() => {
    onGenerateNewNode?.(buildParams())
  }, [onGenerateNewNode, buildParams])

  const durationLabel = useMemo(() => {
    if (duration === 'auto') return t('audioPanel.durationAuto')
    return `${duration}s`
  }, [duration, t])

  const textLength = mode === 'tts' ? (upstream?.textContent?.length ?? 0) : 0
  const estimatedCredits = useMemo(
    () =>
      estimateAudioCredits({
        modelId,
        textLength,
        duration: mode === 'tts' ? 'auto' : duration,
        mode,
      }),
    [modelId, textLength, duration, mode],
  )

  return (
    <div
      className={cn(
        'flex w-[420px] flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-lg',
        readonly && 'opacity-80',
        className,
      )}
    >
      {/* ---- Tab Row ---- */}
      <div className="flex items-center gap-1 rounded-md bg-ol-surface-muted p-0.5">
        {TAB_CONFIG.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled={readonly}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5',
              'text-xs font-medium transition-colors duration-150',
              readonly
                ? 'cursor-not-allowed text-muted-foreground/40'
                : mode === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => !readonly && setMode(id)}
          >
            <Icon size={13} />
            <span>{t(`audioPanel.tabs.${id}`)}</span>
          </button>
        ))}
      </div>

      {/* ---- Slot Area (mode-specific) ---- */}
      {mode === 'tts' && (
        <div className="flex flex-col gap-2.5">
          {/* Text Content Preview */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('audioPanel.tts.textPreview')}
            </label>
            {hasUpstreamText ? (
              <div className="flex items-start gap-2 rounded-md border border-border/40 bg-ol-surface-muted px-2.5 py-2">
                <Link2
                  size={13}
                  className="mt-0.5 flex-shrink-0 text-ol-blue"
                />
                <p className="line-clamp-4 text-xs leading-relaxed text-foreground">
                  {upstream!.textContent}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border/40 bg-ol-surface-muted px-2.5 py-3">
                <span className="text-[11px] text-muted-foreground">
                  {t('audioPanel.tts.textPreviewEmpty')}
                </span>
              </div>
            )}
          </div>

          {/* Reference Voice */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('audioPanel.tts.referenceVoice')}
            </label>
            {hasUpstreamAudio ? (
              <div className="flex items-center gap-2 rounded-md border border-border/40 bg-ol-surface-muted px-2.5 py-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ol-amber-bg text-ol-amber">
                  <Music size={12} />
                </div>
                <span className="truncate text-xs text-foreground">
                  {upstream!.referenceAudioName || 'audio'}
                </span>
                <Link2
                  size={12}
                  className="ml-auto flex-shrink-0 text-ol-blue"
                />
              </div>
            ) : (
              <button
                type="button"
                className="flex items-center gap-2 rounded-md border border-dashed border-border/40 bg-ol-surface-muted px-2.5 py-2.5 text-[11px] text-muted-foreground transition-colors hover:border-border/60"
              >
                <Mic size={13} />
                <span>{t('audioPanel.tts.selectVoice')}</span>
              </button>
            )}
          </div>

          {/* Registered Voice (placeholder for V1.5) */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('audioPanel.tts.registeredVoice')}
            </label>
            <div className="flex items-center rounded-md border border-border/40 bg-ol-surface-muted px-2.5 py-2 text-[11px] text-muted-foreground/60">
              <span>{t('audioPanel.tts.registeredVoicePlaceholder')}</span>
            </div>
          </div>
        </div>
      )}

      {/* ---- Prompt Textarea ---- */}
      <div className="relative flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          {t('audioPanel.prompt')}
        </label>
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => !readonly && setPrompt(e.target.value)}
            readOnly={readonly}
            placeholder={t('audioPanel.promptPlaceholder')}
            rows={3}
            className={cn(
              'w-full resize-none rounded-md border px-2.5 py-2 pr-8 text-xs',
              BOARD_GENERATE_INPUT,
              readonly && 'cursor-not-allowed opacity-60',
            )}
          />
          {/* Enhance Prompt Button — TODO: re-enable when implemented */}
          {/* <button
            type="button"
            className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
            title={t('audioPanel.enhancePrompt')}
          >
            <Wand2 size={13} />
          </button> */}
        </div>
      </div>

      {/* ---- Bottom Bar ---- */}
      <div className="flex items-center gap-2">
        {/* Model Selector */}
        <button
          type="button"
          disabled={readonly}
          className={cn(
            'flex items-center gap-1 rounded-full border border-border/40 bg-ol-surface-muted px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-ol-surface-muted/80',
            readonly && 'cursor-not-allowed opacity-60',
          )}
        >
          <Sparkles size={11} />
          <span>{modelId || t('audioPanel.model')}</span>
          <ChevronDown size={11} className="text-muted-foreground" />
        </button>

        {/* Duration Selector (hidden for TTS) */}
        {showDuration && (
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1 rounded-full border border-border/40 bg-ol-surface-muted px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-ol-surface-muted/80"
              onClick={() => setDurationOpen(!durationOpen)}
            >
              <span>{durationLabel}</span>
              <ChevronDown size={11} className="text-muted-foreground" />
            </button>
            {durationOpen && (
              <div className="absolute bottom-full left-0 z-10 mb-1 flex flex-col rounded-md border border-border/60 bg-card py-1 shadow-md">
                <button
                  type="button"
                  className={cn(
                    'px-3 py-1 text-left text-[11px] transition-colors hover:bg-ol-surface-muted',
                    duration === 'auto' && 'text-ol-blue font-medium',
                  )}
                  onClick={() => {
                    setDuration('auto')
                    setDurationOpen(false)
                  }}
                >
                  {t('audioPanel.durationAuto')}
                </button>
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={cn(
                      'px-3 py-1 text-left text-[11px] transition-colors hover:bg-ol-surface-muted',
                      duration === d && 'text-ol-blue font-medium',
                    )}
                    onClick={() => {
                      setDuration(d)
                      setDurationOpen(false)
                    }}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Translate — TODO: re-enable when implemented */}
        {/* <button
          type="button"
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('audioPanel.translate')}
        </button> */}

        {/* Credits Indicator */}
        <div className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={t('audioPanel.estimatedCredits')}>
          <Zap size={12} />
          <span>{estimatedCredits != null ? `≈${estimatedCredits}` : '--'}</span>
        </div>
      </div>

      {/* ---- Generate Action Bar ---- */}
      <GenerateActionBar
        hasResource={hasResource}
        generating={generating}
        disabled={false}
        buttonClassName="bg-foreground text-background hover:bg-foreground/90"
        onGenerate={handleGenerate}
        onGenerateNewNode={handleGenerateNew}
        readonly={readonly}
        editing={editing}
        onUnlock={onUnlock}
      />
    </div>
  )
}
