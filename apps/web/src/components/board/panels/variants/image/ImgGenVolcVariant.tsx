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
import {
  MediaSlot,
  PillSelect,
  UpstreamTextBadge,
  toMediaInput,
  useMediaSlots,
} from '../shared'

const QUALITY_OPTIONS = ['standard', 'hd'] as const
type Quality = (typeof QUALITY_OPTIONS)[number]

/** Max reference images for Volc text-to-image. */
const MAX_IMAGES = 4

/** Style presets for OL-IG-005 (v4.0). */
const STYLE_OPTIONS = [
  'auto',
  'general_v2.0',
  'anime_v2.0',
  'realistic_v2.0',
  '3d_animation_v2.0',
] as const
type Style = (typeof STYLE_OPTIONS)[number]

/** Per-variant field visibility config. */
const FIELD_CONFIG: Record<string, { showStyle: boolean }> = {
  'OL-IG-005': { showStyle: true },
  'OL-IG-006': { showStyle: false },
}
const DEFAULT_CONFIG = { showStyle: false }

/**
 * Parameterized variant form for Volcengine (Jimeng) text-to-image variants
 * OL-IG-005 (v4.0) and OL-IG-006 (v3.1).
 *
 * Key difference from ImgGenTextVariant: prompt lives in **params** (not inputs),
 * and optional reference images live in **inputs.images**.
 */
export function ImgGenVolcVariant({
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

  const [prompt, setPrompt] = useState(
    (initialParams?.params?.prompt as string) ?? '',
  )
  const [aspectRatio, setAspectRatio] = useState(
    (initialParams?.params?.aspectRatio as string) ?? 'auto',
  )
  const [quality, setQuality] = useState<Quality>(
    (initialParams?.params?.quality as Quality) ?? 'standard',
  )
  const [style, setStyle] = useState<Style>(
    (initialParams?.params?.style as Style) ?? 'auto',
  )

  // Optional reference images
  const {
    manualImages,
    displayImages,
    apiImages,
    addImage,
    removeImage,
    canAdd,
  } = useMediaSlots(MAX_IMAGES, nodeResourcePath, upstream)

  // Report warning when prompt is empty (required for text-to-image).
  useEffect(() => {
    const hasPrompt = prompt.trim() || upstream.textContent?.trim()
    onWarningChange?.(
      !hasPrompt
        ? t('v3.warnings.promptRequired', {
            defaultValue: 'Please enter a prompt',
          })
        : null,
    )
  }, [prompt, upstream.textContent, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        ...(apiImages.length
          ? { images: apiImages.map((src) => toMediaInput(src)) }
          : {}),
      },
      params: {
        prompt,
        aspectRatio,
        quality,
        ...(config.showStyle && style !== 'auto' ? { style } : {}),
      },
    })
  }, [
    prompt,
    aspectRatio,
    quality,
    style,
    config.showStyle,
    apiImages.length, // eslint-disable-line react-hooks/exhaustive-deps
    onParamsChange,
  ])

  useEffect(() => {
    sync()
  }, [sync])

  return (
    <div className="flex flex-col gap-2">
      {/* -- Reference image slots (optional) -- */}
      <div className="flex flex-wrap items-end gap-2">
        {/* Upstream images (read-only) */}
        {(upstream.images ?? []).slice(0, MAX_IMAGES).map((src, idx) => (
          <MediaSlot
            key={`up-${idx}`}
            label={t('v3.params.image', { defaultValue: 'Reference' })}
            src={src}
            disabled={disabled}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
          />
        ))}
        {/* Manual upload images (removable) */}
        {manualImages.map((src, idx) => (
          <MediaSlot
            key={`man-${idx}`}
            label={t('v3.params.image', { defaultValue: 'Reference' })}
            src={src}
            disabled={disabled}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            onRemove={() => removeImage(idx)}
          />
        ))}
        {/* Add slot */}
        {!disabled && canAdd ? (
          <MediaSlot
            label={t('v3.common.uploadImage', { defaultValue: 'Upload' })}
            icon={<ImageIcon size={16} />}
            disabled={disabled}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            onUpload={(value) => addImage(value)}
          />
        ) : null}
      </div>

      {/* -- Prompt -- */}
      <div className="flex flex-col gap-1">
        {upstream.textContent ? (
          <UpstreamTextBadge text={upstream.textContent} />
        ) : null}
        <textarea
          className={[
            'min-h-[68px] w-full resize-none rounded-3xl border px-3 py-2',
            'text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
            disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          placeholder={t('v3.params.prompt', {
            defaultValue: 'Describe the image you want...',
          })}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={disabled}
        />
      </div>

      {/* -- Parameter row -- */}
      <div className="flex items-center gap-1.5">
        <PillSelect
          options={IMAGE_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) => ({
            value: ratio,
            label:
              ratio === 'auto'
                ? t('v3.params.ratioAuto', { defaultValue: 'Auto' })
                : ratio,
          }))}
          value={aspectRatio}
          onChange={setAspectRatio}
          disabled={disabled}
        />
        <PillSelect
          options={QUALITY_OPTIONS.map((q) => ({
            value: q,
            label: t(`v3.params.quality_${q}`, {
              defaultValue: q === 'hd' ? 'HD' : 'Standard',
            }),
          }))}
          value={quality}
          onChange={(v) => setQuality(v as Quality)}
          disabled={disabled}
        />
        {config.showStyle ? (
          <PillSelect
            options={STYLE_OPTIONS.map((s) => ({
              value: s,
              label:
                s === 'auto'
                  ? t('v3.params.styleAuto', { defaultValue: 'Auto' })
                  : t(`v3.params.style_${s}`, { defaultValue: s }),
            }))}
            value={style}
            onChange={(v) => setStyle(v as Style)}
            disabled={disabled}
          />
        ) : null}
      </div>
    </div>
  )
}
