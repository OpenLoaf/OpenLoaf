/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * useVariantCache — debounced variant params cache with single write entry.
 *
 * All param/slot updates go through `update()`. Flushes to node after 300ms
 * of inactivity, or immediately via `flushNow()` (call before generate).
 */

import { useCallback, useEffect, useRef } from 'react'
import type { VariantSnapshot } from '../../board-contracts'

export interface VariantCacheOptions {
  /** Initial cache from node's aiConfig.cache */
  initialCache?: Record<string, VariantSnapshot>
  /** Called when dirty cache needs to persist to node */
  onFlush: (cache: Record<string, VariantSnapshot>) => void
}

export interface VariantCacheReturn {
  /** Single entry point for all updates — field-level merge, auto-debounce */
  update: (key: string, patch: Partial<VariantSnapshot>) => void
  /** Read cached snapshot for a key */
  get: (key: string) => VariantSnapshot | undefined
  /** Synchronous flush — call before generate to ensure latest data */
  flushNow: () => void
  /** Direct ref access for collectParams (read-only) */
  cacheRef: React.MutableRefObject<Record<string, VariantSnapshot>>
}

export function useVariantCache(options: VariantCacheOptions): VariantCacheReturn {
  const cacheRef = useRef<Record<string, VariantSnapshot>>(options.initialCache ?? {})
  const dirtyRef = useRef(false)
  const flushTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onFlushRef = useRef(options.onFlush)
  onFlushRef.current = options.onFlush

  const flushNow = useCallback(() => {
    clearTimeout(flushTimer.current)
    if (dirtyRef.current) {
      onFlushRef.current({ ...cacheRef.current })
      dirtyRef.current = false
    }
  }, [])

  const update = useCallback(
    (key: string, patch: Partial<VariantSnapshot>) => {
      const prev = cacheRef.current[key] ?? { inputs: {}, params: {} }
      cacheRef.current[key] = {
        inputs: patch.inputs !== undefined ? { ...prev.inputs, ...patch.inputs } : prev.inputs,
        params: patch.params !== undefined ? { ...prev.params, ...patch.params } : prev.params,
        count: patch.count !== undefined ? patch.count : prev.count,
        slotAssignment: patch.slotAssignment !== undefined ? patch.slotAssignment : prev.slotAssignment,
      }
      dirtyRef.current = true
      clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => {
        if (dirtyRef.current) {
          onFlushRef.current({ ...cacheRef.current })
          dirtyRef.current = false
        }
      }, 300)
    },
    [],
  )

  // Flush on unmount
  useEffect(() => () => { flushNow() }, [flushNow])

  const get = useCallback((key: string) => cacheRef.current[key], [])

  return { update, get, flushNow, cacheRef }
}
