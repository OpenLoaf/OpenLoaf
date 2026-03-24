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
import { MediaSlot, PillSelect, UpstreamTextBadge, toMediaInput, useMediaSlots } from '../shared'

/** Max images per mode. */
const MAX_NORMAL = 4
const MAX_INTERLEAVE = 1

type Mode = 'normal' | 'interleave'

/**
 * Variant form for wan2.6 image editing (OL-IE-002).
 *
 * Inputs: prompt (required), images (optional, 1-4 normal / max 1 interleave)
 * Params: enable_interleave, negativePrompt (optional)
 *
 * When `resolvedSlots` is provided (InputSlotBar mode), the variant reads
 * slot assignments from the framework instead of self-managing uploads.
 */
export function ImgEditWanVariant({
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
  const [mode, setMode] = useState<Mode>(initialParams?.params?.enable_interleave ? 'interleave' : 'normal')
  const [size, setSize] = useState<'1K' | '2K'>((initialParams?.params?.size as '1K' | '2K') ?? '1K')
  const [n, setN] = useState<number>((initialParams?.params?.n as number) ?? 4)
  const [promptExtend, setPromptExtend] = useState<boolean>((initialParams?.params?.promptExtend as boolean) ?? true)
  const [negativePrompt, setNegativePrompt] = useState(initialParams?.params?.negativePrompt as string ?? '')
  const [showNegative, setShowNegative] = useState(false)

  const maxImages = mode === 'interleave' ? MAX_INTERLEAVE : MAX_NORMAL
  const { manualImages, displayImages, apiImages, addImage, removeImage, canAdd, trimToMax } = useMediaSlots(maxImages, nodeResourcePath, upstream)

  // When mode changes, trim manual images to new max (self-managed fallback only)
  useEffect(() => {
    if (!resolvedSlots) {
      trimToMax(maxImages)
    }
  }, [maxImages, trimToMax, resolvedSlots])

  // Report warning when prompt is empty
  useEffect(() => {
    const hasPrompt = prompt.trim() || upstream.textContent?.trim()
    onWarningChange?.(
      !hasPrompt
        ? t('v3.warnings.promptRequired', { defaultValue: '请输入提示词' })
        : null,
    )
  }, [prompt, upstream.textContent, onWarningChange, t])

  const sync = useCallback(() => {
    let imagesForApi: Array<{ url: string } | { path: string }> = []

    if (resolvedSlots) {
      // Framework-managed slots: read from resolvedSlots['images']
      const refs = (resolvedSlots['images'] ?? []).slice(0, maxImages)
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
      },
      params: {
        enable_interleave: mode === 'interleave',
        size,
        ...(mode === 'normal' ? { n, promptExtend } : {}),
        ...(negativePrompt ? { negativePrompt } : {}),
      },
    })
  }, [prompt, mode, size, n, promptExtend, negativePrompt, resolvedSlots, maxImages, apiImages.length, onParamsChange]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    sync()
  }, [sync])

  return (
    <div className="flex flex-col gap-2">
      {/* ── Mode toggle ── */}
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-ol-surface-muted/50 p-0.5 self-start">
        {(['normal', 'interleave'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            className={[
              'h-5 rounded-full px-2.5 text-[10px] transition-colors duration-150',
              mode === m
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            ].join(' ')}
            onClick={() => setMode(m)}
          >
            {m === 'normal'
              ? t('v3.imageEdit.normalMode', { defaultValue: '普通模式' })
              : t('v3.imageEdit.interleaveMode', { defaultValue: '图文混排' })}
          </button>
        ))}
      </div>

      {/* ── Reference image slots (only rendered in fallback / self-managed mode) ── */}
      {!resolvedSlots ? (
        <div className="flex flex-wrap items-end gap-2">
          {/* Upstream images (read-only) */}
          {(upstream.images ?? []).slice(0, maxImages).map((src, idx) => (
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
          {/* Add slot — only show when under max */}
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
      ) : null}

      {/* ── Prompt ── */}
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
        <PillSelect
          options={[
            { value: '1K', label: '1K' },
            { value: '2K', label: '2K' },
          ]}
          value={size}
          onChange={(v) => setSize(v as '1K' | '2K')}
          disabled={disabled}
        />
        {mode === 'normal' ? (
          <PillSelect
            options={[1, 2, 4].map((v) => ({ value: String(v), label: `×${v}` }))}
            value={String(n)}
            onChange={(v) => setN(Number(v))}
            disabled={disabled}
          />
        ) : null}
        {mode === 'normal' ? (
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
        ) : null}
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
