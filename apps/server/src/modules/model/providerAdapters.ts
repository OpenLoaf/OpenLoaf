import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { ModelDefinition, ProviderDefinition } from "@teatime-ai/api/common";
import { qwenAdapter } from "@/ai/models/qwen/qwenAdapter";
import { volcengineAdapter } from "@/ai/models/volcengine/volcengineAdapter";
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
  /** Build custom HTTP request when AI SDK is unavailable. */
  buildRequest: (input: AdapterInput & { input: ProviderRequestInput }) => ProviderRequest | null;
};

/** Read apiKey from auth config. */
function readApiKey(authConfig: Record<string, unknown>) {
  const apiKey = authConfig.apiKey;
  // 中文注释：仅当 apiKey 为字符串时才视为有效。
  return typeof apiKey === "string" ? apiKey.trim() : "";
}

/** Build a simple AI SDK adapter for apiKey providers. */
function buildAiSdkAdapter(
  id: string,
  factory: (input: { apiUrl: string; apiKey: string }) => (modelId: string) => LanguageModelV3,
): ProviderAdapter {
  return {
    id,
    buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
      // 中文注释：auth 或 apiUrl 缺失时直接返回 null，交由上层判定失败。
      if (!apiKey || !resolvedApiUrl) return null;
      return factory({ apiUrl: resolvedApiUrl, apiKey })(modelId);
    },
    buildRequest: () => null,
  };
}

export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  openai: buildAiSdkAdapter("openai", ({ apiUrl, apiKey }) =>
    createOpenAI({ baseURL: apiUrl, apiKey }),
  ),
  anthropic: buildAiSdkAdapter("anthropic", ({ apiUrl, apiKey }) =>
    createAnthropic({ baseURL: apiUrl, apiKey }),
  ),
  google: buildAiSdkAdapter("google", ({ apiUrl, apiKey }) =>
    createGoogleGenerativeAI({ baseURL: apiUrl, apiKey }),
  ),
  deepseek: buildAiSdkAdapter("deepseek", ({ apiUrl, apiKey }) =>
    createDeepSeek({ baseURL: apiUrl, apiKey }),
  ),
  xai: buildAiSdkAdapter("xai", ({ apiUrl, apiKey }) => createXai({ baseURL: apiUrl, apiKey })),
  qwenAdapter,
  volcengine: volcengineAdapter,
};
