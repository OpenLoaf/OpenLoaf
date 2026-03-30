/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useRef, useState } from 'react'
import { fetchEstimatePrice, type V3CreditEstimate } from '@/lib/saas-media'
import { useSaasAuth } from '@/hooks/use-saas-auth'

type UseEstimatePriceOptions = {
  /** Current variant ID. */
  variantId: string | undefined
  /** Params that affect pricing (aspectRatio, duration, count, quality, etc.). */
  params: Record<string, unknown> | undefined
  /** Skip estimation (e.g. not logged in). */
  skip?: boolean
}

type EstimateCacheEntry = {
  estimate: V3CreditEstimate | null
  expiresAt: number
}

const ESTIMATE_CACHE_TTL_MS = 5 * 60 * 1000
const ESTIMATE_ERROR_CACHE_TTL_MS = 15 * 1000

const estimateCache = new Map<string, EstimateCacheEntry>()
const estimateInflight = new Map<string, Promise<V3CreditEstimate | null>>()

/** Normalize estimate params into a cache-safe structure. */
function normalizeEstimateParams(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return null
  if (Array.isArray(value)) {
    // 逻辑：数组顺序可能影响计费语义，因此这里保持原顺序。
    return value.map((item) => normalizeEstimateParams(item))
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, child]) => {
        const normalizedChild = normalizeEstimateParams(child)
        return normalizedChild === undefined ? [] : [[key, normalizedChild] as const]
      })
    return Object.fromEntries(sortedEntries)
  }
  return value
}

/** Build a stable string key for variant estimate params. */
function buildEstimateParamsKey(params: Record<string, unknown> | undefined): string {
  return JSON.stringify(normalizeEstimateParams(params) ?? {})
}

/** Build a reusable cache key for estimate-price requests. */
function buildEstimateCacheKey(input: {
  accountKey: string
  variantId: string
  paramsKey: string
}): string {
  return `${input.accountKey}::${input.variantId}::${input.paramsKey}`
}

/** Read cached estimate when it is still fresh. */
function readEstimateCache(key: string): EstimateCacheEntry | null {
  const cached = estimateCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    estimateCache.delete(key)
    return null
  }
  return cached
}

/** Persist estimate result into the in-memory cache. */
function writeEstimateCache(
  key: string,
  estimate: V3CreditEstimate | null,
  ttlMs: number,
): void {
  estimateCache.set(key, {
    estimate,
    expiresAt: Date.now() + ttlMs,
  })
}

/** Fetch estimate with in-flight dedupe and cache backfill. */
function requestEstimate(
  key: string,
  variantId: string,
  params: Record<string, unknown> | undefined,
): Promise<V3CreditEstimate | null> {
  const inflight = estimateInflight.get(key)
  if (inflight) return inflight

  const request = fetchEstimatePrice(variantId, params)
    .then((result) => {
      writeEstimateCache(key, result, ESTIMATE_CACHE_TTL_MS)
      return result
    })
    .catch((error) => {
      // 逻辑：短暂缓存失败结果，避免节点反复选中时持续击穿接口。
      writeEstimateCache(key, null, ESTIMATE_ERROR_CACHE_TTL_MS)
      throw error
    })
    .finally(() => {
      estimateInflight.delete(key)
    })

  estimateInflight.set(key, request)
  return request
}

/**
 * Debounced credit estimator — calls `/ai/v3/estimate-price` when variant or
 * pricing-relevant params change.
 *
 * Returns `totalCredits` for display, falls back to `null` while loading.
 */
export function useEstimatePrice({
  variantId,
  params,
  skip,
}: UseEstimatePriceOptions) {
  const accountKey = useSaasAuth((state) => state.user?.email ?? state.user?.name ?? '__anonymous__')
  const [estimate, setEstimate] = useState<V3CreditEstimate | null>(null)
  const [loading, setLoading] = useState(false)
  const seqRef = useRef(0)

  // Stable serialization of pricing-relevant params
  const paramsKey = buildEstimateParamsKey(params)

  useEffect(() => {
    if (!variantId || skip) {
      seqRef.current += 1
      setEstimate(null)
      setLoading(false)
      return
    }

    const seq = ++seqRef.current
    const cacheKey = buildEstimateCacheKey({
      accountKey,
      variantId,
      paramsKey,
    })
    const cached = readEstimateCache(cacheKey)
    if (cached) {
      setEstimate(cached.estimate)
      setLoading(false)
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await requestEstimate(cacheKey, variantId, params)
        if (seq === seqRef.current) {
          setEstimate(result)
        }
      } catch {
        // Silently fail — credits will show as null
        if (seq === seqRef.current) {
          setEstimate(null)
        }
      } finally {
        if (seq === seqRef.current) {
          setLoading(false)
        }
      }
    }, 300)

    return () => {
      clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, variantId, paramsKey, skip])

  return {
    estimate,
    totalCredits: estimate?.totalCredits ?? null,
    billingType: estimate?.billingType ?? null,
    loading,
  }
}
