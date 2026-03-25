/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { VariantUpstream } from '../types'

export { MediaSlot, UpstreamTextBadge } from './MediaSlot'
export type { MediaSlotProps } from './MediaSlot'
export { PillSelect } from './PillSelect'
export type { PillSelectOption, PillSelectProps } from './PillSelect'
export { ReferenceChip } from './ReferenceChip'
export type { ReferenceChipProps } from './ReferenceChip'
export { TextReferencePool } from './TextReferencePool'
export type { TextReferencePoolProps } from './TextReferencePool'
export { ReferenceDropdown } from './ReferenceDropdown'
export type { ReferenceDropdownHandle, ReferenceDropdownProps } from './ReferenceDropdown'
export { TextSlotField } from './TextSlotField'
export type { TextSlotFieldProps } from './TextSlotField'
export { OverflowHint } from './OverflowHint'
export type { OverflowHintProps } from './OverflowHint'
export { MediaSlotGroup } from './MediaSlotGroup'
export type { MediaSlotGroupProps } from './MediaSlotGroup'
export { InputSlotBar } from './InputSlotBar'
export type { InputSlotBarProps, ResolvedSlotInputs } from './InputSlotBar'

export { toMediaInput } from './toMediaInput'

/**
 * Resolve the node/upstream source image for variants that require a single image input.
 * Handles broken URL detection via a hidden probe image.
 *
 * @returns { sourceUrl, sourcePath, rawSourceUrl, imgLoadFailed, probeElement }
 * - sourceUrl: browser-friendly URL for display (undefined if broken)
 * - sourcePath: board-relative path for API submission
 * - probeElement: hidden <img> JSX to detect broken URLs — render in component
 */
export function useSourceImage(
  nodeResourceUrl: string | undefined,
  nodeResourcePath: string | undefined,
  upstream: VariantUpstream,
) {
  const rawSourceUrl = nodeResourceUrl ?? upstream.images?.[0]
  const [imgLoadFailed, setImgLoadFailed] = useState(false)
  useEffect(() => { setImgLoadFailed(false) }, [rawSourceUrl])
  const sourceUrl = imgLoadFailed ? undefined : rawSourceUrl
  const sourcePath = nodeResourcePath ?? upstream.imagePaths?.[0]

  return { sourceUrl, sourcePath, rawSourceUrl, imgLoadFailed, setImgLoadFailed }
}

/**
 * Manage manual image uploads + compute display/API image lists.
 * Used by legacy multi-image variant forms that accept multiple reference images.
 *
 * @param max - Maximum total images allowed
 * @param nodeResourcePath - Current node's image path (highest priority)
 * @param upstream - Upstream data from connected nodes
 */
export function useMediaSlots(
  max: number,
  nodeResourcePath: string | undefined,
  upstream: VariantUpstream,
) {
  const [manualImages, setManualImages] = useState<string[]>([])

  const nodeImage = nodeResourcePath?.trim() || ''

  // For display: resolved URLs (upstream) + manual uploads
  const displayImages = useMemo(
    () => [...(upstream.images ?? []), ...manualImages],
    [upstream.images, manualImages],
  )

  // For API: node image (priority) + upstream paths + manual uploads, capped at max
  const apiImages = useMemo(
    () => [
      ...(nodeImage ? [nodeImage] : []),
      ...(upstream.imagePaths ?? upstream.images ?? []),
      ...manualImages,
    ].slice(0, max),
    [nodeImage, upstream.imagePaths, upstream.images, manualImages, max],
  )

  const addImage = useCallback((src: string) => {
    setManualImages(prev => [...prev, src])
  }, [])

  const removeImage = useCallback((index: number) => {
    setManualImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  const trimToMax = useCallback((newMax: number) => {
    setManualImages(prev => prev.length > newMax ? prev.slice(0, newMax) : prev)
  }, [])

  return { manualImages, displayImages, apiImages, addImage, removeImage, trimToMax, canAdd: displayImages.length < max }
}
