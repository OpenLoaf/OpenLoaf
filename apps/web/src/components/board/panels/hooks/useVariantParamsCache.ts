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
 * useVariantParamsCache — persistent params cache across variant/feature switching.
 *
 * Stores variant form state keyed by `featureId:variantId`. Snapshots on switch,
 * persists to node on unmount via `onPersist` callback.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { PersistedSlotMap } from '../variants/slot-types'

export interface VariantParamsSnapshot {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  seed?: number
  slotAssignment?: PersistedSlotMap
}

export interface VariantParamsCacheOptions {
  /** Current cache key — `${featureId}:${variantId}` or empty */
  activeKey: string
  /** Initial cache from node's aiConfig.paramsCache */
  initialCache?: Record<string, VariantParamsSnapshot>
  /** Callback to persist the cache map externally (e.g. onUpdate to node) */
  onPersist?: (cache: Record<string, VariantParamsSnapshot>) => void
}

export interface VariantParamsCacheReturn {
  /** Current variant's live params ref */
  paramsRef: React.MutableRefObject<VariantParamsSnapshot>
  /** Get cached params for a specific key */
  getCached: (key: string) => VariantParamsSnapshot | undefined
  /** Update current params (called by form onChange) */
  updateParams: (params: VariantParamsSnapshot) => void
}

export function useVariantParamsCache(
  options: VariantParamsCacheOptions,
): VariantParamsCacheReturn {
  const { activeKey, initialCache, onPersist } = options

  const paramsRef = useRef<VariantParamsSnapshot>({ inputs: {}, params: {} })
  const cacheRef = useRef<Record<string, VariantParamsSnapshot>>(
    initialCache ?? {},
  )
  const activeKeyRef = useRef('')
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist

  const flush = useCallback(() => {
    const key = activeKeyRef.current
    if (key) cacheRef.current[key] = paramsRef.current
    onPersistRef.current?.({ ...cacheRef.current })
  }, [])

  // Snapshot on key change
  useEffect(() => {
    const prevKey = activeKeyRef.current
    if (prevKey && prevKey !== activeKey) {
      cacheRef.current[prevKey] = { ...paramsRef.current }
      flush()
    }
    activeKeyRef.current = activeKey
  }, [activeKey, flush])

  // Persist on unmount
  useEffect(() => {
    return () => flush()
  }, [flush])

  const getCached = useCallback(
    (key: string) => cacheRef.current[key],
    [],
  )

  const updateParams = useCallback(
    (params: VariantParamsSnapshot) => {
      paramsRef.current = params
      const key = activeKeyRef.current
      if (key) cacheRef.current[key] = params
    },
    [],
  )

  return { paramsRef, getCached, updateParams }
}
