import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3File,
  ImageModelV3ProviderMetadata,
  ImageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import type { ModelDefinition, ProviderDefinition } from "@teatime-ai/api/common";
import { Buffer } from "node:buffer";
import { buildVolcengineRequest } from "./volcengineClient";
import { resolveVolcengineConfig } from "./volcengineConfig";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";

/** Submit action name for Volcengine. */
const VOLCENGINE_ACTION_SUBMIT = "CVSync2AsyncSubmitTask";
/** Result action name for Volcengine. */
const VOLCENGINE_ACTION_RESULT = "CVSync2AsyncGetResult";

/** Default polling interval in milliseconds. */
const DEFAULT_POLL_INTERVAL_MS = 1000;
/** Default maximum polling attempts. */
const DEFAULT_MAX_POLL_ATTEMPTS = 60;

/** Map image model ids to req_key values. */
const VOLCENGINE_IMAGE_REQ_KEYS = {
  "volcengine.t2i.v40": "jimeng_t2i_v40",
  "volcengine.inpaint.v1": "jimeng_image2image_dream_inpaint",
  "volcengine.material.v1": "i2i_material_extraction",
} as const;

type VolcengineImageModelId = keyof typeof VOLCENGINE_IMAGE_REQ_KEYS;

/** Volcengine response wrapper. */
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

/** Volcengine image result payload. */
type VolcengineImageResult = {
  /** Base64-encoded image list. */
  binary_data_base64?: string[] | null;
  /** Image url list. */
  image_urls?: string[] | null;
  /** Task status. */
  status?: string;
};

/** Volcengine image model builder input. */
type VolcengineImageModelInput = {
  /** Provider settings entry. */
  provider: ProviderSettingEntry;
  /** Provider-specific model id. */
  modelId: string;
  /** Provider definition. */
  providerDefinition?: ProviderDefinition;
  /** Model definition. */
  modelDefinition?: ModelDefinition;
};

/** Resolved image file inputs. */
type ResolvedImageInputs = {
  /** Optional urls list. */
  imageUrls?: string[];
  /** Optional base64 list. */
  binaryDataBase64?: string[];
};

/** Parse Volcengine response or throw on errors. */
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

/** Convert ImageModelV3 file parts into Volcengine inputs. */
function resolveImageInputs(
  files?: ImageModelV3File[],
  mask?: ImageModelV3File,
): ResolvedImageInputs {
  const urlInputs: string[] = [];
  const base64Inputs: string[] = [];

  const pushFile = (file: ImageModelV3File) => {
    if (file.type === "url") {
      urlInputs.push(file.url);
      return;
    }
    // 中文注释：Uint8Array 需要转成 base64，字符串按 base64 处理。
    const data =
      typeof file.data === "string" ? file.data : Buffer.from(file.data).toString("base64");
    base64Inputs.push(data);
  };

  for (const file of files ?? []) {
    pushFile(file);
  }
  if (mask) {
    pushFile(mask);
  }

  if (urlInputs.length > 0 && base64Inputs.length > 0) {
    throw new Error("图像输入不能混用 URL 与二进制");
  }

  if (urlInputs.length > 0) {
    return { imageUrls: urlInputs };
  }

  if (base64Inputs.length > 0) {
    return { binaryDataBase64: base64Inputs };
  }

  return {};
}

/** Parse size string into width and height. */
function parseSize(size?: `${number}x${number}`): { width?: number; height?: number } {
  if (!size) return {};
  const [widthText, heightText] = size.split("x");
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return {};
  }
  return { width, height };
}

/** Build Volcengine image payload from AI SDK options. */
function buildVolcengineImagePayload(
  modelId: VolcengineImageModelId,
  options: ImageModelV3CallOptions,
): Record<string, unknown> {
  const reqKey = VOLCENGINE_IMAGE_REQ_KEYS[modelId];
  const { width, height } = parseSize(options.size);

  if (modelId === "volcengine.t2i.v40") {
    return {
      req_key: reqKey,
      prompt: options.prompt,
      width,
      height,
      seed: options.seed,
      ...resolveImageInputs(options.files?.slice(0, 1)),
      force_single: true,
    };
  }

  if (modelId === "volcengine.inpaint.v1") {
    // 中文注释：修复模式需要原图与 mask 两张图。
    const sourceFile = options.files?.[0];
    const fallbackMask = options.files?.[1];
    const { imageUrls, binaryDataBase64 } = resolveImageInputs(
      sourceFile ? [sourceFile] : undefined,
      options.mask ?? fallbackMask,
    );
    if ((imageUrls?.length ?? 0) < 2 && (binaryDataBase64?.length ?? 0) < 2) {
      throw new Error("Inpaint 需要原图与 mask");
    }
    return {
      req_key: reqKey,
      prompt: options.prompt,
      image_urls: imageUrls,
      binary_data_base64: binaryDataBase64,
      seed: options.seed,
    };
  }

  if (modelId === "volcengine.material.v1") {
    // 中文注释：素材提取只允许单张图片。
    const { imageUrls, binaryDataBase64 } = resolveImageInputs(options.files?.slice(0, 1));
    return {
      req_key: reqKey,
      image_urls: imageUrls,
      binary_data_base64: binaryDataBase64,
      image_edit_prompt: options.prompt,
      width,
      height,
      seed: options.seed,
    };
  }

  throw new Error("不支持的即梦模型");
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

/** Fetch Volcengine task result. */
async function fetchVolcengineImageResult(input: {
  /** Provider config. */
  config: ReturnType<typeof resolveVolcengineConfig>;
  /** Req key. */
  reqKey: string;
  /** Task id. */
  taskId: string;
  /** Abort signal. */
  abortSignal?: AbortSignal;
}) {
  const request = buildVolcengineRequest(input.config, VOLCENGINE_ACTION_RESULT, {
    req_key: input.reqKey,
    task_id: input.taskId,
  });
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
  const json = (await response.json()) as VolcengineResponse<VolcengineImageResult>;
  const data = unwrapVolcengineResponse(json);
  return {
    data,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

/** Wait until Volcengine task completes. */
async function waitForVolcengineImageResult(input: {
  /** Provider config. */
  config: ReturnType<typeof resolveVolcengineConfig>;
  /** Req key. */
  reqKey: string;
  /** Task id. */
  taskId: string;
  /** Abort signal. */
  abortSignal?: AbortSignal;
  /** Polling interval. */
  intervalMs?: number;
  /** Maximum attempts. */
  maxAttempts?: number;
}) {
  const intervalMs = input.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // 中文注释：每次轮询前检查取消信号，避免无效等待。
    if (input.abortSignal?.aborted) {
      throw new Error("请求已取消");
    }
    const result = await fetchVolcengineImageResult(input);
    const status = result.data?.status;
    if (status === "done") {
      return result;
    }
    if (status === "not_found" || status === "expired") {
      throw new Error(`任务状态异常: ${status ?? "unknown"}`);
    }
    // 中文注释：处理中继续轮询，默认每次间隔固定。
    await sleepWithAbort(intervalMs, input.abortSignal);
  }

  throw new Error("任务超时");
}

/** Build warnings for unsupported features. */
function buildWarnings(options: ImageModelV3CallOptions): SharedV3Warning[] {
  const warnings: SharedV3Warning[] = [];

  if (options.n > 1) {
    warnings.push({
      type: "unsupported",
      feature: "n",
      details: "即梦图像接口不支持单次多图输出，将忽略 n>1",
    });
  }

  if (options.aspectRatio) {
    warnings.push({
      type: "unsupported",
      feature: "aspectRatio",
      details: "即梦图像接口暂不支持 aspectRatio",
    });
  }

  if (Object.keys(options.providerOptions ?? {}).length > 0) {
    warnings.push({
      type: "unsupported",
      feature: "providerOptions",
      details: "即梦图像接口暂不支持 providerOptions",
    });
  }

  return warnings;
}

/** Volcengine image model implementation. */
class VolcengineImageModel implements ImageModelV3 {
  /** Specification version. */
  readonly specificationVersion = "v3";
  /** Provider name. */
  readonly provider = "volcengine";
  /** Model id. */
  readonly modelId: string;
  /** Max images per call. */
  readonly maxImagesPerCall = 1;

  /** Provider config. */
  private readonly config: ReturnType<typeof resolveVolcengineConfig>;

  /** Create model instance. */
  constructor(input: VolcengineImageModelInput) {
    this.modelId = input.modelId;
    this.config = resolveVolcengineConfig({
      provider: input.provider,
      providerDefinition: input.providerDefinition,
    });
  }

  /** Generate images via Volcengine tasks. */
  async doGenerate(options: ImageModelV3CallOptions) {
    const modelId = this.modelId as VolcengineImageModelId;
    const reqKey = VOLCENGINE_IMAGE_REQ_KEYS[modelId];
    if (!reqKey) {
      throw new Error("不支持的即梦模型");
    }
    const warnings = buildWarnings(options);
    const payload = buildVolcengineImagePayload(modelId, options);
    const submitRequest = buildVolcengineRequest(
      this.config,
      VOLCENGINE_ACTION_SUBMIT,
      payload,
    );

    const submitResponse = await fetch(submitRequest.url, {
      method: submitRequest.method,
      headers: submitRequest.headers,
      body: submitRequest.body,
      signal: options.abortSignal,
    });

    if (!submitResponse.ok) {
      const text = await submitResponse.text();
      throw new Error(`模型请求失败: ${submitResponse.status} ${text}`);
    }

    const submitJson = (await submitResponse.json()) as VolcengineResponse<{ task_id?: string }>;
    const submitData = unwrapVolcengineResponse(submitJson);
    const taskId = submitData?.task_id?.trim();
    if (!taskId) {
      throw new Error("提交任务失败：task_id 为空");
    }

    const result = await waitForVolcengineImageResult({
      config: this.config,
      reqKey,
      taskId,
      abortSignal: options.abortSignal,
    });

    const images = result.data?.binary_data_base64 ?? [];
    if (images.length === 0) {
      throw new Error("模型未返回图片结果");
    }

    const usage: ImageModelV3Usage | undefined = undefined;
    const providerMetadata: ImageModelV3ProviderMetadata | undefined = undefined;

    return {
      images,
      warnings,
      providerMetadata,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: result.headers,
      },
      usage,
    };
  }
}

/** Create Volcengine ImageModelV3 instance. */
export function buildVolcengineImageModel(
  input: VolcengineImageModelInput,
): ImageModelV3 | null {
  const modelId = input.modelId as VolcengineImageModelId;
  if (!VOLCENGINE_IMAGE_REQ_KEYS[modelId]) {
    return null;
  }
  return new VolcengineImageModel(input);
}
