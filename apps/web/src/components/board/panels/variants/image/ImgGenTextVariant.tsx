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
import { PillSelect, UpstreamTextBadge, toMediaInput } from '../shared'

const QUALITY_OPTIONS = ['standard', 'hd'] as const
type Quality = (typeof QUALITY_OPTIONS)[number]

const COUNT_OPTIONS = [1, 2, 4] as const

/** Per-variant field visibility config. */
const FIELD_CONFIG: Record<string, { showNegative: boolean; showCount: boolean }> = {
  'OL-IG-001': { showNegative: true, showCount: true },
  'OL-IG-002': { showNegative: false, showCount: false },
  'OL-IG-003': { showNegative: true, showCount: false },
  'OL-IG-004': { showNegative: true, showCount: false },
}
const DEFAULT_CONFIG = { showNegative: false, showCount: false }

/**
 * Parameterized variant form for text-to-image variants OL-IG-001/002/003/004.
 *
 * Inputs: prompt, image (from node resource when available on canvas)
 * Params: negativePrompt (when showNegative), aspectRatio, quality, count (when showCount)
 */
export function ImgGenTextVariant({
  variant,
  upstream,
  nodeResourcePath,
  disabled,
  initialParams,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const config = FIELD_CONFIG[variant.id] ?? DEFAULT_CONFIG

  const [prompt, setPrompt] = useState(initialParams?.inputs?.prompt as string ?? '')
  const [negativePrompt, setNegativePrompt] = useState(initialParams?.params?.negativePrompt as string ?? '')
  const [aspectRatio, setAspectRatio] = useState(initialParams?.params?.aspectRatio as string ?? 'auto')
  const [quality, setQuality] = useState<Quality>(initialParams?.params?.quality as Quality ?? 'standard')
  const [count, setCount] = useState(initialParams?.count ?? 1)
  const [promptExtend, setPromptExtend] = useState(initialParams?.params?.promptExtend as boolean ?? true)
  const [showNegative, setShowNegative] = useState(false)

  // Report warning when prompt is empty (required for text-to-image).
  useEffect(() => {
    const hasPrompt = prompt.trim() || upstream.textContent?.trim()
    onWarningChange?.(!hasPrompt
      ? t('v3.warnings.promptRequired', { defaultValue: 'Please enter a prompt' })
      : null)
  }, [prompt, upstream.textContent, onWarningChange, t])

  // Upstream image (if connected via edge). nodeResourcePath is always empty
  // because this variant is only applicable when !nodeHasImage.
  const nodeImage = upstream.imagePaths?.[0] ?? upstream.images?.[0]

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        prompt,
        ...(nodeImage ? { image: toMediaInput(nodeImage) } : {}),
      },
      params: {
        ...(config.showNegative && negativePrompt ? { negativePrompt } : {}),
        aspectRatio,
        quality,
        promptExtend,
      },
      ...(config.showCount ? { count } : {}),
    })
  }, [prompt, negativePrompt, aspectRatio, quality, count, promptExtend, config, nodeImage, onParamsChange])

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
        <PillSelect
          options={QUALITY_OPTIONS.map((q) => ({
            value: q,
            label: t(`v3.params.quality_${q}`, { defaultValue: q === 'hd' ? 'HD' : 'Standard' }),
          }))}
          value={quality}
          onChange={(v) => setQuality(v as Quality)}
          disabled={disabled}
        />

        <div className="flex-1" />

        {/* Prompt extend toggle */}
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={promptExtend}
            onChange={(e) => setPromptExtend(e.target.checked)}
            disabled={disabled}
            className="accent-foreground"
          />
          {t('v3.params.promptExtend', { defaultValue: '智能改写' })}
        </label>

        {/* Negative prompt toggle */}
        {config.showNegative ? (
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
        ) : null}

        {/* Count */}
        {config.showCount ? (
          <PillSelect
            options={COUNT_OPTIONS.map((n) => ({
              value: String(n),
              label: `×${n}`,
            }))}
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            disabled={disabled}
          />
        ) : null}
      </div>

      {/* ── Negative prompt (collapsible) ── */}
      {config.showNegative && showNegative ? (
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
    </div>
  )
}
