/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { resolveServerUrl } from "@/utils/server-url";
import { getAccessToken } from "@/lib/saas-auth";
import { getSaasMediaClient } from "@/lib/saas-media-client";

/** Build auth headers for SaaS proxy. */
export async function buildAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Validate HTTP response and parse JSON. */
async function parseJsonResponse(response: Response): Promise<any> {
  if (!response.ok) {
    // 尝试从 response body 提取更详细的错误消息
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.message || body?.error?.message || ''
    } catch { /* ignore parse failures */ }
    throw new Error(detail || `HTTP ${response.status}: ${response.statusText}`)
  }
  return response.json();
}

type PollTaskOptions = {
  /** Project id for server-side context recovery. */
  projectId?: string;
  /** Board id — server resolves save path automatically. */
  boardId?: string;
};

/** Poll task status via v3 endpoint. */
export async function pollTask(taskId: string, options?: PollTaskOptions) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const url = new URL(`${base}/ai/v3/task/${taskId}`);
  if (options?.projectId) url.searchParams.set("projectId", options.projectId);
  if (options?.boardId) url.searchParams.set("boardId", options.boardId);
  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

/**
 * Subscribe to task status SSE directly from SaaS.
 * Events only contain `{ taskId, status }` — call `pollTask()` for full result.
 * Returns a cleanup function that closes the EventSource.
 *
 * Since v3TaskEvents is async, the cleanup function is returned synchronously
 * but internally waits for the connection to be established.
 */
export function subscribeTaskEvents(
  taskId: string,
  handlers: {
    onStatus: (status: string) => void
    onError?: () => void
  },
): () => void {
  const client = getSaasMediaClient()
  const es = client.ai.v3TaskEvents(taskId)
  es.addEventListener('status', ((e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      handlers.onStatus(data.status)
    } catch { /* ignore */ }
  }) as EventListener)
  if (handlers.onError) {
    es.onerror = () => handlers.onError!()
  }
  return () => es.close()
}

/** Cancel a task (direct SDK call). */
export async function cancelTask(taskId: string) {
  const client = getSaasMediaClient()
  return client.ai.v3CancelTask(taskId)
}

// ═══════════ v3 API functions ═══════════

/** v3 capability feature. */
export type V3Feature = {
  id: string
  /** Feature display name (resolved to current locale by API, SDK v0.1.25+) */
  displayName?: string
  variants: V3Variant[]
}

/** Remote input slot declaration from capabilities API (SDK v0.1.26+). */
export type V3RemoteInputSlot = {
  /** Semantic role, also used as request `inputs[role]` field name. */
  role: string
  accept: 'text' | 'image' | 'audio' | 'video' | 'file'
  label: string
  required?: boolean
  /** Minimum input count (default: required ? 1 : 0). */
  minCount?: number
  maxCount?: number
  placeholder?: string
  multiline?: boolean
  /** Text: minimum character length. */
  minLength?: number
  /** Text: maximum character length. */
  maxLength?: number
  /** Media: maximum file size in bytes. */
  maxFileSize?: number
  /** Media: allowed file format extensions. */
  acceptFormats?: string[]
  /** Image/Video: minimum pixel dimension (px). */
  minResolution?: number
  /** Image/Video: maximum pixel dimension (px). */
  maxResolution?: number
  /** Audio/Video: minimum duration in seconds. */
  minDuration?: number
  /** Audio/Video: maximum duration in seconds. */
  maxDuration?: number
  hint?: string
  /** Cross-slot capacity group name. */
  sharedGroup?: string
  /** Total max count across all slots in the same sharedGroup. */
  sharedMaxCount?: number
}

/** v3 capability variant. */
export type V3Variant = {
  id: string
  featureTabName: string
  displayName?: string
  creditsPerCall: number
  billingType?: string
  minMembershipLevel: 'free' | 'lite' | 'pro' | 'premium' | 'infinity'
  maxBatchSize?: number
  resourceConstraints?: unknown
  /** Result media type (SDK v0.1.25+) */
  resultType?: 'image' | 'video' | 'audio'
  /** Whether this variant produces async tasks (SDK v0.1.25+) */
  isAsync?: boolean
  /** Input slot declarations from API (SDK v0.1.25+) */
  inputSlots?: V3RemoteInputSlot[]
  paramsSchema?: import('@/components/board/panels/variants/remote-param-schema').RemoteParamSchema[]
}

/** v3 capabilities response. */
export type V3CapabilitiesData = {
  category: 'image' | 'video' | 'audio'
  features: V3Feature[]
  updatedAt: string
}

/** Fetch v3 capabilities for a media category (direct SDK call). */
export async function fetchCapabilities(
  category: 'image' | 'video' | 'audio',
): Promise<V3CapabilitiesData> {
  const client = getSaasMediaClient()
  let result: any
  if (category === 'image') result = await client.ai.imageCapabilities()
  else if (category === 'video') result = await client.ai.videoCapabilities()
  else result = await client.ai.audioCapabilities()
  return result?.data ?? result
}

/** Estimate price result from server. */
export type V3CreditEstimate = {
  baseCredits: number
  markup: number
  totalCredits: number
  billingType: string
  factors: Record<string, number>
}

/** Estimate credits for a v3 generate request (direct SDK call). */
export async function fetchEstimatePrice(
  variant: string,
  params?: Record<string, unknown>,
): Promise<V3CreditEstimate> {
  const client = getSaasMediaClient()
  const result: any = await client.ai.v3EstimatePrice({ variant, params } as any)
  return result?.data ?? result
}

/** v3 generate request. */
export type V3GenerateRequest = {
  feature: string
  variant: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
  count?: number
  ticketId?: string
}

/** Submit a v3 generation task. */
export async function submitV3Generate(
  payload: V3GenerateRequest & {
    projectId?: string
    boardId?: string
    sourceNodeId?: string
  },
) {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const response = await fetch(`${base}/ai/v3/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  })
  return parseJsonResponse(response)
}

// ═══════════ Queue API ═══════════

/** 申请队列 ticket（POST /api/ai/v3/queue） */
export async function requestQueueTicket(payload: {
  feature: string
  variant: string
  count?: number
}): Promise<{ ticketId: string; position: number; status: string }> {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const response = await fetch(`${base}/ai/v3/queue`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  })
  const json = await parseJsonResponse(response)
  return json?.data ?? json
}

/** 上传媒体资源（POST /api/ai/v3/upload） */
export async function uploadQueueResource(
  ticketId: string,
  variantId: string,
  file: File | Blob,
): Promise<{ resourceId: string; precheck: 'passed' | 'skipped' }> {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const formData = new FormData()
  formData.append('ticketId', ticketId)
  formData.append('variant', variantId)
  formData.append('file', file)
  const response = await fetch(`${base}/ai/v3/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders,
    body: formData,
  })
  const json = await parseJsonResponse(response)
  return json?.data ?? json
}

/** 取消队列 ticket（POST /api/ai/v3/queue/:ticketId/cancel） */
export async function cancelQueueTicket(ticketId: string): Promise<void> {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  await fetch(`${base}/ai/v3/queue/${ticketId}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders,
  })
}

/** 订阅队列事件（SSE）— 使用 fetch + ReadableStream 以支持 Bearer token */
export function subscribeQueueEvents(
  ticketId: string,
  handlers: {
    onPosition?: (position: number, canUpload: boolean) => void
    onReady?: () => void
    onExpired?: (reason: string) => void
    onError?: (error: Error) => void
  },
): () => void {
  const controller = new AbortController()

  ;(async () => {
    try {
      const base = resolveServerUrl()
      const authHeaders = await buildAuthHeaders()
      const response = await fetch(`${base}/ai/v3/queue/${ticketId}/events`, {
        credentials: 'include',
        headers: { Accept: 'text/event-stream', ...authHeaders },
        signal: controller.signal,
      })

      if (!response.ok) {
        handlers.onError?.(new Error(`HTTP ${response.status}: ${response.statusText}`))
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        handlers.onError?.(new Error('Response body is not readable'))
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let currentEvent = ''
        let currentData = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim()
          } else if (line === '') {
            // Empty line = end of event
            if (currentEvent && currentData) {
              try {
                if (currentEvent === 'position') {
                  const data = JSON.parse(currentData)
                  handlers.onPosition?.(data.position, data.canUpload ?? false)
                } else if (currentEvent === 'ready') {
                  handlers.onReady?.()
                } else if (currentEvent === 'expired') {
                  const data = JSON.parse(currentData)
                  handlers.onExpired?.(data.reason ?? 'expired')
                }
              } catch { /* ignore parse errors */ }
            } else if (currentEvent === 'ready') {
              handlers.onReady?.()
            }
            currentEvent = ''
            currentData = ''
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        handlers.onError?.(err instanceof Error ? err : new Error('Queue event stream error'))
      }
    }
  })()

  return () => {
    controller.abort()
  }
}

// ═══════════ Catalog API ═══════════

export interface CatalogItem {
  value: string
  label: string
  thumbnail?: string
}

/** 获取远程选项 catalog */
export async function fetchCatalog(catalogId: string): Promise<CatalogItem[]> {
  const base = resolveServerUrl()
  const authHeaders = await buildAuthHeaders()
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN'
  const response = await fetch(`${base}/ai/v3/catalogs/${catalogId}`, {
    credentials: 'include',
    headers: { 'Accept-Language': lang, ...authHeaders },
  })
  const json = await parseJsonResponse(response)
  return json?.data?.items ?? json?.items ?? []
}
