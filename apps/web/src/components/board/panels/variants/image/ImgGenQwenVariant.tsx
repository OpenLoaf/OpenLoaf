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
import { ImageIcon } from 'lucide-react'
import type { VariantFormProps } from '../types'
import { BOARD_GENERATE_INPUT } from '../../../ui/board-style-system'
import { IMAGE_GENERATE_ASPECT_RATIO_OPTIONS } from '../../../nodes/node-config'
import { MediaSlot, PillSelect, UpstreamTextBadge } from '../shared'

const QUALITY_OPTIONS = ['standard', 'hd'] as const
type Quality = (typeof QUALITY_OPTIONS)[number]

const COUNT_OPTIONS = [1, 2, 4] as const

/** Max total reference images (upstream + manual). */
const MAX_REF_IMAGES = 10

/**
 * Variant form for img-gen-qwen (百炼文生图).
 *
 * Inputs: prompt, images (reference), mask
 * Params: negativePrompt, style, aspectRatio, quality, count, upstreamModelId
 */
export function ImgGenQwenVariant({
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
  const [quality, setQuality] = useState<Quality>('standard')
  const [count, setCount] = useState(1)
  const [showNegative, setShowNegative] = useState(false)

  // Manual upload images managed locally by the variant
  const [manualImages, setManualImages] = useState<string[]>([])

  // Combine upstream + manual images
  const allImages = [...(upstream.images ?? []), ...manualImages]

  // Report warning when prompt is empty (required for Qwen text-to-image).
  useEffect(() => {
    onWarningChange?.(!prompt.trim()
      ? t('v3.warnings.promptRequired', { defaultValue: 'Please enter a prompt' })
      : null)
  }, [prompt, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        prompt,
        ...(allImages.length
          ? { images: allImages.map(url => ({ url })) }
          : {}),
      },
      params: {
        ...(negativePrompt ? { negativePrompt } : {}),
        aspectRatio,
        quality,
      },
      count,
    })
  }, [prompt, negativePrompt, aspectRatio, quality, count, allImages.length, onParamsChange]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sync() }, [sync])

  return (
    <div className="flex flex-col gap-2">
      {/* ── Reference image slots ── */}
      <div className="flex flex-wrap items-end gap-2">
        {/* Upstream images (read-only) */}
        {(upstream.images ?? []).map((src, idx) => (
          <MediaSlot
            key={`up-${idx}`}
            label={t('v3.params.image', { defaultValue: 'Reference' })}
            src={src}
            disabled={disabled}
          />
        ))}
        {/* Manual upload images (removable) */}
        {manualImages.map((src, idx) => (
          <MediaSlot
            key={`man-${idx}`}
            label={t('v3.params.image', { defaultValue: 'Reference' })}
            src={src}
            disabled={disabled}
            onRemove={() =>
              setManualImages(prev => prev.filter((_, i) => i !== idx))
            }
          />
        ))}
        {/* Add slot */}
        {!disabled && allImages.length < MAX_REF_IMAGES ? (
          <MediaSlot
            label={t('v3.common.uploadImage', { defaultValue: 'Upload' })}
            icon={<ImageIcon size={16} />}
            disabled={disabled}
            onUpload={(dataUrl) =>
              setManualImages(prev => [...prev, dataUrl])
            }
          />
        ) : null}
      </div>

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

        {/* Count */}
        <PillSelect
          options={COUNT_OPTIONS.map((n) => ({
            value: String(n),
            label: `${n}x`,
          }))}
          value={String(count)}
          onChange={(v) => setCount(Number(v))}
          disabled={disabled}
        />
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
    </div>
  )
}
