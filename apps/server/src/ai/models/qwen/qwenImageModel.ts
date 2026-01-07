import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import type { ModelDefinition, ProviderDefinition } from "@teatime-ai/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";
import { logger } from "@/common/logger";
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

/** Parse size string. */
function parseSize(value: string | undefined): { width?: number; height?: number } {
  if (!value) return {};
  const [widthRaw, heightRaw] = value.split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return {};
  return { width, height };
}

/** Build Qwen request input. */
function buildQwenRequestInput(options: ImageModelV3CallOptions): QwenRequestInput {
  const prompt = typeof options.prompt === "string" ? options.prompt : "";
  const size = parseSize(options.size);
  return {
    prompt,
    width: size.width,
    height: size.height,
    seed: options.seed,
  };
}

/** Normalize headers into a plain record. */
function toHeaderRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

/** Resolve image URL into binary data. */
async function resolveImageData(url: string, abortSignal?: AbortSignal): Promise<Uint8Array> {
  if (url.startsWith("data:")) {
    const base64 = url.split(",")[1] ?? "";
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const response = await fetch(url, { signal: abortSignal });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Qwen 图片下载失败: ${response.status} ${text}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
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

  /** Generate images via Qwen API. */
  async doGenerate(options: ImageModelV3CallOptions) {
    const config = resolveQwenConfig({
      provider: this.input.provider,
      providerDefinition: this.input.providerDefinition,
    });
    const requestInput = buildQwenRequestInput(options);
    const requestUrl = buildQwenRequestUrl(config.apiUrl);
    logger.debug(
      {
        modelId: this.modelId,
        providerId: this.input.provider.providerId,
        apiUrl: config.apiUrl,
        requestUrl,
        promptLength: requestInput.prompt?.length ?? 0,
        width: requestInput.width,
        height: requestInput.height,
        seed: requestInput.seed,
      },
      "[qwen] image request",
    );
    const payload = buildQwenRequestPayload(this.modelId, requestInput);
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
      output.imageUrls.map((url) =>
        resolveImageData(url, options.abortSignal),
      ),
    );
    const warnings: SharedV3Warning[] = [];
    const usage: ImageModelV3Usage | undefined = output.usage;

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

/** Build Qwen ImageModelV3. */
export function buildQwenImageModel(input: QwenImageModelInput): ImageModelV3 | null {
  return new QwenImageModel(input);
}

/** Filter out undefined header values. */
function filterHeaders(headers?: Record<string, string | undefined>): Record<string, string> {
  if (!headers) return {};
  const entries = Object.entries(headers).filter(([, value]) => typeof value === "string");
  return Object.fromEntries(entries) as Record<string, string>;
}
