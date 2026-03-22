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
import { MediaSlot, PillSelect, UpstreamTextBadge, toMediaInput } from '../shared'

const QUALITY_OPTIONS = ['standard', 'hd'] as const
type Quality = (typeof QUALITY_OPTIONS)[number]

/** Max total reference images (upstream + manual). */
const MAX_REF_IMAGES = 10

/**
 * Variant form for image-generate with reference images (OL-IG-005/OL-IG-006).
 *
 * Inputs: images (array of {url})
 * Params: prompt, style, aspectRatio, quality, modelId
 */
export function ImgGenRefVariant({
  variant,
  upstream,
  nodeResourcePath,
  disabled,
  initialParams,
  onParamsChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(initialParams?.inputs?.prompt as string ?? initialParams?.params?.prompt as string ?? '')
  const [aspectRatio, setAspectRatio] = useState(initialParams?.params?.aspectRatio as string ?? 'auto')
  const [quality, setQuality] = useState<Quality>(initialParams?.params?.quality as Quality ?? 'standard')
  const [style, setStyle] = useState(initialParams?.params?.style as string ?? '')

  // Manual upload images managed locally by the variant (board-relative paths or data URLs)
  const [manualImages, setManualImages] = useState<string[]>([])

  const nodeImage = nodeResourcePath?.trim() || ''
  // For display: resolved URLs (upstream.images) + manual images
  const displayImages = [...(upstream.images ?? []), ...manualImages]
  // For API submission: raw paths (当前节点图片优先 + 上游 + 手动上传)
  const apiImages = [
    ...(nodeImage ? [nodeImage] : []),
    ...(upstream.imagePaths ?? upstream.images ?? []),
    ...manualImages,
  ]

  const sync = useCallback(() => {
    const effectivePrompt = [upstream.textContent, prompt].filter(s => s?.trim()).join('\n')
    onParamsChange({
      inputs: {
        prompt: effectivePrompt,
        ...(apiImages.length
          ? { images: apiImages.map(src => toMediaInput(src)) }
          : {}),
      },
      params: {
        ...(style ? { style } : {}),
        aspectRatio,
        quality,
      },
    })
  }, [prompt, upstream.textContent, style, aspectRatio, quality, apiImages.length, onParamsChange]) // eslint-disable-line react-hooks/exhaustive-deps

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
            onRemove={() =>
              setManualImages(prev => prev.filter((_, i) => i !== idx))
            }
          />
        ))}
        {/* Add slot */}
        {!disabled && displayImages.length < MAX_REF_IMAGES ? (
          <MediaSlot
            label={t('v3.common.uploadImage', { defaultValue: 'Upload' })}
            icon={<ImageIcon size={16} />}
            disabled={disabled}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            onUpload={(value) =>
              setManualImages(prev => [...prev, value])
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

        {/* Style */}
        <input
          type="text"
          className={[
            'h-7 w-24 rounded-3xl border border-border bg-transparent px-2 text-[11px] text-foreground outline-none transition-colors duration-150',
            disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-foreground/5',
          ].join(' ')}
          placeholder={t('v3.params.style', { defaultValue: 'Style' })}
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
