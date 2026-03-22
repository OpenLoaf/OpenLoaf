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
import { toMediaInput, useSourceImage } from '../shared'

/**
 * Variant form for OL-OP-001 (百炼扩图).
 *
 * Inputs: image ({url})
 * Params: xScale (1.5), yScale (1.5)
 */
export function OutpaintQwenVariant({
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

  const { sourceUrl, sourcePath, rawSourceUrl, setImgLoadFailed } = useSourceImage(nodeResourceUrl, nodeResourcePath, upstream)

  const [xScale, setXScale] = useState(initialParams?.params?.xScale as number ?? 1.5)
  const [yScale, setYScale] = useState(initialParams?.params?.yScale as number ?? 1.5)

  // Report blocking warning to parent
  useEffect(() => {
    onWarningChange?.(!sourceUrl ? t('v3.params.needsImage', { defaultValue: 'An image is required for outpainting' }) : null)
  }, [sourceUrl, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        ...(sourcePath ? { image: toMediaInput(sourcePath) } : {}),
      },
      params: {
        xScale,
        yScale,
      },
    })
  }, [sourcePath, xScale, yScale, onParamsChange])

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

      {/* ── Scale controls ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">
            {t('v3.params.xScale', { defaultValue: 'Horizontal Scale' })}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min={1.0}
              max={3.0}
              step={0.1}
              value={xScale}
              onChange={(e) => setXScale(Number(e.target.value))}
              className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground"
              disabled={disabled}
            />
            <span className="w-8 text-right text-[11px] text-muted-foreground">
              {xScale.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">
            {t('v3.params.yScale', { defaultValue: 'Vertical Scale' })}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min={1.0}
              max={3.0}
              step={0.1}
              value={yScale}
              onChange={(e) => setYScale(Number(e.target.value))}
              className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground"
              disabled={disabled}
            />
            <span className="w-8 text-right text-[11px] text-muted-foreground">
              {yScale.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60">
        {t('v3.params.outpaintHint', { defaultValue: 'Scale > 1.0 extends the image in that direction' })}
      </p>
    </div>
  )
}
