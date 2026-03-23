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
  { id: 'Cherry', labelKey: 'v3.params.qwen3Voices.Cherry' },
  { id: 'Serena', labelKey: 'v3.params.qwen3Voices.Serena' },
  { id: 'Ethan', labelKey: 'v3.params.qwen3Voices.Ethan' },
  { id: 'Chelsie', labelKey: 'v3.params.qwen3Voices.Chelsie' },
  { id: 'Momo', labelKey: 'v3.params.qwen3Voices.Momo' },
  { id: 'Vivian', labelKey: 'v3.params.qwen3Voices.Vivian' },
  { id: 'Moon', labelKey: 'v3.params.qwen3Voices.Moon' },
  { id: 'Maia', labelKey: 'v3.params.qwen3Voices.Maia' },
  { id: 'Kai', labelKey: 'v3.params.qwen3Voices.Kai' },
  { id: 'Nofish', labelKey: 'v3.params.qwen3Voices.Nofish' },
] as const

const LANGUAGE_OPTIONS = [
  { id: '', labelKey: 'v3.params.languageTypeAuto' },
  { id: 'Chinese', labelKey: 'v3.params.languageTypes.Chinese' },
  { id: 'English', labelKey: 'v3.params.languageTypes.English' },
  { id: 'Spanish', labelKey: 'v3.params.languageTypes.Spanish' },
  { id: 'Russian', labelKey: 'v3.params.languageTypes.Russian' },
  { id: 'Italian', labelKey: 'v3.params.languageTypes.Italian' },
  { id: 'French', labelKey: 'v3.params.languageTypes.French' },
  { id: 'Korean', labelKey: 'v3.params.languageTypes.Korean' },
  { id: 'Japanese', labelKey: 'v3.params.languageTypes.Japanese' },
  { id: 'German', labelKey: 'v3.params.languageTypes.German' },
  { id: 'Portuguese', labelKey: 'v3.params.languageTypes.Portuguese' },
] as const

const DEFAULT_VOICE = 'Cherry'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** TTS variant form for Qwen3 TTS (OL-TT-002). */
export function TtsQwen3Variant({
  upstream,
  initialParams,
  disabled = false,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  // State — priority: cached (initialParams) > upstream defaults > hardcoded defaults
  const [text, setText] = useState(
    (initialParams?.inputs?.text as string) ?? upstream.textContent ?? '',
  )
  const [isTextFromUpstream, setIsTextFromUpstream] = useState(
    !initialParams?.inputs?.text && Boolean(upstream.textContent),
  )
  const [voiceId, setVoiceId] = useState(
    (initialParams?.params?.voice as string) ?? DEFAULT_VOICE,
  )
  const [languageType, setLanguageType] = useState(
    (initialParams?.params?.languageType as string) ?? '',
  )
  const [instruction, setInstruction] = useState(
    (initialParams?.params?.instruction as string) ?? '',
  )
  const [showAdvanced, setShowAdvanced] = useState(false)

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
        ...(voiceId !== DEFAULT_VOICE ? { voice: voiceId } : {}),
        ...(languageType ? { languageType } : {}),
        ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
      },
    })
  }, [text, voiceId, languageType, instruction, onParamsChange])

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
            label: t(v.labelKey, { defaultValue: v.id }),
          }))}
          value={voiceId}
          onChange={setVoiceId}
          disabled={disabled}
          fullWidth
        />
      </div>

      {/* ---- Language Type Selector ---- */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          {t('v3.params.languageType')}
        </label>
        <PillSelect
          options={LANGUAGE_OPTIONS.map((l) => ({
            value: l.id,
            label: t(l.labelKey, { defaultValue: l.id || t('v3.params.languageTypeAuto', { defaultValue: 'Auto' }) }),
          }))}
          value={languageType}
          onChange={setLanguageType}
          disabled={disabled}
          fullWidth
        />
      </div>

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
          {/* Instructions */}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              {t('v3.params.instructions')}
            </span>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              readOnly={disabled}
              placeholder={t('v3.params.instructionsPlaceholder')}
              rows={3}
              className={cn(
                'w-full resize-none rounded-3xl border px-2.5 py-2 text-xs',
                BOARD_GENERATE_INPUT,
                disabled && 'cursor-not-allowed opacity-60',
              )}
            />
            <span className="text-[10px] text-muted-foreground">
              {t('v3.params.instructionsHint')}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
