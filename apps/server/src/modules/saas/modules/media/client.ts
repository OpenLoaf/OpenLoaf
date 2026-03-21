/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getSaasClient } from "../../client";
import type { MediaGenerateRequest } from "@openloaf-saas/sdk";

export type SaasMediaSubmitArgs = {
  /** Media task kind. */
  kind: "image" | "video" | "audio";
  /** Input payload to SaaS. */
  payload: Record<string, unknown>;
};

export type SaasMediaTaskResult = {
  /** Task identifier. */
  taskId: string;
  /** Task status. */
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  /** Task progress when available. */
  progress?: number;
  /** Result type when available. */
  resultType?: "image" | "video" | "audio";
  /** Result asset URLs. */
  resultUrls?: string[];
  /** Error payload when failed. */
  error?: { code?: string; message: string };
};

type FetchMediaModelOptions = {
  /** Force bypass in-memory cache. */
  force?: boolean;
};

/** Connect timeout for v3 direct HTTP calls (ms). */
const SAAS_TIMEOUT_MS = 30_000;

/** Cache ttl for media model lists. */
const MODELS_TTL_MS = 24 * 60 * 60 * 1000;
const cachedImageModels = new Map<string, { updatedAt: number; payload: unknown }>();
const cachedVideoModels = new Map<string, { updatedAt: number; payload: unknown }>();

/** Read cached payload by token. */
function readCache(
  cache: Map<string, { updatedAt: number; payload: unknown }>,
  token: string,
): unknown | null {
  const entry = cache.get(token);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > MODELS_TTL_MS) {
    cache.delete(token);
    return null;
  }
  return entry.payload;
}

/** Write cached payload by token. */
function writeCache(
  cache: Map<string, { updatedAt: number; payload: unknown }>,
  token: string,
  payload: unknown,
): void {
  cache.set(token, { updatedAt: Date.now(), payload });
  // 逻辑：避免缓存无限增长，超过 20 条时清理最旧记录。
  if (cache.size <= 20) return;
  const entries = Array.from(cache.entries()).sort(
    (a, b) => a[1].updatedAt - b[1].updatedAt,
  );
  const overflow = cache.size - 20;
  for (let i = 0; i < overflow; i += 1) {
    cache.delete(entries[i]![0]);
  }
}

/** Submit a SaaS media task. */
export async function submitMediaTask(input: SaasMediaSubmitArgs, accessToken: string) {
  const client = getSaasClient(accessToken);
  // 逻辑：根据任务类型路由到对应 SDK 方法。
  if (input.kind === "image") {
    return client.ai.image(input.payload as any);
  }
  if (input.kind === "audio") {
    return client.ai.audio(input.payload as any);
  }
  return client.ai.video(input.payload as any);
}

/** Poll a SaaS media task by id. */
export async function pollMediaTask(
  taskId: string,
  accessToken: string,
): Promise<SaasMediaTaskResult> {
  const client = getSaasClient(accessToken);
  const response = await client.ai.mediaTask(taskId);
  if (!response || response.success !== true) {
    return {
      taskId,
      status: "failed",
      error: { message: response?.message ?? "任务查询失败" },
    };
  }
  return {
    taskId,
    status: response.data.status,
    progress: response.data.progress,
    resultType: response.data.resultType,
    resultUrls: response.data.resultUrls,
    error: response.data.error,
  };
}

/** Cancel a SaaS media task. */
export async function cancelMediaTask(taskId: string, accessToken: string) {
  const client = getSaasClient(accessToken);
  return client.ai.mediaCancelTask(taskId);
}

/** Fetch media models via SDK v2 unified endpoint (kept for AI chat model preferences). */
export async function fetchMediaModelsV2(
  accessToken: string,
  feature?: string,
): Promise<any> {
  const client = getSaasClient(accessToken);
  return client.ai.mediaModels(feature);
}

/** Fetch image model list with cache. */
export async function fetchImageModels(
  accessToken: string,
  options: FetchMediaModelOptions = {},
) {
  const force = options.force === true;
  const cached = force ? null : readCache(cachedImageModels, accessToken);
  if (cached) return cached;
  const client = getSaasClient(accessToken);
  const payload = await client.ai.imageModels();
  writeCache(cachedImageModels, accessToken, payload);
  return payload;
}

/** Fetch video model list with cache. */
export async function fetchVideoModels(
  accessToken: string,
  options: FetchMediaModelOptions = {},
) {
  const force = options.force === true;
  const cached = force ? null : readCache(cachedVideoModels, accessToken);
  if (cached) return cached;
  const client = getSaasClient(accessToken);
  const payload = await client.ai.videoModels();
  writeCache(cachedVideoModels, accessToken, payload);
  return payload;
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
  const client = getSaasClient(accessToken);
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
  const response = await client.ai.uploadFile(blob, filename);
  if (!response || !response.url) {
    throw new Error('SaaS uploadFile returned no URL');
  }
  return response.url;
}

// ═══════════ Media v3 client functions ═══════════
// 逻辑：SDK v0.1.13 尚未包含 v3 方法，直接通过 HTTP 调用 SaaS v3 REST 端点。

/** Build auth headers for v3 direct HTTP calls. */
function v3AuthHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

/**
 * Execute a v3 HTTP request with error handling.
 * 逻辑：封装 fetch + JSON 解析 + 网络错误重试（1 次），
 * 将 socket/network 错误转为带 status 的 Error 供上层 mapSaasError 捕获。
 */
async function v3Fetch(
  url: string,
  init?: RequestInit,
  retries = 1,
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(SAAS_TIMEOUT_MS),
      })
      let json: any
      try {
        json = await response.json()
      } catch {
        // 逻辑：JSON 解析失败时返回空对象，避免崩溃。
        json = {}
      }
      if (!response.ok) {
        const message = json?.message || json?.error?.message || `HTTP ${response.status}`
        const err = new Error(message) as any
        err.status = response.status
        err.statusText = response.statusText
        err.payload = json
        throw err
      }
      return json
    } catch (err: any) {
      // 逻辑：socket 断开等网络错误时重试一次；最后一次仍失败则抛出。
      const isNetworkError = err?.cause?.code === 'UND_ERR_SOCKET'
        || err?.cause?.code === 'ECONNRESET'
        || err?.cause?.code === 'ECONNREFUSED'
        || err?.message === 'fetch failed'
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
}

/** Fetch v3 capabilities for a given media category. */
export async function fetchCapabilitiesV3(
  category: 'image' | 'video' | 'audio',
  accessToken: string,
) {
  const baseUrl = getSaasClient(accessToken).getBaseUrl()
  return v3Fetch(`${baseUrl}/api/ai/v3/capabilities/${category}`, {
    headers: v3AuthHeaders(accessToken),
  })
}

/** Submit a v3 media generation task. */
export async function submitV3Generate(payload: Record<string, unknown>, accessToken: string) {
  const baseUrl = getSaasClient(accessToken).getBaseUrl()
  return v3Fetch(`${baseUrl}/api/ai/v3/generate`, {
    method: 'POST',
    headers: v3AuthHeaders(accessToken),
    body: JSON.stringify(payload),
  })
}

/** Poll a v3 media task by id. */
export async function pollV3Task(taskId: string, accessToken: string) {
  const baseUrl = getSaasClient(accessToken).getBaseUrl()
  return v3Fetch(`${baseUrl}/api/ai/v3/task/${taskId}`, {
    headers: v3AuthHeaders(accessToken),
  })
}

/** Cancel a v3 media task by id. */
export async function cancelV3Task(taskId: string, accessToken: string) {
  const baseUrl = getSaasClient(accessToken).getBaseUrl()
  return v3Fetch(`${baseUrl}/api/ai/v3/task/${taskId}/cancel`, {
    method: 'POST',
    headers: v3AuthHeaders(accessToken),
  })
}

/** Poll a v3 media task group by group id. */
export async function pollV3TaskGroup(groupId: string, accessToken: string) {
  const baseUrl = getSaasClient(accessToken).getBaseUrl()
  return v3Fetch(`${baseUrl}/api/ai/v3/task-group/${groupId}`, {
    headers: v3AuthHeaders(accessToken),
  })
}
