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
import type { VariantFormProps } from '../types'
import { BOARD_GENERATE_INPUT } from '../../../ui/board-style-system'
import { IMAGE_GENERATE_ASPECT_RATIO_OPTIONS } from '../../../nodes/node-config'
import { PillSelect, UpstreamTextBadge } from '../shared'

/**
 * Variant form for img-gen-kling (可灵文生图).
 *
 * Inputs: prompt, negativePrompt
 * Params: count (1), aspectRatio (1:1)
 */
export function ImgGenKlingVariant({
  variant,
  upstream,
  disabled,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(upstream.textContent ?? '')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('auto')
  const [showNegative, setShowNegative] = useState(false)

  // Report warning when prompt is empty (required for Kling text-to-image).
  useEffect(() => {
    onWarningChange?.(!prompt.trim()
      ? t('v3.warnings.promptRequired', { defaultValue: 'Please enter a prompt' })
      : null)
  }, [prompt, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        prompt,
        ...(negativePrompt ? { negativePrompt } : {}),
      },
      params: {
        aspectRatio,
      },
      count: 1,
    })
  }, [prompt, negativePrompt, aspectRatio, onParamsChange])

  useEffect(() => { sync() }, [sync])

  return (
    <div className="flex flex-col gap-2">
      {/* ── Prompt ── */}
      <div className="flex flex-col gap-1">
        {upstream.textContent ? <UpstreamTextBadge text={upstream.textContent} /> : null}
        <textarea
          className={[
            'min-h-[68px] w-full resize-none rounded-3xl border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
            disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          placeholder={t('v3.params.prompt', { defaultValue: 'Describe the image you want...' })}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={disabled}
        />
      </div>

      {/* ── Parameter row ── */}
      <div className="flex items-center gap-1.5">
        <PillSelect
          options={IMAGE_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) => ({
            value: ratio,
            label: ratio === 'auto' ? t('v3.params.ratioAuto', { defaultValue: 'Auto' }) : ratio,
          }))}
          value={aspectRatio}
          onChange={setAspectRatio}
          disabled={disabled}
        />

        <div className="flex-1" />

        {/* Negative prompt toggle */}
        <button
          type="button"
          disabled={disabled}
          className={[
            'h-7 rounded-3xl px-2 text-[11px] transition-colors duration-150',
            showNegative
              ? 'bg-foreground/10 text-foreground'
              : 'text-muted-foreground hover:bg-foreground/5',
            disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          onClick={() => setShowNegative(!showNegative)}
        >
          {t('v3.params.negativePrompt', { defaultValue: 'Negative' })}
        </button>
      </div>

      {/* ── Negative prompt (collapsible) ── */}
      {showNegative ? (
        <textarea
          className={[
            'min-h-[40px] w-full resize-none rounded-3xl border px-3 py-2 text-xs leading-relaxed',
            BOARD_GENERATE_INPUT,
            disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          placeholder={t('v3.params.negativePromptPlaceholder', { defaultValue: 'Things to avoid in the image...' })}
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          rows={2}
          disabled={disabled}
        />
      ) : null}

      {/* ── Pro badge hint ── */}
      {variant.minMembershipLevel !== 'free' ? (
        <p className="text-[10px] text-muted-foreground/60">
          {t('v3.params.proRequired', { defaultValue: 'This variant requires a Pro membership or above' })}
        </p>
      ) : null}
    </div>
  )
}
