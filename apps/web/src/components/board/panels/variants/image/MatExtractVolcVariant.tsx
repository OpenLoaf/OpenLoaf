/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { VariantFormProps } from '../types'
import { toMediaInput, useSourceImage } from '../shared'

/**
 * Variant form for OL-ME-001 (素材提取 / Material Extract).
 *
 * Inputs: image ({url})
 * Params: none
 *
 * When `resolvedSlots` is provided (InputSlotBar mode), the variant reads
 * the `image` slot from the framework instead of using useSourceImage.
 */
export function MatExtractVolcVariant({
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

  // Self-managed source image (fallback mode only)
  const { sourceUrl: fallbackSourceUrl, sourcePath: fallbackSourcePath, rawSourceUrl, setImgLoadFailed } = useSourceImage(nodeResourceUrl, nodeResourcePath, upstream)

  // Resolve image source based on mode
  let sourceUrl: string | undefined
  let sourcePath: string | undefined

  if (resolvedSlots) {
    // Framework mode: read from resolvedSlots['image']
    const imageRef = (resolvedSlots['image'] ?? [])[0]
    sourceUrl = imageRef?.url
    sourcePath = imageRef?.path ?? imageRef?.url
  } else {
    // Fallback: node resource + upstream
    sourceUrl = fallbackSourceUrl
    sourcePath = fallbackSourcePath
  }

  // Report blocking warning to parent when no image available
  useEffect(() => {
    onWarningChange?.(!sourceUrl ? t('v3.params.needsImage', { defaultValue: 'An image is required for material extraction' }) : null)
  }, [sourceUrl, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: {
        ...(sourcePath ? { image: toMediaInput(sourcePath) } : {}),
      },
      params: {},
    })
  }, [sourcePath, onParamsChange])

  useEffect(() => { sync() }, [sync])

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden probe to detect broken source URLs (fallback mode only) */}
      {!resolvedSlots && rawSourceUrl ? (
        <img
          src={rawSourceUrl}
          alt=""
          className="hidden"
          onError={() => setImgLoadFailed(true)}
        />
      ) : null}
    </div>
  )
}
