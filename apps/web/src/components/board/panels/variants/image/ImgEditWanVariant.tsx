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
import { MediaSlot, UpstreamTextBadge, toMediaInput } from '../shared'

/** Max images per mode. */
const MAX_NORMAL = 4
const MAX_INTERLEAVE = 1

type Mode = 'normal' | 'interleave'

/**
 * Variant form for wan2.6 image editing (OL-IE-001).
 *
 * Inputs: prompt (required), images (optional, 1-4 normal / max 1 interleave)
 * Params: enable_interleave, negativePrompt (optional)
 */
export function ImgEditWanVariant({
  upstream,
  nodeResourcePath,
  disabled,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(upstream.textContent ?? '')
  const [mode, setMode] = useState<Mode>('normal')
  const [manualImages, setManualImages] = useState<string[]>([])
  const [negativePrompt, setNegativePrompt] = useState('')
  const [showNegative, setShowNegative] = useState(false)

  const maxImages = mode === 'interleave' ? MAX_INTERLEAVE : MAX_NORMAL

  const nodeImage = nodeResourcePath?.trim() || ''

  // Display: resolved URLs (upstream.images) + manual uploads
  const displayImages = [...(upstream.images ?? []), ...manualImages]

  // API: current node image (priority) + upstream paths + manual uploads
  const apiImages = [
    ...(nodeImage ? [nodeImage] : []),
    ...(upstream.imagePaths ?? upstream.images ?? []),
    ...manualImages,
  ].slice(0, maxImages)

  // When mode changes to interleave, trim images to max 1
  useEffect(() => {
    if (mode === 'interleave' && manualImages.length > 1) {
      setManualImages(prev => prev.slice(0, 1))
    }
  }, [mode, manualImages.length])

  // Report warning when prompt is empty
  useEffect(() => {
    onWarningChange?.(
      !prompt.trim()
        ? t('v3.warnings.promptRequired', { defaultValue: '请输入提示词' })
        : null,
    )
  }, [prompt, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        prompt,
        ...(apiImages.length ? { images: apiImages.map(src => toMediaInput(src)) } : {}),
      },
      params: {
        enable_interleave: mode === 'interleave',
        ...(negativePrompt ? { negativePrompt } : {}),
      },
    })
  }, [prompt, mode, negativePrompt, apiImages.length, onParamsChange]) // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* ── Reference image slots ── */}
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
            onRemove={() => setManualImages(prev => prev.filter((_, i) => i !== idx))}
          />
        ))}
        {/* Add slot — only show when under max */}
        {!disabled && displayImages.length < maxImages ? (
          <MediaSlot
            label={t('v3.common.uploadImage', { defaultValue: 'Upload' })}
            icon={<ImageIcon size={16} />}
            disabled={disabled}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            onUpload={(value) => setManualImages(prev => [...prev, value])}
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
