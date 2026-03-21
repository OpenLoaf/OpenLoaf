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

const SCALE_OPTIONS = [2, 4] as const

/**
 * Variant form for upscale-volc (即梦超清).
 *
 * Inputs: image ({url})
 * Params: scale (2), modelId
 */
export function UpscaleVolcVariant({
  variant,
  upstream,
  nodeResourceUrl,
  disabled,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')

  const rawSourceUrl = nodeResourceUrl ?? upstream.images?.[0]
  const [imgLoadFailed, setImgLoadFailed] = useState(false)
  useEffect(() => { setImgLoadFailed(false) }, [rawSourceUrl])
  const sourceUrl = imgLoadFailed ? undefined : rawSourceUrl

  const [scale, setScale] = useState<(typeof SCALE_OPTIONS)[number]>(2)

  // Report blocking warning to parent
  useEffect(() => {
    onWarningChange?.(!sourceUrl ? t('v3.params.needsImage', { defaultValue: 'An image is required for upscaling' }) : null)
  }, [sourceUrl, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        ...(sourceUrl ? { image: { url: sourceUrl } } : {}),
      },
      params: {
        scale,
      },
    })
  }, [sourceUrl, scale, onParamsChange])

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

      {/* ── Scale selector ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t('v3.params.scaleFactor', { defaultValue: 'Scale Factor' })}
        </span>
        <div className="flex gap-2">
          {SCALE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              className={[
                'flex-1 rounded-3xl border py-2 text-sm font-medium transition-colors duration-150',
                scale === s
                  ? 'border-foreground/30 bg-foreground/5 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                disabled ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
              onClick={() => !disabled && setScale(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* ── Variant info ── */}
      <p className="text-[10px] text-muted-foreground/60">
        {t('v3.params.upscaleVolcHint', { defaultValue: 'High-quality upscaling powered by cloud AI' })}
      </p>
    </div>
  )
}
