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
  Link2,
  Mic,
  Music,
  Settings,
  Volume2,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@udecode/cn'
import {
  BOARD_GENERATE_INPUT,
} from '../ui/board-style-system'
import { GenerateActionBar } from './GenerateActionBar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Audio generation mode. */
export type AudioGenerateMode = 'tts' | 'music' | 'sfx'

/** Duration option in seconds (kept for backward compat). */
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

/** Audio generate params type (SDK v2 TTS). */
export type AudioGenerateParams = {
  feature: 'tts'
  /** Text to synthesize. */
  text: string
  /** Voice preset ID. */
  voice?: string
  /** Reference audio for voice cloning. */
  referenceAudioSrc?: string
  /** Output format. */
  format?: 'mp3' | 'wav' | 'opus'
  /** Sample rate. */
  sampleRate?: number
  /** Quality. */
  quality?: 'draft' | 'standard' | 'hd'
  /** Seed. */
  seed?: number
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
  const [text, setText] = useState(upstream?.textContent ?? '')
  const [voiceId, setVoiceId] = useState('auto')
  const [quality, setQuality] = useState<'draft' | 'standard' | 'hd'>('standard')
  const [seed, setSeed] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [outputFormat, setOutputFormat] = useState<'mp3' | 'wav' | 'opus'>('mp3')
  const [isTextFromUpstream, setIsTextFromUpstream] = useState(Boolean(upstream?.textContent))

  const hasUpstreamAudio = Boolean(upstream?.referenceAudioSrc?.trim())

  const buildParams = useCallback((): AudioGenerateParams => ({
    feature: 'tts',
    text: text || upstream?.textContent || '',
    voice: voiceId !== 'auto' ? voiceId : undefined,
    referenceAudioSrc: upstream?.referenceAudioSrc || undefined,
    format: outputFormat !== 'mp3' ? outputFormat : undefined,
    quality: quality !== 'standard' ? quality : undefined,
    seed: seed ? Number(seed) : undefined,
  }), [text, voiceId, upstream, outputFormat, quality, seed])

  const handleGenerate = useCallback(() => {
    onGenerate?.(buildParams())
  }, [onGenerate, buildParams])

  const handleGenerateNew = useCallback(() => {
    onGenerateNewNode?.(buildParams())
  }, [onGenerateNewNode, buildParams])

  const textLength = text.length || (upstream?.textContent?.length ?? 0)
  const estimatedCredits = useMemo(() => {
    if (mode !== 'tts' || textLength === 0) return null
    // Rough estimate: ~10 credits per 10k chars, minimum 1
    return Math.max(1, Math.round((textLength / 10000) * 10))
  }, [textLength, mode])

  const isGenerateDisabled = mode !== 'tts' || !text.trim()

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
            {id !== 'tts' ? (
              <span className="ml-1 rounded bg-muted-foreground/10 px-1 py-px text-[9px] text-muted-foreground/50">
                {t('audioPanel.tabBadgeSoon')}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ---- TTS Content Area ---- */}
      {mode === 'tts' && (
        <div className="flex flex-col gap-2">
          {/* Text to speak */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('audioPanel.tts.textLabel')}
            </label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setIsTextFromUpstream(false)
              }}
              readOnly={readonly}
              placeholder={t('audioPanel.tts.textPlaceholder')}
              rows={4}
              className={cn(
                'w-full resize-none rounded-md border px-2.5 py-2 text-xs',
                BOARD_GENERATE_INPUT,
                readonly && 'cursor-not-allowed opacity-60',
              )}
            />
            {isTextFromUpstream && upstream?.textContent ? (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Link2 size={10} className="text-ol-blue" />
                <span>{t('audioPanel.tts.textAutoFilled', { count: upstream.textContent.length })}</span>
              </div>
            ) : null}
          </div>

          {/* Voice selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('audioPanel.tts.voiceLabel')}
            </label>
            <select
              className="h-7 w-full rounded-md border border-border bg-transparent px-1.5 text-[11px] text-foreground outline-none"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              disabled={readonly}
            >
              <option value="auto">{t('audioPanel.tts.voiceAuto')}</option>
            </select>
          </div>

          {/* Reference voice (clone) */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('audioPanel.tts.referenceLabel')}
            </label>
            {hasUpstreamAudio ? (
              <div className="flex items-center gap-2 rounded-md border border-border/40 bg-ol-surface-muted px-2.5 py-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ol-amber-bg text-ol-amber">
                  <Music size={12} />
                </div>
                <span className="truncate text-xs text-foreground">
                  {upstream!.referenceAudioName || 'audio'}
                </span>
                <Link2 size={12} className="ml-auto flex-shrink-0 text-ol-blue" />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border/40 bg-ol-surface-muted px-2.5 py-2.5 text-[11px] text-muted-foreground">
                <Mic size={13} />
                <span>{t('audioPanel.tts.referenceConnectHint')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Music / SFX Coming Soon ---- */}
      {(mode === 'music' || mode === 'sfx') && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border/40 bg-ol-surface-muted/50 px-4 py-8">
          {mode === 'music' ? <Music size={24} className="text-muted-foreground/40" /> : <Volume2 size={24} className="text-muted-foreground/40" />}
          <span className="text-sm font-medium text-muted-foreground/60">
            {t(`audioPanel.comingSoon.${mode}.title`)}
          </span>
          <span className="text-[11px] text-muted-foreground/40">
            {t(`audioPanel.comingSoon.${mode}.description`)}
          </span>
        </div>
      )}

      {/* ---- Advanced Settings ---- */}
      {showAdvanced && mode === 'tts' ? (
        <div className="rounded-lg border border-border bg-ol-surface-muted/50 p-3 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-16 text-muted-foreground">{t('audioPanel.advanced.outputFormat')}</span>
            <select className="h-6 flex-1 rounded border border-border bg-transparent px-1 text-[11px]" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as 'mp3' | 'wav' | 'opus')}>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="opus">Opus</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-muted-foreground">{t('audioPanel.advanced.quality')}</span>
            <select className="h-6 flex-1 rounded border border-border bg-transparent px-1 text-[11px]" value={quality} onChange={(e) => setQuality(e.target.value as 'draft' | 'standard' | 'hd')}>
              <option value="draft">{t('audioPanel.advanced.qualityDraft')}</option>
              <option value="standard">{t('audioPanel.advanced.qualityStandard')}</option>
              <option value="hd">{t('audioPanel.advanced.qualityHd')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-muted-foreground">{t('audioPanel.advanced.seed')}</span>
            <input type="text" className="h-6 flex-1 rounded border border-border bg-transparent px-1 text-[11px]" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={t('audioPanel.advanced.seedPlaceholder')} />
          </div>
        </div>
      ) : null}

      {/* ---- Bottom Bar ---- */}
      <div className="flex items-center gap-2">
        {mode === 'tts' ? (
          <>
            <button
              type="button"
              disabled={readonly}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/8 transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Settings size={14} />
            </button>
            <div className="flex-1" />
            <div className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={t('audioPanel.estimatedCredits')}>
              <Zap size={12} />
              <span>{estimatedCredits != null ? `\u2248${estimatedCredits}` : '--'}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* ---- Generate Action Bar ---- */}
      {mode === 'tts' ? (
        <GenerateActionBar
          hasResource={hasResource}
          generating={generating}
          disabled={isGenerateDisabled}
          buttonClassName="bg-foreground text-background hover:bg-foreground/90"
          onGenerate={handleGenerate}
          onGenerateNewNode={handleGenerateNew}
          readonly={readonly}
          editing={editing}
          onUnlock={onUnlock}
        />
      ) : null}
    </div>
  )
}
