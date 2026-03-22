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
import { UpstreamTextBadge, toMediaInput, useSourceImage } from '../shared'

/**
 * Variant form for OL-IP-001 (涂抹修改).
 *
 * Inputs: image ({url}), mask ({url} - white = repair area)
 * Params: prompt
 *
 * Note: The mask painting UI is managed by the parent ImageAiPanel which
 * toggles MaskPaintOverlay on the node. This component only renders the
 * prompt field and displays an info hint about mask painting.
 */
export function ImgInpaintVolcVariant({
  variant,
  upstream,
  nodeResourceUrl,
  nodeResourcePath,
  disabled,
  initialParams,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const [prompt, setPrompt] = useState(initialParams?.inputs?.prompt as string ?? '')

  const { sourceUrl, sourcePath, rawSourceUrl, setImgLoadFailed } = useSourceImage(nodeResourceUrl, nodeResourcePath, upstream)

  // Report blocking warning to parent
  useEffect(() => {
    onWarningChange?.(!sourceUrl ? t('v3.params.needsImage', { defaultValue: 'An image is required for inpainting' }) : null)
  }, [sourceUrl, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        ...(sourcePath ? { image: toMediaInput(sourcePath) } : {}),
        // Mask is injected by the parent panel from MaskPaintOverlay result
      },
      params: {
        ...(prompt?.trim() ? { prompt } : {}),
      },
    })
  }, [prompt, sourcePath, onParamsChange])

  useEffect(() => { sync() }, [sync])

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden probe to detect broken source URLs */}
      {rawSourceUrl ? (
        <img
          src={rawSourceUrl}
          alt=""
          className="hidden"
          onError={() => setImgLoadFailed(true)}
        />
      ) : null}

      {/* ── Info hint ── */}
      {sourceUrl ? (
        <p className="text-[10px] text-muted-foreground/60">
          {t('v3.params.inpaintHint', { defaultValue: 'Paint over the area you want to modify on the image, then describe what to fill' })}
        </p>
      ) : null}

      {/* ── Prompt ── */}
      <div className="flex flex-col gap-1">
        {upstream.textContent ? <UpstreamTextBadge text={upstream.textContent} /> : null}
        <textarea
          className={[
            'min-h-[52px] w-full resize-none rounded-3xl border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
            disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          placeholder={t('v3.params.inpaintPromptPlaceholder', { defaultValue: 'Describe what to fill in the painted area...' })}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
