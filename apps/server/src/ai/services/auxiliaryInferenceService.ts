/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { generateText, Output } from 'ai'
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
  /** SaaS access token (fallback when request context is unavailable, e.g. tRPC mutations). */
  saasAccessToken?: string
  /** Max output tokens for the model response. Applied to local/cloud calls only. */
  maxTokens?: number
}

type AuxiliaryInferTextInput = {
  capabilityKey: CapabilityKey
  context: string
  fallback: string
  /** Skip cache for this call. */
  noCache?: boolean
  /** Override the system prompt (used by test UI). */
  promptOverride?: string
  /** SaaS access token (fallback when request context is unavailable, e.g. tRPC mutations). */
  saasAccessToken?: string
}

/**
 * Unified auxiliary inference entry point.
 *
 * Reads config from auxiliary-model.json, resolves the model,
 * calls generateText with Output.object() for the capability prompt + user context,
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
  saasAccessToken: inputToken,
  maxTokens,
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
      const token = getSaasAccessToken() || inputToken
      if (!token) throw new Error('未登录云端账号，请先登录')
      const saasClient = getSaasClient(token)
      const capability = AUXILIARY_CAPABILITIES[capabilityKey]
      const res = await saasClient.auxiliary.infer({
        capabilityKey,
        systemPrompt,
        context,
        outputMode: 'structured',
        schema: capability?.outputSchema,
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
      const result = await generateText({
        model: resolved.model,
        output: Output.object({ schema }),
        system: systemPrompt,
        prompt: context,
        abortSignal: abortController.signal,
        ...(maxTokens ? { maxTokens } : {}),
      })

      const value = result.output as z.infer<T>
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
