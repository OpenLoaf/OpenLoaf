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
  Layers,
  Link2,
  Lock,
  Mic,
  Music,
  Replace,
  Send,
  Sparkles,
  Volume2,
  Wand2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@udecode/cn'
import {
  BOARD_GENERATE_INPUT,
} from '../ui/board-style-system'

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

/** Props for the AudioAiPanel component. */
export type AudioAiPanelProps = {
  /** Upstream data from connected nodes. */
  upstream?: AudioPanelUpstream
  /** Callback when the user submits a generation request. */
  onGenerate?: (params: {
    mode: AudioGenerateMode
    prompt: string
    modelId: string
    duration: AudioDurationOption | 'auto'
    textContent?: string
    referenceAudioSrc?: string
    /** Whether to stack (default) or overwrite the primary version. */
    generateMode?: 'stack' | 'overwrite'
  }) => void
  /** Whether the panel is in a generating state. */
  generating?: boolean
  /** When true, all inputs are disabled and the generate button is hidden. */
  readonly?: boolean
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
  generating = false,
  readonly = false,
  className,
}: AudioAiPanelProps) {
  const { t } = useTranslation('board')

  // State
  const [mode, setMode] = useState<AudioGenerateMode>('tts')
  const [prompt, setPrompt] = useState('')
  const [modelId] = useState('')
  const [duration, setDuration] = useState<AudioDurationOption | 'auto'>('auto')
  const [durationOpen, setDurationOpen] = useState(false)
  const [generateMode, setGenerateMode] = useState<'stack' | 'overwrite'>('stack')
  const [showGenerateDropdown, setShowGenerateDropdown] = useState(false)

  const hasUpstreamText = Boolean(upstream?.textContent?.trim())
  const hasUpstreamAudio = Boolean(upstream?.referenceAudioSrc?.trim())

  // For TTS mode, duration is auto (based on text length)
  const showDuration = mode !== 'tts'

  const handleGenerate = useCallback(() => {
    onGenerate?.({
      mode,
      prompt,
      modelId,
      duration: mode === 'tts' ? 'auto' : duration,
      textContent: mode === 'tts' ? upstream?.textContent : undefined,
      referenceAudioSrc:
        mode === 'tts' ? upstream?.referenceAudioSrc : undefined,
      generateMode,
    })
  }, [mode, prompt, modelId, duration, upstream, onGenerate, generateMode])

  const durationLabel = useMemo(() => {
    if (duration === 'auto') return t('audioPanel.durationAuto')
    return `${duration}s`
  }, [duration, t])

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-3 rounded-lg border border-border/60 bg-card p-3',
        readonly && 'opacity-80',
        className,
      )}
    >
      {/* ---- Readonly Banner ---- */}
      {readonly ? (
        <div className="flex items-center gap-1.5 rounded-md bg-foreground/5 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Lock size={12} />
          <span>{t('audioPanel.parametersLocked', { defaultValue: 'Parameters locked' })}</span>
        </div>
      ) : null}
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
          {/* Enhance Prompt Button (placeholder) */}
          <button
            type="button"
            className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
            title={t('audioPanel.enhancePrompt')}
          >
            <Wand2 size={13} />
          </button>
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

        {/* Translate (placeholder) */}
        <button
          type="button"
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('audioPanel.translate')}
        </button>

        {/* Credits (placeholder) */}
        <span className="text-[11px] text-muted-foreground">
          {t('audioPanel.credits')}
        </span>

        {/* Generate Button */}
        {readonly ? null : (
          <div className="relative flex items-center">
            {/* Main generate button */}
            <button
              type="button"
              disabled={generating}
              className={cn(
                'flex items-center gap-1.5 rounded-l-full px-3 py-1.5 text-xs font-medium',
                'bg-foreground text-background transition-colors duration-150',
                'hover:bg-foreground/90 disabled:opacity-50',
              )}
              onClick={handleGenerate}
            >
              <Send size={12} />
              <span>{generating ? t('audioPanel.generating') : t('audioPanel.generate')}</span>
            </button>
            {/* Dropdown trigger */}
            <button
              type="button"
              disabled={generating}
              className={cn(
                'flex h-full items-center rounded-r-full border-l border-white/20 px-1.5 py-1.5',
                'bg-foreground text-background transition-colors duration-150',
                'hover:bg-foreground/90 disabled:opacity-50',
              )}
              onClick={() => setShowGenerateDropdown(!showGenerateDropdown)}
            >
              <ChevronDown size={10} />
            </button>
            {/* Dropdown menu */}
            {showGenerateDropdown ? (
              <div className="absolute bottom-full right-0 mb-1 flex min-w-[140px] flex-col rounded-md border border-border bg-card py-0.5 shadow-md">
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors duration-150 hover:bg-foreground/5',
                    generateMode === 'stack' ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                  onClick={() => { setGenerateMode('stack'); setShowGenerateDropdown(false) }}
                >
                  <Layers size={12} />
                  {t('audioPanel.stackMode')}
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors duration-150 hover:bg-foreground/5',
                    generateMode === 'overwrite' ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                  onClick={() => { setGenerateMode('overwrite'); setShowGenerateDropdown(false) }}
                >
                  <Replace size={12} />
                  {t('audioPanel.overwriteMode')}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
