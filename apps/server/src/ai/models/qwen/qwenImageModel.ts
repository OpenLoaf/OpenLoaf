import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import type { ModelDefinition, ProviderDefinition } from "@tenas-ai/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";
import { logger } from "@/common/logger";
import { downloadImageData } from "@/ai/utils/image-download";
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

/** 解析 size 字符串。 */
function parseSize(value: string | undefined): { width?: number; height?: number } {
  if (!value) return {};
  const [widthRaw, heightRaw] = value.split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return {};
  return { width, height };
}

/** 构建 Qwen 请求参数。 */
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
