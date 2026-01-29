import type { ProviderDefinition } from "@tenas-ai/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";
import { logger } from "@/common/logger";
import { buildVolcengineRequest } from "@/ai/models/volcengine/volcengineClient";
import { resolveVolcengineConfig } from "@/ai/models/volcengine/volcengineConfig";

/** Volcengine task result action. */
const VOLCENGINE_ACTION_RESULT = "CVSync2AsyncGetResult";

type VolcengineResponse<T> = {
  /** Gateway metadata. */
  ResponseMetadata?: {
    /** Error payload. */
    Error?: { Code?: string; Message?: string };
  } | null;
  /** Business code. */
  code?: number;
  /** Business message. */
  message?: string;
  /** Data payload. */
  data?: T | null;
};

type VolcengineVideoResult = {
  /** Task status. */
  status?: string;
  /** Result video url. */
  video_url?: string;
  /** AIGC mark status. */
  aigc_meta_tagged?: boolean;
};

export type VideoTaskResult = {
  /** Task status. */
  status: string;
  /** Result video url. */
  videoUrl: string;
};

/** Unwrap Volcengine response or throw on errors. */
function unwrapVolcengineResponse<T>(response: VolcengineResponse<T>): T | null {
  if (response.ResponseMetadata?.Error?.Code) {
    const message = response.ResponseMetadata.Error.Message ?? "网关错误";
    throw new Error(`Volcengine网关错误: ${message}`);
  }
  if (response.code !== 10000) {
    const message = response.message ?? "服务返回失败";
    throw new Error(`Volcengine请求失败: ${message}`);
  }
  return response.data ?? null;
}

/** Sleep with abort support. */
function sleepWithAbort(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("请求已取消"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("请求已取消"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Fetch Volcengine video task result. */
export async function fetchVolcengineVideoResult(input: {
  /** Provider settings entry. */
  provider: ProviderSettingEntry;
  /** Provider definition. */
  providerDefinition?: ProviderDefinition;
  /** Model id (req_key). */
  modelId: string;
  /** Task id. */
  taskId: string;
  /** Abort signal. */
  abortSignal?: AbortSignal;
  /** Whether to log request info. */
  logRequest?: boolean;
}): Promise<VideoTaskResult> {
  const config = resolveVolcengineConfig({
    provider: input.provider,
    providerDefinition: input.providerDefinition,
  });
  const payload = {
    req_key: input.modelId,
    task_id: input.taskId,
  };
  const request = buildVolcengineRequest(config, VOLCENGINE_ACTION_RESULT, payload);
  if (input.logRequest) {
    logger.debug(
      {
        requestUrl: request.url,
        taskId: input.taskId,
      },
      "[volcengine] video result request",
    );
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: input.abortSignal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`模型请求失败: ${response.status} ${text}`);
  }
  const json = (await response.json()) as VolcengineResponse<VolcengineVideoResult>;
  const data = unwrapVolcengineResponse(json);
  const status = data?.status ?? "";
  const videoUrl = data?.video_url ?? "";
  return { status, videoUrl };
}

/** Wait until Volcengine video task completes. */
export async function waitForVolcengineVideoResult(input: {
  /** Provider settings entry. */
  provider: ProviderSettingEntry;
  /** Provider definition. */
  providerDefinition?: ProviderDefinition;
  /** Model id (req_key). */
  modelId: string;
  /** Task id. */
  taskId: string;
  /** Abort signal. */
  abortSignal?: AbortSignal;
  /** Polling interval. */
  intervalMs?: number;
  /** Maximum attempts. */
  maxAttempts?: number;
}) {
  const intervalMs = input.intervalMs ?? 2000;
  const maxAttempts = input.maxAttempts ?? 40;
  let lastStatus = "";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (input.abortSignal?.aborted) {
      throw new Error("请求已取消");
    }
    const result = await fetchVolcengineVideoResult({
      ...input,
      logRequest: attempt === 0,
    });
    if (result.status && result.status !== lastStatus) {
      lastStatus = result.status;
      logger.debug(
        {
          attempt: attempt + 1,
          maxAttempts,
          status: result.status,
        },
        "[volcengine] video task status",
      );
    }
    if (result.status === "done") {
      return result;
    }
    if (result.status === "not_found" || result.status === "expired") {
      throw new Error(`任务状态异常: ${result.status || "unknown"}`);
    }
    await sleepWithAbort(intervalMs, input.abortSignal);
  }

  throw new Error("任务超时");
}
