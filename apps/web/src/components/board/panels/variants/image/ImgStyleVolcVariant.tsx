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
import { Paintbrush } from 'lucide-react'
import type { VariantFormProps } from '../types'
import { BOARD_GENERATE_INPUT } from '../../../ui/board-style-system'
import { IMAGE_GENERATE_ASPECT_RATIO_OPTIONS } from '../../../nodes/node-config'
import { MediaSlot, PillSelect, UpstreamTextBadge, toMediaInput, useSourceImage } from '../shared'

const QUALITY_OPTIONS = ['standard', 'hd'] as const
type Quality = (typeof QUALITY_OPTIONS)[number]

/**
 * Variant form for OL-ST-001 (风格迁移).
 *
 * Inputs: image ({url} - style source)
 * Params: prompt, aspectRatio, quality
 *
 * When `resolvedSlots` is provided (InputSlotBar mode), the variant reads
 * the `style` slot from the framework instead of self-managing uploads.
 */
export function ImgStyleVolcVariant({
  variant,
  upstream,
  nodeResourceUrl,
  nodeResourcePath,
  disabled,
  initialParams,
  onParamsChange,
  onWarningChange,
  resolvedSlots,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(initialParams?.inputs?.prompt as string ?? '')
  const [aspectRatio, setAspectRatio] = useState(initialParams?.params?.aspectRatio as string ?? 'auto')
  const [quality, setQuality] = useState<Quality>(initialParams?.params?.quality as Quality ?? 'standard')

  // Self-managed: fallback source image (used when resolvedSlots is undefined)
  const { sourceUrl: styleSourceUrl, sourcePath: styleSourcePath, rawSourceUrl: rawStyleSourceUrl, setImgLoadFailed } = useSourceImage(nodeResourceUrl, nodeResourcePath, upstream)
  const [manualStyleSrc, setManualStyleSrc] = useState<string | undefined>()
  const fallbackStyleUrl = styleSourceUrl ?? manualStyleSrc
  const fallbackStylePath = styleSourcePath ?? manualStyleSrc

  // Resolve style source based on mode
  let effectiveStyleUrl: string | undefined
  let effectiveStylePath: string | undefined

  if (resolvedSlots) {
    // Framework mode: read from resolvedSlots['style']
    const styleRef = (resolvedSlots['style'] ?? [])[0]
    effectiveStyleUrl = styleRef?.url
    effectiveStylePath = styleRef?.path ?? styleRef?.url
  } else {
    // Fallback: self-managed (node resource + manual upload)
    effectiveStyleUrl = fallbackStyleUrl
    effectiveStylePath = fallbackStylePath
  }

  // Report blocking warning to parent
  useEffect(() => {
    onWarningChange?.(!effectiveStyleUrl ? t('v3.params.needsStyleImage', { defaultValue: 'A source image is required for style transfer' }) : null)
  }, [effectiveStyleUrl, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        ...(effectiveStylePath ? { image: toMediaInput(effectiveStylePath) } : {}),
      },
      params: {
        prompt,
        aspectRatio,
        quality,
      },
    })
  }, [prompt, aspectRatio, quality, effectiveStylePath, onParamsChange])

  useEffect(() => { sync() }, [sync])

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden probe to detect broken source URLs (fallback mode only) */}
      {!resolvedSlots && rawStyleSourceUrl ? (
        <img
          src={rawStyleSourceUrl}
          alt=""
          className="hidden"
          onError={() => setImgLoadFailed(true)}
        />
      ) : null}

      {/* ── Style source slot — only rendered in fallback mode ── */}
      {!resolvedSlots ? (
        <div className="flex items-end gap-2">
          <MediaSlot
            label={t('v3.params.styleSource', { defaultValue: 'Style Source' })}
            icon={<Paintbrush size={16} />}
            src={effectiveStyleUrl}
            required
            disabled={disabled}
            boardId={upstream.boardId}
            projectId={upstream.projectId}
            boardFolderUri={upstream.boardFolderUri}
            onUpload={!styleSourceUrl ? (value) => setManualStyleSrc(value) : undefined}
            onRemove={manualStyleSrc ? () => setManualStyleSrc(undefined) : undefined}
          />
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
          placeholder={t('v3.params.stylePromptPlaceholder', { defaultValue: 'Describe the content to generate in this style...' })}
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
      </div>
    </div>
  )
}
