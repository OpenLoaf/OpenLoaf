import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { ModelDefinition, ProviderDefinition } from "@teatime-ai/api/common";
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

export type ProviderAdapter = {
  id: string;
  /** Build AI SDK model for chat. */
  buildAiSdkModel: (input: AdapterInput) => LanguageModelV3 | null;
  /** Build custom HTTP request when AI SDK is unavailable. */
  buildRequest: (input: AdapterInput & { input: unknown }) => null;
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
  // 中文注释：Qwen 图像模型走专用 API，本阶段不提供 AI SDK 模型。
  qwenAdapter: {
    id: "qwenAdapter",
    buildAiSdkModel: () => null,
    buildRequest: () => null,
  },
};
