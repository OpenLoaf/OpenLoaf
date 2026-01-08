import { Buffer } from "node:buffer";
import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3File,
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

/** OpenAI compatible image generation path. */
const OPENAI_COMPATIBLE_GENERATE_PATH = "/images/generations";
/** OpenAI compatible image edit path. */
const OPENAI_COMPATIBLE_EDIT_PATH = "/images/edits";
/** Default image extension. */
const DEFAULT_IMAGE_EXTENSION = "png";

/** 过滤 undefined 的 headers。 */
function filterHeaders(headers?: Record<string, string | undefined>): Record<string, string> {
  if (!headers) return {};
  const entries = Object.entries(headers).filter(([, value]) => typeof value === "string");
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Resolve image extension from media type. */
function resolveImageExtension(mediaType?: string): string {
  if (!mediaType) return DEFAULT_IMAGE_EXTENSION;
  const normalized = mediaType.toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  return DEFAULT_IMAGE_EXTENSION;
}

/** Resolve image extension from URL. */
function resolveImageExtensionFromUrl(url: string): string {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  if (!match) return DEFAULT_IMAGE_EXTENSION;
  const ext = match[1]?.toLowerCase() ?? "";
  if (ext === "jpeg") return "jpg";
  return ext || DEFAULT_IMAGE_EXTENSION;
}

/** Resolve media type from extension. */
function resolveMediaTypeFromExtension(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "png") return "image/png";
  return "image/png";
}

/** Resolve file payload for multipart. */
async function resolveFilePayload(input: {
  file: ImageModelV3File;
  fallbackName: string;
  abortSignal?: AbortSignal;
}): Promise<{ blob: Blob; fileName: string }> {
  if (input.file.type === "url") {
    const response = await fetch(input.file.url, { signal: input.abortSignal });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`图片下载失败: ${response.status} ${text}`.trim());
    }
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const ext = contentType
      ? resolveImageExtension(contentType)
      : resolveImageExtensionFromUrl(input.file.url);
    const mediaType = contentType || resolveMediaTypeFromExtension(ext);
    return {
      blob: new Blob([buffer], { type: mediaType }),
      fileName: `${input.fallbackName}.${ext}`,
    };
  }
  const mediaType = input.file.mediaType || resolveMediaTypeFromExtension(DEFAULT_IMAGE_EXTENSION);
  const data =
    typeof input.file.data === "string"
      ? Buffer.from(input.file.data, "base64")
      : input.file.data;
  return {
    blob: new Blob([data], { type: mediaType }),
    fileName: `${input.fallbackName}.${resolveImageExtension(mediaType)}`,
  };
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
  // 中文注释：只匹配包含文本的内容项。
  const isTextContent = (
    item: { text?: string | null } | { image?: string | null }
  ): item is { text: string } => typeof (item as any)?.text === "string";
  const fallback = content.find(isTextContent)?.text;
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
    const hasEditInput = (options.files?.length ?? 0) > 0 || Boolean(options.mask);

    const apiKey = readApiKey(this.input.provider.authConfig);
    const apiUrl =
      this.input.provider.apiUrl.trim() || this.input.providerDefinition?.apiUrl?.trim() || "";
    if (!apiKey || !apiUrl) {
      throw new Error("OpenAI 兼容服务配置缺失");
    }

    const baseUrl = ensureOpenAiCompatibleBaseUrl(apiUrl);
    const requestUrl = `${baseUrl}${
      hasEditInput ? OPENAI_COMPATIBLE_EDIT_PATH : OPENAI_COMPATIBLE_GENERATE_PATH
    }`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      ...filterHeaders(options.headers),
    };
    let body: RequestInit["body"];
    let logBody: Record<string, unknown> | undefined;

    if (hasEditInput) {
      const sourceFile = options.files?.[0];
      if (!sourceFile) {
        throw new Error("图片编辑缺少原图");
      }
      const form = new FormData();
      form.append("model", this.modelId);
      form.append("prompt", prompt);
      form.append("n", String(options.n));
      if (options.size) form.append("size", options.size);
      form.append("response_format", "b64_json");
      // 图像编辑需要以 multipart 传递原图与 mask。
      const imagePayload = await resolveFilePayload({
        file: sourceFile,
        fallbackName: "image",
        abortSignal: options.abortSignal,
      });
      form.append("image", imagePayload.blob, imagePayload.fileName);
      logBody = {
        model: this.modelId,
        prompt,
        n: options.n,
        ...(options.size ? { size: options.size } : {}),
        response_format: "b64_json",
        image: {
          fileName: imagePayload.fileName,
          size: imagePayload.blob.size,
          type: imagePayload.blob.type || undefined,
        },
      };
      if (options.mask) {
        const maskPayload = await resolveFilePayload({
          file: options.mask,
          fallbackName: "mask",
          abortSignal: options.abortSignal,
        });
        form.append("mask", maskPayload.blob, maskPayload.fileName);
        logBody = {
          ...(logBody ?? {}),
          mask: {
            fileName: maskPayload.fileName,
            size: maskPayload.blob.size,
            type: maskPayload.blob.type || undefined,
          },
        };
      }
      delete headers["Content-Type"];
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      logBody = {
        model: this.modelId,
        prompt,
        n: options.n,
        ...(options.size ? { size: options.size } : {}),
        response_format: "b64_json",
        ...(options.providerOptions?.openai ?? {}),
      };
      body = JSON.stringify(logBody);
    }

    logger.debug(
      {
        modelId: this.modelId,
        providerId: this.input.provider.providerId,
        requestUrl,
        promptLength: prompt.length,
        size: options.size,
        hasEditInput,
        hasMask: Boolean(options.mask),
        // 记录请求 body，便于排查图片接口请求。
        body: logBody,
      },
      "[openai-compatible] image request",
    );

    const response = await this.fetcher(requestUrl, {
      method: "POST",
      headers,
      body,
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
