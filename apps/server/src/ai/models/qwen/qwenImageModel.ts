import { Buffer } from "node:buffer";
import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3File,
  ImageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import type { ModelDefinition, ProviderDefinition } from "@tenas-ai/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";
import { logger } from "@/common/logger";
import { loadProjectImageBuffer } from "@/ai/services/image/attachmentResolver";
import { downloadImageData } from "@/ai/shared/util";
import { resolveQwenConfig } from "./qwenConfig";
import {
  buildQwenRequestPayload,
  buildQwenRequestUrl,
  parseQwenImageOutput,
  type QwenRequestInput,
} from "./qwenRequest";

type QwenImageModelInput = {
  /** Provider settings entry. */
  provider: ProviderSettingEntry;
  /** Target model id. */
  modelId: string;
  /** Model definition from registry. */
  modelDefinition?: ModelDefinition;
  /** Provider definition from registry. */
  providerDefinition?: ProviderDefinition;
};

/** data URL 前缀。 */
const DATA_URL_PREFIX = "data:";
/** HTTP/HTTPS url 匹配规则。 */
const HTTP_URL_REGEX = /^https?:\/\//i;

/** 解析 size 字符串。 */
function parseSize(value: string | undefined): { width?: number; height?: number } {
  if (!value) return {};
  const [widthRaw, heightRaw] = value.split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return {};
  return { width, height };
}

/** Check whether the url is http/https. */
function isHttpUrl(url: string): boolean {
  return HTTP_URL_REGEX.test(url);
}

/** Build a log-friendly body for Qwen requests. */
function buildQwenLogBody(payload: Record<string, unknown>): Record<string, unknown> {
  const model = typeof (payload as any).model === "string" ? (payload as any).model : undefined;
  const parameters =
    (payload as any).parameters && typeof (payload as any).parameters === "object"
      ? (payload as any).parameters
      : undefined;
  const input = (payload as any).input;
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  const sanitizedMessages = messages.map((message: any) => {
    const content = Array.isArray(message?.content) ? message.content : [];
    const sanitizedContent = content.map((item: any) => {
      if (item?.image && typeof item.image === "string") {
        const imageValue = item.image;
        if (imageValue.startsWith(DATA_URL_PREFIX)) {
          // 中文注释：base64 仅记录长度，避免日志过长。
          return { image: `[data-url:${imageValue.length}]` };
        }
        if (isHttpUrl(imageValue)) {
          return { image: imageValue };
        }
        return { image: `[image:${imageValue.length}]` };
      }
      if (item?.text && typeof item.text === "string") {
        return { text: item.text };
      }
      return item;
    });
    return {
      role: message?.role,
      content: sanitizedContent,
    };
  });
  return {
    ...(model ? { model } : {}),
    ...(sanitizedMessages.length > 0 ? { input: { messages: sanitizedMessages } } : {}),
    ...(parameters ? { parameters } : {}),
  };
}

/** Build a data url for Qwen image inputs. */
function buildDataUrl(mediaType: string, data: Uint8Array | Buffer | string): string {
  const base64 = typeof data === "string" ? data : Buffer.from(data).toString("base64");
  return `data:${mediaType};base64,${base64}`;
}

/** Check whether the input string is a relative path. */
function isRelativePath(value: string): boolean {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/** Resolve a file part into data url. */
function resolveFileDataUrl(file: ImageModelV3File): string {
  if (file.type === "url") {
    throw new Error("图片输入格式错误");
  }
  const mediaType = file.mediaType || "image/png";
  if (typeof file.data === "string") {
    const trimmed = file.data.trim();
    if (trimmed.startsWith(DATA_URL_PREFIX)) return trimmed;
    return buildDataUrl(mediaType, trimmed);
  }
  return buildDataUrl(mediaType, file.data);
}

/** Resolve non-http(s) url into data url. */
async function resolveLocalImageUrl(input: {
  /** Source url. */
  url: string;
  /** Abort signal. */
  abortSignal?: AbortSignal;
}): Promise<string> {
  const url = input.url.trim();
  if (isRelativePath(url)) {
    const payload = await loadProjectImageBuffer({ path: url });
    if (!payload) {
      throw new Error("图片读取失败");
    }
    return buildDataUrl(payload.mediaType, payload.buffer);
  }
  const data = await downloadImageData(url, input.abortSignal);
  return buildDataUrl("image/png", data);
}

/** Resolve Qwen image inputs in original order. */
async function resolveQwenImageInputs(options: ImageModelV3CallOptions): Promise<string[]> {
  const files = options.files ?? [];
  if (files.length === 0) return [];
  const resolved: string[] = [];
  for (const file of files) {
    if (file.type === "url") {
      const url = file.url.trim();
      if (!url) continue;
      // 中文注释：http(s) 直接透传，其余 URL 转成 data url。
      if (isHttpUrl(url) || url.startsWith(DATA_URL_PREFIX)) {
        resolved.push(url);
        continue;
      }
      resolved.push(await resolveLocalImageUrl({ url, abortSignal: options.abortSignal }));
      continue;
    }
    resolved.push(resolveFileDataUrl(file));
  }
  return resolved;
}

/** 构建 Qwen 请求参数。 */
async function buildQwenRequestInput(options: ImageModelV3CallOptions): Promise<QwenRequestInput> {
  const prompt = typeof options.prompt === "string" ? options.prompt : "";
  const size = parseSize(options.size);
  const images = await resolveQwenImageInputs(options);
  return {
    prompt,
    width: size.width,
    height: size.height,
    seed: options.seed,
    ...(images.length > 0 ? { imageUrls: images } : {}),
  };
}

/** 将 headers 归一化为普通对象。 */
function toHeaderRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

class QwenImageModel implements ImageModelV3 {
  readonly specificationVersion = "v3";
  readonly provider: string;
  readonly modelId: string;
  readonly maxImagesPerCall = 1;

  private readonly input: QwenImageModelInput;

  constructor(input: QwenImageModelInput) {
    this.input = input;
    this.provider = input.provider.providerId;
    this.modelId = input.modelId;
  }

  /** 调用 Qwen 图像接口。 */
  async doGenerate(options: ImageModelV3CallOptions) {
    const config = resolveQwenConfig({
      provider: this.input.provider,
      providerDefinition: this.input.providerDefinition,
    });
    const requestInput = await buildQwenRequestInput(options);
    const requestUrl = buildQwenRequestUrl(config.apiUrl);
    const payload = buildQwenRequestPayload(this.modelId, requestInput);
    logger.debug(
      {
        modelId: this.modelId,
        providerId: this.input.provider.providerId,
        apiUrl: config.apiUrl,
        requestUrl,
        promptLength: requestInput.prompt?.length ?? 0,
        imageCount: requestInput.imageUrls?.length ?? 0,
        width: requestInput.width,
        height: requestInput.height,
        seed: requestInput.seed,
        body: buildQwenLogBody(payload as Record<string, unknown>),
      },
      "[qwen] image request",
    );
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...filterHeaders(options.headers),
      },
      body: JSON.stringify(payload),
      signal: options.abortSignal,
    });
    logger.debug(
      {
        modelId: this.modelId,
        status: response.status,
        requestUrl,
      },
      "[qwen] image response",
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.error(
        {
          modelId: this.modelId,
          status: response.status,
          requestUrl,
          errorText: text,
        },
        "[qwen] image request failed",
      );
      throw new Error(`Qwen 请求失败: ${response.status} ${text}`);
    }

    const json = await response.json().catch(() => null);
    const output = parseQwenImageOutput(json);
    if (output.imageUrls.length === 0) {
      throw new Error("Qwen 返回缺少图片");
    }

    const images = await Promise.all(
      output.imageUrls.map((url) => downloadImageData(url, options.abortSignal)),
    );
    const warnings: SharedV3Warning[] = [];
    // 中文注释：usage 字段需完整三项，缺失时置空避免类型不匹配。
    const usage =
      output.usage &&
      typeof output.usage.inputTokens === "number" &&
      typeof output.usage.outputTokens === "number" &&
      typeof output.usage.totalTokens === "number"
        ? ({
            inputTokens: output.usage.inputTokens,
            outputTokens: output.usage.outputTokens,
            totalTokens: output.usage.totalTokens,
          } satisfies ImageModelV3Usage)
        : undefined;

    return {
      images,
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: toHeaderRecord(response.headers),
      },
      usage,
    };
  }
}

/** 构建 Qwen ImageModelV3。 */
export function buildQwenImageModel(input: QwenImageModelInput): ImageModelV3 | null {
  return new QwenImageModel(input);
}

/** 过滤掉 undefined 的 header。 */
function filterHeaders(headers?: Record<string, string | undefined>): Record<string, string> {
  if (!headers) return {};
  const entries = Object.entries(headers).filter(([, value]) => typeof value === "string");
  return Object.fromEntries(entries) as Record<string, string>;
}
