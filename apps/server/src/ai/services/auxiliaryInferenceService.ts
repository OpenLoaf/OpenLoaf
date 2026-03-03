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
import { getSaasAccessToken } from '@/ai/shared/context/requestContext'
import { getSaasClient } from '@/modules/saas/client'
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

const LOG_PREFIX = '[AuxiliaryInfer]'

function truncate(text: string, maxLen = 200): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
}

type AuxiliaryInferInput<T extends z.ZodType> = {
  capabilityKey: CapabilityKey
  context: string
  schema: T
  fallback: z.infer<T>
  /** Skip cache for this call. */
  noCache?: boolean
  /** Override the system prompt (used by test UI). */
  promptOverride?: string
}

type AuxiliaryInferTextInput = {
  capabilityKey: CapabilityKey
  context: string
  fallback: string
  /** Skip cache for this call. */
  noCache?: boolean
  /** Override the system prompt (used by test UI). */
  promptOverride?: string
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
  promptOverride,
}: AuxiliaryInferInput<T>): Promise<z.infer<T>> {
  try {
    console.log(
      `${LOG_PREFIX} [${capabilityKey}] 调用开始`,
      `| 输入: ${truncate(context)}`,
    )

    // Check cache
    const key = cacheKey(capabilityKey, context)
    if (!noCache) {
      const cached = getCached<z.infer<T>>(key)
      if (cached !== undefined) {
        console.log(
          `${LOG_PREFIX} [${capabilityKey}] 命中缓存`,
          `| 输出:`,
          cached,
        )
        return cached
      }
    }

    // Read config
    const conf = readAuxiliaryModelConf()

    // Build prompt
    const capability = AUXILIARY_CAPABILITIES[capabilityKey]
    if (!capability) {
      console.warn(`${LOG_PREFIX} [${capabilityKey}] 未找到能力定义，返回 fallback`)
      return fallback
    }
    const customPrompt = conf.capabilities[capabilityKey]?.customPrompt
    const systemPrompt =
      typeof promptOverride === 'string'
        ? promptOverride
        : typeof customPrompt === 'string'
          ? customPrompt
          : capability.defaultPrompt

    console.log(
      `${LOG_PREFIX} [${capabilityKey}] 模型来源: ${conf.modelSource}`,
    )

    // SaaS branch — delegate to SaaS backend
    if (conf.modelSource === 'saas') {
      const token = getSaasAccessToken()
      if (!token) throw new Error('未登录云端账号，请先登录')
      const saasClient = getSaasClient(token)
      const res = await saasClient.auxiliary.infer({
        capabilityKey,
        systemPrompt,
        context,
        outputMode: 'structured',
      })
      if (!res.ok) throw new Error(res.message)
      const value = schema.parse(res.result) as z.infer<T>
      if (!noCache) setCache(key, value)
      console.log(
        `${LOG_PREFIX} [${capabilityKey}] SaaS 推理完成`,
        `| 输出:`,
        value,
      )
      return value
    }

    // Local/Cloud branch
    const modelIds =
      conf.modelSource === 'cloud' ? conf.cloudModelIds : conf.localModelIds
    const chatModelId = modelIds[0]?.trim() || undefined

    // Resolve model
    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource: conf.modelSource,
    })

    // Call with 10s timeout
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 10_000)

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
      console.log(
        `${LOG_PREFIX} [${capabilityKey}] 本地/云端推理完成`,
        `| 输出:`,
        value,
      )
      return value
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    // Silent fallback — never block the main flow.
    console.warn(
      `${LOG_PREFIX} [${capabilityKey}] 推理失败，返回 fallback`,
      `| 错误:`,
      err instanceof Error ? err.message : err,
    )
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
  promptOverride,
}: AuxiliaryInferTextInput): Promise<string> {
  try {
    console.log(
      `${LOG_PREFIX} [${capabilityKey}] (text) 调用开始`,
      `| 输入: ${truncate(context)}`,
    )

    const key = cacheKey(capabilityKey, context)
    if (!noCache) {
      const cached = getCached<string>(key)
      if (cached !== undefined) {
        console.log(
          `${LOG_PREFIX} [${capabilityKey}] (text) 命中缓存`,
          `| 输出: ${truncate(cached)}`,
        )
        return cached
      }
    }

    const conf = readAuxiliaryModelConf()

    const capability = AUXILIARY_CAPABILITIES[capabilityKey]
    if (!capability) {
      console.warn(
        `${LOG_PREFIX} [${capabilityKey}] (text) 未找到能力定义，返回 fallback`,
      )
      return fallback
    }
    const customPrompt = conf.capabilities[capabilityKey]?.customPrompt
    const systemPrompt =
      typeof promptOverride === 'string'
        ? promptOverride
        : typeof customPrompt === 'string'
          ? customPrompt
          : capability.defaultPrompt

    console.log(
      `${LOG_PREFIX} [${capabilityKey}] (text) 模型来源: ${conf.modelSource}`,
    )

    // SaaS branch — delegate to SaaS backend
    if (conf.modelSource === 'saas') {
      const token = getSaasAccessToken()
      if (!token) throw new Error('未登录云端账号，请先登录')
      const saasClient = getSaasClient(token)
      const res = await saasClient.auxiliary.infer({
        capabilityKey,
        systemPrompt,
        context,
        outputMode: 'text',
      })
      if (!res.ok) throw new Error(res.message)
      const text = String(res.result)
      if (!noCache) setCache(key, text)
      console.log(
        `${LOG_PREFIX} [${capabilityKey}] (text) SaaS 推理完成`,
        `| 输出: ${truncate(text)}`,
      )
      return text
    }

    // Local/Cloud branch
    const modelIds =
      conf.modelSource === 'cloud' ? conf.cloudModelIds : conf.localModelIds
    const chatModelId = modelIds[0]?.trim() || undefined

    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource: conf.modelSource,
    })

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 10_000)

    try {
      const result = await generateText({
        model: resolved.model,
        system: systemPrompt,
        prompt: context,
        abortSignal: abortController.signal,
      })

      if (!noCache) setCache(key, result.text)
      console.log(
        `${LOG_PREFIX} [${capabilityKey}] (text) 本地/云端推理完成`,
        `| 输出: ${truncate(result.text)}`,
      )
      return result.text
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX} [${capabilityKey}] (text) 推理失败，返回 fallback`,
      `| 错误:`,
      err instanceof Error ? err.message : err,
    )
    return fallback
  }
}
