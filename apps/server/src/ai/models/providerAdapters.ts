import type { ImageModelV3, LanguageModelV3 } from "@ai-sdk/provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { ModelDefinition, ProviderDefinition } from "@tenas-ai/api/common";
import { buildOpenAiCompatibleImageModel } from "@/ai/models/openaiCompatible/openaiCompatibleImageModel";
import { qwenAdapter } from "@/ai/models/qwen/qwenAdapter";
import { volcengineAdapter } from "@/ai/models/volcengine/volcengineAdapter";
import { cliAdapter } from "@/ai/models/cli/cliAdapter";
import { buildAiDebugFetch } from "@/ai/utils/ai-debug-fetch";
import { ensureOpenAiCompatibleBaseUrl } from "@/ai/utils/openai-url";
import { readApiKey } from "@/ai/utils/provider-auth";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";

type AdapterInput = {
  /** Provider config entry. */
  provider: ProviderSettingEntry;
  /** Selected model id. */
  modelId: string;
  /** Model definition from registry. */
  modelDefinition?: ModelDefinition;
  /** Provider definition from registry. */
  providerDefinition?: ProviderDefinition;
};

export type TextToImageInput = {
  /** Prompt text. */
  prompt: string;
  /** Optional image URLs. */
  imageUrls?: string[];
  /** Optional size payload. */
  size?: number;
  /** Optional width. */
  width?: number;
  /** Optional height. */
  height?: number;
  /** Optional scale. */
  scale?: number;
  /** Optional single-image hint. */
  forceSingle?: boolean;
  /** Optional min ratio. */
  minRatio?: number;
  /** Optional max ratio. */
  maxRatio?: number;
  /** Optional seed. */
  seed?: number;
};

export type InpaintInput = {
  /** Image URLs. */
  imageUrls?: string[];
  /** Base64 images. */
  binaryDataBase64?: string[];
  /** Prompt text. */
  prompt: string;
  /** Optional seed. */
  seed?: number;
};

export type MaterialExtractInput = {
  /** Image URLs. */
  imageUrls?: string[];
  /** Base64 images. */
  binaryDataBase64?: string[];
  /** Edit prompt. */
  imageEditPrompt: string;
  /** Optional lora weight. */
  loraWeight?: number;
  /** Optional width. */
  width?: number;
  /** Optional height. */
  height?: number;
  /** Optional seed. */
  seed?: number;
};

export type VideoGenerateInput = {
  /** Prompt text. */
  prompt?: string;
  /** Image URLs. */
  imageUrls?: string[];
  /** Base64 images. */
  binaryDataBase64?: string[];
  /** Optional seed. */
  seed?: number;
  /** Optional frame count. */
  frames?: number;
  /** Optional aspect ratio. */
  aspectRatio?: string;
};

export type ProviderRequestInput =
  | { kind: "textToImage"; payload: TextToImageInput }
  | { kind: "inpaint"; payload: InpaintInput }
  | { kind: "materialExtract"; payload: MaterialExtractInput }
  | { kind: "videoGenerate"; payload: VideoGenerateInput };

export type ProviderTaskResult = {
  /** Task id returned by provider. */
  taskId: string;
};

export type ProviderRequest = {
  /** Request url. */
  url: string;
  /** HTTP method. */
  method: "POST" | "GET";
  /** Request headers. */
  headers: Record<string, string>;
  /** Request body. */
  body?: string;
  /** Parse response into task result. */
  parseResponse: (response: Response) => Promise<ProviderTaskResult>;
};

export type ProviderAdapter = {
  id: string;
  /** Build AI SDK model for chat. */
  buildAiSdkModel: (input: AdapterInput) => LanguageModelV3 | null;
  /** Build AI SDK model for image generation. */
  buildImageModel: (input: AdapterInput) => ImageModelV3 | null;
  /** Build custom HTTP request when AI SDK is unavailable. */
  buildRequest: (input: AdapterInput & { input: ProviderRequestInput }) => ProviderRequest | null;
};

/** 构建基于 apiKey 的 AI SDK 适配器。 */
function buildAiSdkAdapter(
  id: string,
  factory: (input: { apiUrl: string; apiKey: string; fetch?: typeof fetch }) => (modelId: string) => LanguageModelV3,
): ProviderAdapter {
  return {
    id,
    buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
      const debugFetch = buildAiDebugFetch();
      // auth 或 apiUrl 缺失时直接返回 null，交由上层判定失败。
      if (!apiKey || !resolvedApiUrl) return null;
      return factory({ apiUrl: resolvedApiUrl, apiKey, fetch: debugFetch })(modelId);
    },
    buildImageModel: () => null,
    buildRequest: () => null,
  };
}

export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  openai: {
    id: "openai",
    buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
      const debugFetch = buildAiDebugFetch();
      if (!apiKey || !resolvedApiUrl) return null;
      const openaiProvider = createOpenAI({
        baseURL: ensureOpenAiCompatibleBaseUrl(resolvedApiUrl),
        apiKey,
        fetch: debugFetch,
      });
      const enableResponsesApi =
        provider.options?.enableResponsesApi ?? provider.providerId !== "custom";
      // 自定义服务商默认走 chat completions，启用时才使用 /responses。
      return enableResponsesApi ? openaiProvider(modelId) : openaiProvider.chat(modelId);
    },
    buildImageModel: ({ provider, modelId, providerDefinition }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
      const debugFetch = buildAiDebugFetch();
      if (!apiKey || !resolvedApiUrl) return null;
      if (provider.providerId === "custom") {
        return buildOpenAiCompatibleImageModel({
          provider,
          modelId,
          providerDefinition,
          fetch: debugFetch,
        });
      }
      const openaiProvider = createOpenAI({
        baseURL: ensureOpenAiCompatibleBaseUrl(resolvedApiUrl),
        apiKey,
        fetch: debugFetch,
      });
      return openaiProvider.image(modelId);
    },
    buildRequest: () => null,
  },
  anthropic: buildAiSdkAdapter("anthropic", ({ apiUrl, apiKey, fetch }) =>
    createAnthropic({ baseURL: apiUrl, apiKey, fetch }),
  ),
  google: buildAiSdkAdapter("google", ({ apiUrl, apiKey, fetch }) =>
    createGoogleGenerativeAI({ baseURL: apiUrl, apiKey, fetch }),
  ),
  deepseek: buildAiSdkAdapter("deepseek", ({ apiUrl, apiKey, fetch }) =>
    createDeepSeek({ baseURL: ensureOpenAiCompatibleBaseUrl(apiUrl), apiKey, fetch }),
  ),
  xai: buildAiSdkAdapter("xai", ({ apiUrl, apiKey, fetch }) =>
    createXai({ baseURL: ensureOpenAiCompatibleBaseUrl(apiUrl), apiKey, fetch }),
  ),
  cli: cliAdapter,
  qwenAdapter,
  volcengine: volcengineAdapter,
};
