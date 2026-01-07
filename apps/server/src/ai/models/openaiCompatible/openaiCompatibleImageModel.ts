import { Buffer } from "node:buffer";
import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import type { ProviderDefinition } from "@teatime-ai/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";
import { logger } from "@/common/logger";
import { buildAiDebugFetch } from "@/ai/utils/ai-debug-fetch";
import { downloadImageData } from "@/ai/utils/image-download";
import { ensureOpenAiCompatibleBaseUrl } from "@/ai/utils/openai-url";
import { readApiKey } from "@/ai/utils/provider-auth";

type OpenAiCompatibleImageModelInput = {
  /** 服务商配置。 */
  provider: ProviderSettingEntry;
  /** 模型 ID。 */
  modelId: string;
  /** 服务商定义。 */
  providerDefinition?: ProviderDefinition;
  /** 自定义 fetch。 */
  fetch?: typeof fetch;
};

type OpenAiCompatibleImageItem = {
  /** base64 图片。 */
  b64_json?: string | null;
  /** 图片 URL。 */
  url?: string | null;
  /** 修订后的提示词。 */
  revised_prompt?: string | null;
};

type OpenAiCompatibleImageResponse = {
  /** 图片数组。 */
  data?: OpenAiCompatibleImageItem[] | null;
  /** 使用量。 */
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
  } | null;
  /** 扩展元数据。 */
  metadata?: {
    output?: {
      choices?: Array<{
        message?: {
          content?: Array<{ text?: string | null } | { image?: string | null }>;
        };
      }> | null;
      usage?: {
        input_tokens?: number | null;
        output_tokens?: number | null;
        total_tokens?: number | null;
      } | null;
    } | null;
  } | null;
};

/** 过滤 undefined 的 headers。 */
function filterHeaders(headers?: Record<string, string | undefined>): Record<string, string> {
  if (!headers) return {};
  const entries = Object.entries(headers).filter(([, value]) => typeof value === "string");
  return Object.fromEntries(entries) as Record<string, string>;
}

/** 解析 usage 信息。 */
function resolveUsage(payload: OpenAiCompatibleImageResponse): ImageModelV3Usage | undefined {
  const usage = payload.usage ?? payload.metadata?.output?.usage ?? undefined;
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens ?? undefined,
    outputTokens: usage.output_tokens ?? undefined,
    totalTokens: usage.total_tokens ?? undefined,
  };
}

/** 解析图片返回数据。 */
function resolveImageItems(payload: OpenAiCompatibleImageResponse): OpenAiCompatibleImageItem[] {
  const items = Array.isArray(payload.data) ? payload.data : [];
  return items.filter((item) => !!item);
}

/** 解析 revised prompt 列表。 */
function resolveRevisedPrompts(payload: OpenAiCompatibleImageResponse): string[] {
  const items = resolveImageItems(payload);
  const prompts = items
    .map((item) => (typeof item.revised_prompt === "string" ? item.revised_prompt.trim() : ""))
    .filter((prompt) => prompt.length > 0);
  if (prompts.length > 0) return prompts;

  const choices = payload.metadata?.output?.choices;
  const message = Array.isArray(choices) ? choices[0]?.message : undefined;
  const content = Array.isArray(message?.content) ? message.content : [];
  const fallback = content.find((item) => typeof item?.text === "string")?.text;
  const fallbackText = typeof fallback === "string" ? fallback.trim() : "";
  return fallbackText ? [fallbackText] : [];
}

class OpenAiCompatibleImageModel implements ImageModelV3 {
  readonly specificationVersion = "v3";
  readonly provider: string;
  readonly modelId: string;
  readonly maxImagesPerCall = 1;

  private readonly input: OpenAiCompatibleImageModelInput;
  private readonly fetcher: typeof fetch;

  constructor(input: OpenAiCompatibleImageModelInput) {
    this.input = input;
    this.provider = input.provider.providerId;
    this.modelId = input.modelId;
    this.fetcher = input.fetch ?? buildAiDebugFetch() ?? fetch;
  }

  /** 调用 OpenAI 兼容图片接口。 */
  async doGenerate(options: ImageModelV3CallOptions) {
    const prompt = typeof options.prompt === "string" ? options.prompt : "";
    if (!prompt) {
      throw new Error("图片生成缺少提示词");
    }
    if (options.files?.length || options.mask) {
      throw new Error("当前模型不支持图像编辑");
    }

    const apiKey = readApiKey(this.input.provider.authConfig);
    const apiUrl =
      this.input.provider.apiUrl.trim() || this.input.providerDefinition?.apiUrl?.trim() || "";
    if (!apiKey || !apiUrl) {
      throw new Error("OpenAI 兼容服务配置缺失");
    }

    const baseUrl = ensureOpenAiCompatibleBaseUrl(apiUrl);
    const requestUrl = `${baseUrl}/images/generations`;
    const body = {
      model: this.modelId,
      prompt,
      n: options.n,
      ...(options.size ? { size: options.size } : {}),
      response_format: "b64_json",
      ...(options.providerOptions?.openai ?? {}),
    };

    logger.debug(
      {
        modelId: this.modelId,
        providerId: this.input.provider.providerId,
        requestUrl,
        promptLength: prompt.length,
        size: options.size,
      },
      "[openai-compatible] image request",
    );

    const response = await this.fetcher(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...filterHeaders(options.headers),
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    logger.debug(
      {
        modelId: this.modelId,
        status: response.status,
        requestUrl,
      },
      "[openai-compatible] image response",
    );

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI 兼容图片请求失败: ${response.status} ${text}`.trim());
    }

    let payload: OpenAiCompatibleImageResponse;
    try {
      payload = JSON.parse(text) as OpenAiCompatibleImageResponse;
    } catch {
      throw new Error("OpenAI 兼容图片返回不是有效 JSON");
    }

    const items = resolveImageItems(payload);
    if (items.length === 0) {
      throw new Error("图片生成返回缺少数据");
    }

    const revisedPrompts = resolveRevisedPrompts(payload);
    const images = await Promise.all(
      items.map(async (item) => {
        const base64 = typeof item.b64_json === "string" ? item.b64_json.trim() : "";
        if (base64) {
          return new Uint8Array(Buffer.from(base64, "base64"));
        }
        const url = typeof item.url === "string" ? item.url.trim() : "";
        if (!url) {
          throw new Error("图片生成返回缺少 URL");
        }
        return downloadImageData(url, options.abortSignal);
      }),
    );

    const warnings: SharedV3Warning[] = [];
    const usage = resolveUsage(payload);
    const providerMetadata =
      revisedPrompts.length > 0
        ? {
            openai: {
              images: revisedPrompts.map((prompt) => ({ revisedPrompt: prompt })),
            },
          }
        : undefined;

    return {
      images,
      warnings,
      providerMetadata,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(response.headers.entries()),
      },
      usage,
    };
  }
}

/** 构建 OpenAI 兼容 ImageModelV3。 */
export function buildOpenAiCompatibleImageModel(
  input: OpenAiCompatibleImageModelInput,
): ImageModelV3 | null {
  const apiKey = readApiKey(input.provider.authConfig);
  const apiUrl =
    input.provider.apiUrl.trim() || input.providerDefinition?.apiUrl?.trim() || "";
  if (!apiKey || !apiUrl) return null;
  return new OpenAiCompatibleImageModel(input);
}
