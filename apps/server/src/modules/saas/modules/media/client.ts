import { getSaasClient } from "../../client";

export type SaasMediaSubmitArgs = {
  /** Media task kind. */
  kind: "image" | "video";
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
  resultType?: "image" | "video";
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
