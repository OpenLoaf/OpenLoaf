/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { generateText, Output, type UIMessage } from 'ai'
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { readAuxiliaryModelConf } from '@/modules/settings/auxiliaryModelConfStore'
import { ensureServerAccessToken } from '@/modules/auth/tokenStore'
import { getSaasClient } from '@/modules/saas/client'
import { buildModelMessages } from '@/ai/shared/messageConverter'
import {
  flattenMessagesToContext,
  messagesCacheSeed,
  modelHasMediaCapability,
  toSaasMessages,
} from './auxiliaryMessageUtils'
import {
  AUXILIARY_CAPABILITIES,
  type CapabilityKey,
} from './auxiliaryCapabilities'

/** In-memory TTL cache for auxiliary inference results. */
const cache = new Map<string, { value: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

function cacheKey(capabilityKey: string, input: string): string {
  const hash = createHash('sha256')
    .update(`${capabilityKey}:${input}`)
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
  /**
   * String context (legacy path). Required when `messages` is not provided.
   * When both are set, `messages` wins and this is ignored.
   */
  context?: string
  /**
   * UIMessage array (multimodal path). File parts survive into the model
   * request so vision-capable auxiliary models can see attached images.
   * Use this when the caller already has `parts`-shaped chat history and
   * wants the auxiliary model to reason about images/videos/audio.
   */
  messages?: UIMessage[]
  schema: T
  fallback: z.infer<T>
  /** Skip cache for this call. */
  noCache?: boolean
  /** Override the system prompt (used by test UI). */
  promptOverride?: string
  /** Max output tokens for the model response. Applied to local/cloud calls only. */
  maxTokens?: number
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
  messages,
  schema,
  fallback,
  noCache,
  promptOverride,
  maxTokens,
}: AuxiliaryInferInput<T>): Promise<z.infer<T>> {
  try {
    const useMessages = Array.isArray(messages) && messages.length > 0
    if (!useMessages && typeof context !== 'string') {
      console.warn(
        `${LOG_PREFIX} [${capabilityKey}] 入参缺失（context 与 messages 均未提供），返回 fallback`,
      )
      return fallback
    }
    const cacheSeed = useMessages ? messagesCacheSeed(messages!) : (context ?? '')

    console.log(
      `${LOG_PREFIX} [${capabilityKey}] 调用开始`,
      `| 模式: ${useMessages ? 'messages' : 'context'}`,
      `| 输入: ${truncate(useMessages ? `${messages!.length} messages` : context ?? '')}`,
    )

    // Check cache
    const key = cacheKey(capabilityKey, cacheSeed)
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
      const token = (await ensureServerAccessToken()) ?? ''
      if (!token) throw new Error('未登录云端账号，请先登录')
      const saasClient = getSaasClient(token)
      const payload = useMessages
        ? {
            capabilityKey,
            systemPrompt,
            messages: toSaasMessages(messages!),
            outputMode: 'structured' as const,
            schema: capability.outputSchema,
          }
        : {
            capabilityKey,
            systemPrompt,
            context: context ?? '',
            outputMode: 'structured' as const,
            schema: capability.outputSchema,
          }
      const res = await saasClient.auxiliary.infer(payload)
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

    // 逻辑：aux 模型若不支持媒体能力，把 messages 降级为文本 context，
    // 避免模型看到原始 attachment XML tag（相比文件名更难理解）。
    const canUseMessages = useMessages && modelHasMediaCapability(resolved.modelDefinition)
    const modelMessages = canUseMessages
      ? await buildModelMessages(messages!, undefined, {
          modelDefinition: resolved.modelDefinition,
        })
      : null
    const effectivePrompt = canUseMessages
      ? ''
      : useMessages
        ? flattenMessagesToContext(messages!)
        : (context ?? '')

    try {
      const result = await generateText({
        model: resolved.model,
        output: Output.object({ schema }),
        system: systemPrompt,
        ...(modelMessages ? { messages: modelMessages } : { prompt: effectivePrompt }),
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
