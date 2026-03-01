/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { generateObject, generateText } from 'ai'
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { readAuxiliaryModelConf } from '@/modules/settings/auxiliaryModelConfStore'
import {
  AUXILIARY_CAPABILITIES,
  type CapabilityKey,
} from './auxiliaryCapabilities'

/** In-memory TTL cache for auxiliary inference results. */
const cache = new Map<string, { value: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

function cacheKey(capabilityKey: string, context: string): string {
  const hash = createHash('sha256')
    .update(`${capabilityKey}:${context}`)
    .digest('hex')
    .slice(0, 16)
  return `aux:${capabilityKey}:${hash}`
}

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return undefined
  }
  return entry.value as T
}

function setCache(key: string, value: unknown): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Evict expired entries periodically. */
function evictExpired(): void {
  const now = Date.now()
  for (const [k, v] of cache) {
    if (now > v.expiresAt) cache.delete(k)
  }
}

// Run eviction every 2 minutes.
setInterval(evictExpired, 2 * 60 * 1000).unref?.()

type AuxiliaryInferInput<T extends z.ZodType> = {
  capabilityKey: CapabilityKey
  context: string
  schema: T
  fallback: z.infer<T>
  /** Skip cache for this call. */
  noCache?: boolean
}

type AuxiliaryInferTextInput = {
  capabilityKey: CapabilityKey
  context: string
  fallback: string
  /** Skip cache for this call. */
  noCache?: boolean
}

/**
 * Unified auxiliary inference entry point.
 *
 * Reads config from auxiliary-model.json, resolves the model,
 * calls generateObject with the capability prompt + user context,
 * and returns the structured result.
 *
 * On any error, silently returns the provided fallback.
 */
export async function auxiliaryInfer<T extends z.ZodType>({
  capabilityKey,
  context,
  schema,
  fallback,
  noCache,
}: AuxiliaryInferInput<T>): Promise<z.infer<T>> {
  try {
    // Check cache
    const key = cacheKey(capabilityKey, context)
    if (!noCache) {
      const cached = getCached<z.infer<T>>(key)
      if (cached !== undefined) return cached
    }

    // Read config
    const conf = readAuxiliaryModelConf()
    const modelIds =
      conf.modelSource === 'cloud' ? conf.cloudModelIds : conf.localModelIds
    const chatModelId = modelIds[0]?.trim() || undefined

    // Resolve model
    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource: conf.modelSource,
    })

    // Build prompt
    const capability = AUXILIARY_CAPABILITIES[capabilityKey]
    if (!capability) return fallback
    const customPrompt = conf.capabilities[capabilityKey]?.customPrompt
    const systemPrompt =
      typeof customPrompt === 'string' ? customPrompt : capability.defaultPrompt

    // Call with 3s timeout
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 3000)

    try {
      const result = await generateObject({
        model: resolved.model,
        schema,
        system: systemPrompt,
        prompt: context,
        abortSignal: abortController.signal,
      })

      const value = result.object as z.infer<T>
      if (!noCache) setCache(key, value)
      return value
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    // Silent fallback — never block the main flow.
    return fallback
  }
}

/**
 * Auxiliary inference for text output capabilities.
 *
 * Same model resolution and caching as `auxiliaryInfer`,
 * but calls `generateText` and returns a plain string.
 *
 * On any error, silently returns the provided fallback.
 */
export async function auxiliaryInferText({
  capabilityKey,
  context,
  fallback,
  noCache,
}: AuxiliaryInferTextInput): Promise<string> {
  try {
    const key = cacheKey(capabilityKey, context)
    if (!noCache) {
      const cached = getCached<string>(key)
      if (cached !== undefined) return cached
    }

    const conf = readAuxiliaryModelConf()
    const modelIds =
      conf.modelSource === 'cloud' ? conf.cloudModelIds : conf.localModelIds
    const chatModelId = modelIds[0]?.trim() || undefined

    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource: conf.modelSource,
    })

    const capability = AUXILIARY_CAPABILITIES[capabilityKey]
    if (!capability) return fallback
    const customPrompt = conf.capabilities[capabilityKey]?.customPrompt
    const systemPrompt =
      typeof customPrompt === 'string' ? customPrompt : capability.defaultPrompt

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 3000)

    try {
      const result = await generateText({
        model: resolved.model,
        system: systemPrompt,
        prompt: context,
        abortSignal: abortController.signal,
      })

      if (!noCache) setCache(key, result.text)
      return result.text
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return fallback
  }
}
