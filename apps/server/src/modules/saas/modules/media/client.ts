/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { SaaSNetworkError } from '@openloaf-saas/sdk'
import { getSaasClient } from '../../client'

export type SaasMediaSubmitArgs = {
  /** Media task kind. */
  kind: 'image' | 'video' | 'audio'
  /** Input payload to SaaS. */
  payload: Record<string, unknown>
}

export type SaasMediaTaskResult = {
  /** Task identifier. */
  taskId: string
  /** Task status. */
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  /** Task progress when available. */
  progress?: number
  /** Result type when available. */
  resultType?: 'image' | 'video' | 'audio'
  /** Result asset URLs. */
  resultUrls?: string[]
  /** STT 识别结果文本 */
  resultText?: string
  /** Error payload when failed. */
  error?: { code?: string; message: string }
}

type FetchMediaModelOptions = {
  /** Force bypass in-memory cache. */
  force?: boolean
}

/** Cache ttl for media model lists. */
const MODELS_TTL_MS = 24 * 60 * 60 * 1000
const cachedImageModels = new Map<
  string,
  { updatedAt: number; payload: unknown }
>()
const cachedVideoModels = new Map<
  string,
  { updatedAt: number; payload: unknown }
>()
const cachedCapabilities = new Map<
  string,
  { updatedAt: number; payload: unknown }
>()

/** Read cached payload by token. */
function readCache(
  cache: Map<string, { updatedAt: number; payload: unknown }>,
  token: string,
): unknown | null {
  const entry = cache.get(token)
  if (!entry) return null
  if (Date.now() - entry.updatedAt > MODELS_TTL_MS) {
    cache.delete(token)
    return null
  }
  return entry.payload
}

/** Write cached payload by token. */
function writeCache(
  cache: Map<string, { updatedAt: number; payload: unknown }>,
  token: string,
  payload: unknown,
): void {
  cache.set(token, { updatedAt: Date.now(), payload })
  // 逻辑：避免缓存无限增长，超过 20 条时清理最旧记录。
  if (cache.size <= 20) return
  const entries = Array.from(cache.entries()).sort(
    (a, b) => a[1].updatedAt - b[1].updatedAt,
  )
  const overflow = cache.size - 20
  for (let i = 0; i < overflow; i += 1) {
    cache.delete(entries[i]![0])
  }
}

/**
 * 网络错误重试包装器。
 * 逻辑：SDK 原生方法不带自动重试，此包装器为网络级错误（socket 断开、连接拒绝等）
 * 提供 1 次重试机会，与迁移前的 v3Fetch 行为保持一致。
 */
async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const isNetworkError =
        err instanceof SaaSNetworkError ||
        err?.cause?.code === 'UND_ERR_SOCKET' ||
        err?.cause?.code === 'ECONNRESET' ||
        err?.cause?.code === 'ECONNREFUSED' ||
        err?.message === 'fetch failed'
      if (isNetworkError && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500))
        continue
      }
      // 逻辑：给网络错误补上 status 503，便于 handleSaasMediaRoute 识别。
      if (isNetworkError && !err.status) {
        err.status = 503
        err.code = 'NETWORK_ERROR'
        err.message = err.message || '网络连接失败'
      }
      throw err
    }
  }
  // 逻辑：不可达，TypeScript 需要返回值。
  throw new Error('unreachable')
}

/**
 * @deprecated v2 media submit — delegates to v3 generate.
 * AI agent tools still call this; the payload is forwarded as-is to v3Generate.
 */
export async function submitMediaTask(
  input: SaasMediaSubmitArgs,
  accessToken: string,
) {
  return submitV3Generate(input.payload, accessToken)
}

/**
 * @deprecated v2 task poll — delegates to v3 GET.
 */
export async function pollMediaTask(
  taskId: string,
  accessToken: string,
): Promise<SaasMediaTaskResult> {
  const response = await pollV3Task(taskId, accessToken)
  if (!response || response.success !== true) {
    return {
      taskId,
      status: 'failed',
      error: { message: (response as any)?.message ?? '任务查询失败' },
    }
  }
  return {
    taskId,
    status: response.data.status,
    resultUrls: response.data.resultUrls,
    resultText: response.data.resultText,
    error: response.data.error,
  }
}

/**
 * @deprecated v2 task cancel — delegates to v3 cancel.
 */
export async function cancelMediaTask(
  taskId: string,
  accessToken: string,
) {
  return cancelV3Task(taskId, accessToken)
}

/**
 * @deprecated v1 image models — delegates to v3 image capabilities.
 */
export async function fetchImageModels(
  accessToken: string,
  options: FetchMediaModelOptions = {},
) {
  const force = options.force === true
  const cached = force ? null : readCache(cachedImageModels, accessToken)
  if (cached) return cached
  const payload = await fetchCapabilitiesV3('image', accessToken)
  writeCache(cachedImageModels, accessToken, payload)
  return payload
}

/**
 * @deprecated v1 video models — delegates to v3 video capabilities.
 */
export async function fetchVideoModels(
  accessToken: string,
  options: FetchMediaModelOptions = {},
) {
  const force = options.force === true
  const cached = force ? null : readCache(cachedVideoModels, accessToken)
  if (cached) return cached
  const payload = await fetchCapabilitiesV3('video', accessToken)
  writeCache(cachedVideoModels, accessToken, payload)
  return payload
}

// ---------------------------------------------------------------------------
// File upload via SaaS SDK
// ---------------------------------------------------------------------------

/**
 * Upload a file buffer to SaaS CDN via sdk.ai.uploadFile().
 * Returns the public URL.
 */
export async function uploadMediaFile(
  buffer: Buffer,
  filename: string,
  contentType: string,
  accessToken: string,
): Promise<string> {
  const client = getSaasClient(accessToken)
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType })
  const response = await client.ai.uploadFile(blob, filename)
  if (!response || !response.url) {
    throw new Error('SaaS uploadFile returned no URL')
  }
  return response.url
}

// ═══════════ Media v3 client functions ═══════════
// 逻辑：通过 SDK v0.1.20 原生方法调用 SaaS v3 REST 端点。
// SDK 方法已通过 getSaasClient 配置的 timeoutFetcher 获得超时和诊断日志，
// withNetworkRetry 包装器提供网络错误重试（1 次）。

/** Fetch v3 capabilities for a given media category (24h in-memory cache). */
export async function fetchCapabilitiesV3(
  category: 'image' | 'video' | 'audio',
  accessToken: string,
) {
  const cacheKey = `${category}:${accessToken}`
  const cached = readCache(cachedCapabilities, cacheKey)
  if (cached) return cached
  const client = getSaasClient(accessToken)
  const payload = await withNetworkRetry(() => {
    if (category === 'image') return client.ai.imageCapabilities()
    if (category === 'video') return client.ai.videoCapabilities()
    return client.ai.audioCapabilities()
  })
  writeCache(cachedCapabilities, cacheKey, payload)
  return payload
}

/** Submit a v3 media generation task. */
export async function submitV3Generate(
  payload: Record<string, unknown>,
  accessToken: string,
) {
  const client = getSaasClient(accessToken)
  return withNetworkRetry(() => client.ai.v3Generate(payload as any))
}

/** Poll a v3 media task by id (simple GET). */
export async function pollV3Task(taskId: string, accessToken: string) {
  const client = getSaasClient(accessToken)
  return withNetworkRetry(() => client.ai.v3Task(taskId))
}

/**
 * Subscribe to v3 task SSE events (lightweight: only { taskId, status }).
 * Returns a cleanup function that closes the EventSource.
 */
export function subscribeV3TaskEvents(
  taskId: string,
  accessToken: string,
  handlers: {
    onStatus: (event: import('@openloaf-saas/sdk').V3TaskSSEEvent) => void
    onError?: (err: Event) => void
  },
): () => void {
  const client = getSaasClient(accessToken)
  const es = client.ai.v3TaskEvents(taskId)
  es.addEventListener('status', ((e: MessageEvent) => {
    try {
      handlers.onStatus(JSON.parse(e.data))
    } catch {
      // ignore parse errors
    }
  }) as EventListener)
  if (handlers.onError) {
    es.onerror = handlers.onError as (ev: Event) => void
  }
  return () => es.close()
}

/** Task full result from v3Task GET. */
export type V3TaskFullResult = {
  taskId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  resultUrls?: string[]
  resultText?: string
  creditsConsumed?: number
  error?: { code?: string; message: string }
}

/**
 * Wait for a v3 task to reach a terminal status via SSE, then GET full result.
 * Supports AbortSignal and timeout.
 */
export async function waitV3TaskComplete(
  taskId: string,
  accessToken: string,
  opts: { abortSignal?: AbortSignal; timeoutMs?: number } = {},
): Promise<V3TaskFullResult> {
  // 1. SSE 等待终态（deferred pattern，避免 new Promise(async ...) 反模式）
  let resolve!: () => void
  let reject!: (err: Error) => void
  const ssePromise = new Promise<void>((res, rej) => { resolve = res; reject = rej })

  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let abortHandler: (() => void) | undefined
  let closeEs: (() => void) | undefined

  const teardown = () => {
    if (timer) { clearTimeout(timer); timer = undefined }
    if (abortHandler && opts.abortSignal) {
      opts.abortSignal.removeEventListener('abort', abortHandler)
      abortHandler = undefined
    }
    closeEs?.()
  }

  const settle = (fn: () => void) => {
    if (settled) return
    settled = true
    teardown()
    fn()
  }

  // abort/timeout 注册在 SSE 连接建立前，防止竞态
  if (opts.abortSignal) {
    abortHandler = () => settle(() => reject(new Error('已取消')))
    if (opts.abortSignal.aborted) {
      settle(() => reject(new Error('已取消')))
    } else {
      opts.abortSignal.addEventListener('abort', abortHandler, { once: true })
    }
  }

  if (opts.timeoutMs && opts.timeoutMs > 0) {
    timer = setTimeout(() => settle(() => reject(new Error('SSE 等待超时'))), opts.timeoutMs)
  }

  if (!settled) {
    closeEs = subscribeV3TaskEvents(taskId, accessToken, {
      onStatus(event) {
        if (
          event.status === 'succeeded' ||
          event.status === 'failed' ||
          event.status === 'canceled'
        ) {
          settle(() => resolve())
        }
      },
      onError() {
        settle(() => reject(new Error('SSE 连接失败')))
      },
    })
  }

  await ssePromise

  // 2. GET 取完整结果
  const response = await pollV3Task(taskId, accessToken)
  if (!response?.data) {
    throw new Error('任务结果查询失败')
  }
  return response.data as V3TaskFullResult
}

/** Cancel a v3 media task by id. */
export async function cancelV3Task(taskId: string, accessToken: string) {
  const client = getSaasClient(accessToken)
  return withNetworkRetry(() => client.ai.v3CancelTask(taskId))
}
