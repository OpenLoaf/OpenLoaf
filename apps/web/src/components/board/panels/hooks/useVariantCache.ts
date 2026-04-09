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
 *
 * When `paused` is true (editing mode), `update()` still modifies the in-memory
 * ref so the UI works, but the debounced auto-flush is suppressed. Use
 * `takeSnapshot()` / `restoreSnapshot()` to implement cancel-edit semantics.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { VariantSnapshot } from '../../board-contracts'

export interface VariantCacheOptions {
  /** Initial cache from node's aiConfig.cache */
  initialCache?: Record<string, VariantSnapshot>
  /** Called when dirty cache needs to persist to node */
  onFlush: (cache: Record<string, VariantSnapshot>) => void
  /** When true, update() changes in-memory state but does NOT schedule auto-flush. */
  paused?: boolean
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
  /** Capture current cache state for later restore (deep copy). */
  takeSnapshot: () => Record<string, VariantSnapshot>
  /** Restore a previously captured snapshot (discards current in-memory draft). */
  restoreSnapshot: (snapshot: Record<string, VariantSnapshot>) => void
  /**
   * Migrate userTexts from a sibling variant within the same feature.
   * Call synchronously before reading the snapshot so that InputSlotBar
   * receives the migrated texts on its initial mount.
   * Only migrates when the target key has no userTexts yet.
   */
  migrateUserTexts: (fromKey: string, toKey: string) => void
}

export function useVariantCache(options: VariantCacheOptions): VariantCacheReturn {
  const cacheRef = useRef<Record<string, VariantSnapshot>>(options.initialCache ?? {})
  const dirtyRef = useRef(false)
  const flushTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onFlushRef = useRef(options.onFlush)
  onFlushRef.current = options.onFlush
  const pausedRef = useRef(options.paused ?? false)
  pausedRef.current = options.paused ?? false

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
        userTexts: patch.userTexts !== undefined ? { ...prev.userTexts, ...patch.userTexts } : prev.userTexts,
      }
      dirtyRef.current = true
      clearTimeout(flushTimer.current)
      // Only schedule auto-flush when not paused (editing mode suppresses)
      if (!pausedRef.current) {
        flushTimer.current = setTimeout(() => {
          if (dirtyRef.current) {
            onFlushRef.current({ ...cacheRef.current })
            dirtyRef.current = false
          }
        }, 300)
      }
    },
    [],
  )

  // Flush on unmount — skip if paused (discard editing draft)
  useEffect(() => () => {
    if (!pausedRef.current) flushNow()
  }, [flushNow])

  const get = useCallback((key: string) => cacheRef.current[key], [])

  const migrateUserTexts = useCallback(
    (fromKey: string, toKey: string) => {
      if (!fromKey || !toKey || fromKey === toKey) return
      // Only migrate within the same feature (model switch, not feature switch)
      const fromFeature = fromKey.split(':')[0]
      const toFeature = toKey.split(':')[0]
      if (fromFeature !== toFeature) return
      const existing = cacheRef.current[toKey]
      if (existing?.userTexts && Object.keys(existing.userTexts).length > 0) return
      const prev = cacheRef.current[fromKey]
      if (!prev?.userTexts || Object.keys(prev.userTexts).length === 0) return
      const target = cacheRef.current[toKey] ?? { inputs: {}, params: {} }
      cacheRef.current[toKey] = { ...target, userTexts: { ...prev.userTexts } }
      dirtyRef.current = true
      if (!pausedRef.current) {
        clearTimeout(flushTimer.current)
        flushTimer.current = setTimeout(() => {
          if (dirtyRef.current) {
            onFlushRef.current({ ...cacheRef.current })
            dirtyRef.current = false
          }
        }, 300)
      }
    },
    [],
  )

  const takeSnapshot = useCallback(
    () => JSON.parse(JSON.stringify(cacheRef.current)) as Record<string, VariantSnapshot>,
    [],
  )

  const restoreSnapshot = useCallback(
    (snapshot: Record<string, VariantSnapshot>) => {
      cacheRef.current = snapshot
      dirtyRef.current = true
      clearTimeout(flushTimer.current)
    },
    [],
  )

  return useMemo(
    () => ({ update, get, flushNow, cacheRef, takeSnapshot, restoreSnapshot, migrateUserTexts }),
    [update, get, flushNow, takeSnapshot, restoreSnapshot, migrateUserTexts],
  )
}
