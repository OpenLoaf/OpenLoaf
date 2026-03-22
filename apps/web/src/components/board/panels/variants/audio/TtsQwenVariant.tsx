/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@udecode/cn'
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Music,
} from 'lucide-react'
import {
  BOARD_GENERATE_INPUT,
} from '../../../ui/board-style-system'
import type { VariantFormProps } from '../../variants/types'
import { PillSelect } from '../shared'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VOICE_OPTIONS = [
  { id: 'auto', labelKey: 'v3.params.voiceAuto' },
  { id: 'longshu', labelKey: 'v3.params.voices.longshu' },
  { id: 'longxiaochun', labelKey: 'v3.params.voices.longxiaochun' },
  { id: 'longxiaoxia', labelKey: 'v3.params.voices.longxiaoxia' },
  { id: 'longlaotie', labelKey: 'v3.params.voices.longlaotie' },
  { id: 'longyue', labelKey: 'v3.params.voices.longyue' },
  { id: 'longcheng', labelKey: 'v3.params.voices.longcheng' },
  { id: 'longjielidou', labelKey: 'v3.params.voices.longjielidou' },
  { id: 'longtong', labelKey: 'v3.params.voices.longtong' },
] as const

const FORMAT_OPTIONS = ['mp3', 'wav', 'opus'] as const

const SPEECH_RATE_MIN = 0.5
const SPEECH_RATE_MAX = 2.0
const SPEECH_RATE_STEP = 0.1
const SPEECH_RATE_DEFAULT = 1.0

const PITCH_RATE_MIN = 0.5
const PITCH_RATE_MAX = 2.0
const PITCH_RATE_STEP = 0.1
const PITCH_RATE_DEFAULT = 1.0

const VOLUME_MIN = 0
const VOLUME_MAX = 100
const VOLUME_STEP = 1
const VOLUME_DEFAULT = 50

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** TTS variant form for CosyVoice (OL-TT-001). */
export function TtsQwenVariant({
  upstream,
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  // State
  const [text, setText] = useState(upstream.textContent ?? '')
  const [isTextFromUpstream, setIsTextFromUpstream] = useState(
    Boolean(upstream.textContent),
  )
  const [voiceId, setVoiceId] = useState('auto')
  const [format, setFormat] = useState<'mp3' | 'wav' | 'opus'>('mp3')
  const [speechRate, setSpeechRate] = useState(SPEECH_RATE_DEFAULT)
  const [pitchRate, setPitchRate] = useState(PITCH_RATE_DEFAULT)
  const [volume, setVolume] = useState(VOLUME_DEFAULT)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const hasUpstreamAudio = Boolean(upstream.audioUrl?.trim())

  // Sync upstream text when it changes externally
  useEffect(() => {
    if (upstream.textContent && !text) {
      setText(upstream.textContent)
      setIsTextFromUpstream(true)
    }
  }, [upstream.textContent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Report warning when text is empty (required for TTS).
  useEffect(() => {
    onWarningChange?.(!text.trim()
      ? t('v3.warnings.textRequired', { defaultValue: 'Please enter text to speak' })
      : null)
  }, [text, onWarningChange, t])

  // Emit params on any change
  const emitParams = useCallback(() => {
    onParamsChange({
      inputs: { text },
      params: {
        ...(voiceId !== 'auto' ? { voice: voiceId } : {}),
        ...(format !== 'mp3' ? { format } : {}),
        ...(speechRate !== SPEECH_RATE_DEFAULT ? { speechRate } : {}),
        ...(pitchRate !== PITCH_RATE_DEFAULT ? { pitchRate } : {}),
        ...(volume !== VOLUME_DEFAULT ? { volume } : {}),
      },
    })
  }, [text, voiceId, format, speechRate, pitchRate, volume, onParamsChange])

  useEffect(() => {
    emitParams()
  }, [emitParams])

  return (
    <div className="flex flex-col gap-2">
      {/* ---- Text Input ---- */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          {t('v3.params.text')}
        </label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setIsTextFromUpstream(false)
          }}
          readOnly={disabled}
          placeholder={t('v3.params.textPlaceholder')}
          rows={4}
          className={cn(
            'w-full resize-none rounded-3xl border px-2.5 py-2 text-xs',
            BOARD_GENERATE_INPUT,
            disabled && 'cursor-not-allowed opacity-60',
          )}
        />
        {isTextFromUpstream && upstream.textContent ? (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Link2 size={10} className="text-ol-blue" />
            <span>
              {t('v3.params.textAutoFilled', {
                count: upstream.textContent.length,
              })}
            </span>
          </div>
        ) : null}
      </div>

      {/* ---- Voice Selector ---- */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          {t('v3.params.voice')}
        </label>
        <PillSelect
          options={VOICE_OPTIONS.map((v) => ({
            value: v.id,
            label: t(v.labelKey, { defaultValue: v.id === 'auto' ? 'Auto' : v.id }),
          }))}
          value={voiceId}
          onChange={setVoiceId}
          disabled={disabled}
          fullWidth
        />
      </div>

      {/* ---- Reference Audio Display ---- */}
      {hasUpstreamAudio ? (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            {t('v3.params.referenceAudio')}
          </label>
          <div className="flex items-center gap-2 rounded-3xl border border-border/40 bg-ol-surface-muted px-2.5 py-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ol-amber-bg text-ol-amber">
              <Music size={12} />
            </div>
            <span className="truncate text-xs text-foreground">
              {t('v3.params.referenceAudioConnected')}
            </span>
            <Link2
              size={12}
              className="ml-auto flex-shrink-0 text-ol-blue"
            />
          </div>
        </div>
      ) : null}

      {/* ---- Advanced Settings ---- */}
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'flex items-center gap-1 text-[11px] text-muted-foreground transition-colors duration-150',
          !disabled && 'hover:text-foreground',
        )}
        onClick={() => !disabled && setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? (
          <ChevronDown size={12} />
        ) : (
          <ChevronRight size={12} />
        )}
        <span>{t('v3.params.advancedSettings')}</span>
      </button>

      {showAdvanced ? (
        <div className="flex flex-col gap-2.5 rounded-3xl border border-border bg-ol-surface-muted/50 p-3 text-xs">
          {/* Format */}
          <div className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">
              {t('v3.params.format')}
            </span>
            <PillSelect
              options={FORMAT_OPTIONS.map((f) => ({
                value: f,
                label: f.toUpperCase(),
              }))}
              value={format}
              onChange={(v) => setFormat(v as 'mp3' | 'wav' | 'opus')}
              disabled={disabled}
            />
          </div>

          {/* Speech Rate */}
          <div className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">
              {t('v3.params.speechRate')}
            </span>
            <input
              type="range"
              min={SPEECH_RATE_MIN}
              max={SPEECH_RATE_MAX}
              step={SPEECH_RATE_STEP}
              value={speechRate}
              onChange={(e) => setSpeechRate(Number(e.target.value))}
              disabled={disabled}
              className="h-1 flex-1 appearance-none rounded-full bg-border accent-foreground"
            />
            <span className="w-8 text-right text-[10px] text-muted-foreground">
              {speechRate.toFixed(1)}
            </span>
          </div>

          {/* Pitch Rate */}
          <div className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">
              {t('v3.params.pitchRate')}
            </span>
            <input
              type="range"
              min={PITCH_RATE_MIN}
              max={PITCH_RATE_MAX}
              step={PITCH_RATE_STEP}
              value={pitchRate}
              onChange={(e) => setPitchRate(Number(e.target.value))}
              disabled={disabled}
              className="h-1 flex-1 appearance-none rounded-full bg-border accent-foreground"
            />
            <span className="w-8 text-right text-[10px] text-muted-foreground">
              {pitchRate.toFixed(1)}
            </span>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">
              {t('v3.params.volume')}
            </span>
            <input
              type="range"
              min={VOLUME_MIN}
              max={VOLUME_MAX}
              step={VOLUME_STEP}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              disabled={disabled}
              className="h-1 flex-1 appearance-none rounded-full bg-border accent-foreground"
            />
            <span className="w-8 text-right text-[10px] text-muted-foreground">
              {volume}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
