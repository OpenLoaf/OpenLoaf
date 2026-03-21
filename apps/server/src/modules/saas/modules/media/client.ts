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
  const response = await client.ai.task(taskId);
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
  return client.ai.cancelTask(taskId);
}

// ═══════════ Media v2 client functions ═══════════

/** Submit a media generation task via SDK v2 unified endpoint. */
export async function submitMediaGenerateV2(
  payload: MediaGenerateRequest,
  accessToken: string,
): Promise<{ success: boolean; data?: { taskId: string }; message?: string }> {
  const client = getSaasClient(accessToken);
  return client.ai.mediaGenerate(payload) as any;
}

/** Poll single task via SDK v2 endpoint. */
export async function pollMediaTaskV2(
  taskId: string,
  accessToken: string,
): Promise<
  Omit<SaasMediaTaskResult, "taskId" | "status"> & {
    taskId?: string;
    status: SaasMediaTaskResult["status"] | "not_found";
    creditsConsumed?: number;
  }
> {
  const client = getSaasClient(accessToken);
  const response = (await client.ai.mediaTask(taskId)) as any;
  if (!response || response.success === false) {
    return { status: "not_found" };
  }
  const d = response.data;
  return {
    taskId,
    status: d.status ?? "queued",
    progress: d.progress,
    resultType: d.resultType,
    resultUrls: d.resultUrls,
    error: d.error,
    creditsConsumed: d.creditsConsumed,
  };
}

/** Cancel a running task via SDK v2. */
export async function cancelMediaTaskV2(
  taskId: string,
  accessToken: string,
): Promise<{ status: string }> {
  const client = getSaasClient(accessToken);
  const response = (await client.ai.mediaCancelTask(taskId)) as any;
  return { status: response?.data?.status ?? "unknown" };
}

/** Poll task group via SDK v2. */
export async function pollMediaTaskGroupV2(
  groupId: string,
  accessToken: string,
): Promise<any> {
  const client = getSaasClient(accessToken);
  return client.ai.mediaTaskGroup(groupId);
}

/** Fetch media models via SDK v2 unified endpoint. */
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

const cachedAudioModels = new Map<string, { updatedAt: number; payload: unknown }>();

/** Fetch audio model list with cache. */
export async function fetchAudioModels(
  accessToken: string,
  options: FetchMediaModelOptions = {},
) {
  const force = options.force === true;
  const cached = force ? null : readCache(cachedAudioModels, accessToken);
  if (cached) return cached;
  const client = getSaasClient(accessToken);
  const payload = await client.ai.audioModels();
  writeCache(cachedAudioModels, accessToken, payload);
  return payload;
}
