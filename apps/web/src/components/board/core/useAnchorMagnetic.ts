/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import type { CanvasPoint } from '../engine/types'
import type { CanvasEngine } from '../engine/CanvasEngine'
import { useCallback, useEffect, useRef } from 'react'

export type AnchorEntry = {
  anchorId: string
  worldPoint: CanvasPoint
}

/**
 * Anchor icon visibility hook.
 *
 * Shows / hides anchor icons with a simple fade transition.
 * No magnetic-follow or bounce animations.
 */
export function useAnchorMagnetic(
  engine: CanvasEngine,
  active: boolean,
  anchors: AnchorEntry[],
) {
  const refsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const anchorsRef = useRef(anchors)
  anchorsRef.current = anchors

  const setRef = useCallback((anchorId: string, el: HTMLDivElement | null) => {
    if (el) {
      refsMap.current.set(anchorId, el)
    } else {
      refsMap.current.delete(anchorId)
    }
  }, [])

  useEffect(() => {
    if (!active) {
      for (const [, el] of refsMap.current) {
        el.style.transition = 'opacity 200ms ease'
        el.style.transform = ''
        el.style.opacity = '0'
      }
      return
    }

    for (const entry of anchorsRef.current) {
      const el = refsMap.current.get(entry.anchorId)
      if (!el) continue
      el.style.transition = 'none'
      el.style.transform = ''
      el.style.opacity = '0'
      el.getBoundingClientRect()
      el.style.transition = 'opacity 200ms ease-out'
      el.style.opacity = '1'
    }
  }, [active, engine])

  return { setRef }
}
