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
import { MediaSlot, UpstreamTextBadge, toMediaInput, useMediaSlots } from '../shared'

/** Max source images for qwen-image-edit-plus. */
const MAX_IMAGES = 3

/**
 * Variant form for qwen-image-edit-plus (OL-IE-001).
 *
 * Inputs: prompt (required), images (1-3, REQUIRED)
 * Note: mask is NOT rendered here — the parent ImageAiPanel injects it
 *       when the variant definition has maskPaint: true.
 *
 * When `resolvedSlots` is provided (InputSlotBar mode), the variant reads
 * slot assignments from the framework instead of self-managing uploads.
 */
export function ImgEditPlusVariant({
  upstream,
  nodeResourcePath,
  disabled,
  initialParams,
  onParamsChange,
  onWarningChange,
  resolvedSlots,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(initialParams?.inputs?.prompt as string ?? '')
  const { manualImages, displayImages, apiImages, addImage, removeImage, canAdd } = useMediaSlots(MAX_IMAGES, nodeResourcePath, upstream)
  const [negativePrompt, setNegativePrompt] = useState(initialParams?.params?.negativePrompt as string ?? '')
  const [showNegative, setShowNegative] = useState(false)

  // Determine if images are available (framework or self-managed)
  const hasImages = resolvedSlots
    ? (resolvedSlots['images'] ?? []).length > 0
    : apiImages.length > 0

  // Report warning when prompt is empty OR when no images provided
  useEffect(() => {
    const hasPrompt = prompt.trim() || upstream.textContent?.trim()
    if (!hasPrompt) {
      onWarningChange?.(
        t('v3.warnings.promptRequired', { defaultValue: '请输入提示词' }),
      )
    } else if (!hasImages) {
      onWarningChange?.(
        t('v3.imageEdit.sourceImageRequired', { defaultValue: '请上传需要编辑的图片' }),
      )
    } else {
      onWarningChange?.(null)
    }
  }, [prompt, upstream.textContent, hasImages, onWarningChange, t])

  const sync = useCallback(() => {
    let imagesForApi: Array<{ url: string } | { path: string }> = []

    if (resolvedSlots) {
      // Framework-managed slots: read from resolvedSlots['images']
      const refs = (resolvedSlots['images'] ?? []).slice(0, MAX_IMAGES)
      imagesForApi = refs.map((ref) =>
        ref.path ? toMediaInput(ref.path) : toMediaInput(ref.url),
      )
    } else {
      // Fallback: self-managed
      imagesForApi = apiImages.map((src) => toMediaInput(src))
    }

    onParamsChange({
      inputs: {
        prompt,
        ...(imagesForApi.length ? { images: imagesForApi } : {}),
        // mask is NOT included — parent panel injects it from MaskPaintOverlay
      },
      params: {
        ...(negativePrompt ? { negativePrompt } : {}),
      },
    })
  }, [prompt, negativePrompt, resolvedSlots, apiImages.length, onParamsChange]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    sync()
  }, [sync])

  return (
    <div className="flex flex-col gap-2">
      {/* ── Source image slots (only rendered in fallback / self-managed mode) ── */}
      {!resolvedSlots ? (
        <div className="flex flex-wrap items-end gap-2">
          {/* Upstream images (read-only) */}
          {(upstream.images ?? []).slice(0, MAX_IMAGES).map((src, idx) => (
            <MediaSlot
              key={`up-${idx}`}
              label={t('v3.params.image', { defaultValue: 'Source' })}
              src={src}
              required={idx === 0}
              disabled={disabled}
              boardId={upstream.boardId}
              projectId={upstream.projectId}
            />
          ))}
          {/* Manual upload images (removable) */}
          {manualImages.map((src, idx) => (
            <MediaSlot
              key={`man-${idx}`}
              label={t('v3.params.image', { defaultValue: 'Source' })}
              src={src}
              disabled={disabled}
              boardId={upstream.boardId}
              projectId={upstream.projectId}
              onRemove={() => removeImage(idx)}
            />
          ))}
          {/* Add slot — only show when under max */}
          {!disabled && canAdd ? (
            <MediaSlot
              label={t('v3.common.uploadImage', { defaultValue: 'Upload' })}
              icon={<ImageIcon size={16} />}
              required={displayImages.length === 0}
              disabled={disabled}
              boardId={upstream.boardId}
              projectId={upstream.projectId}
              boardFolderUri={upstream.boardFolderUri}
              onUpload={(value) => addImage(value)}
            />
          ) : null}
        </div>
      ) : null}

      {/* ── Inpaint hint ── */}
      {hasImages ? (
        <p className="text-[10px] text-muted-foreground/60">
          {t('v3.imageEdit.editPlusHint', {
            defaultValue: '涂抹需要修改的区域，然后在下方描述修改效果',
          })}
        </p>
      ) : null}

      {/* ── Prompt (edit instructions) ── */}
      <div className="flex flex-col gap-1">
        {upstream.textContent ? <UpstreamTextBadge text={upstream.textContent} /> : null}
        <textarea
          className={[
            'min-h-[68px] w-full resize-none rounded-3xl border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
            disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          placeholder={t('v3.imageEdit.editPromptPlaceholder', {
            defaultValue: '描述你想要的编辑效果...',
          })}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={disabled}
        />
      </div>

      {/* ── Parameter row ── */}
      <div className="flex items-center gap-1.5">
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
          placeholder={t('v3.params.negativePromptPlaceholder', {
            defaultValue: 'Things to avoid in the image...',
          })}
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          rows={2}
          disabled={disabled}
        />
      ) : null}
    </div>
  )
}
