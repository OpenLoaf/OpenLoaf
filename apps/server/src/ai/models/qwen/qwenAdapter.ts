import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderAdapter } from "@/ai/models/providerAdapters";
import { buildAiDebugFetch, ensureOpenAiCompatibleBaseUrl, readApiKey } from "@/ai/shared/util";

/** Qwen provider adapter (chat only). */
export const qwenAdapter: ProviderAdapter = {
  /** Adapter id. */
  id: "qwen",
  /** Build Qwen chat model via OpenAI-compatible endpoint. */
  buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
    const apiKey = readApiKey(provider.authConfig);
    const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
    const debugFetch = buildAiDebugFetch();
    // 中文注释：仅支持聊天模型，缺少配置直接返回 null。
    if (!apiKey || !resolvedApiUrl) return null;
    const openaiProvider = createOpenAI({
      baseURL: ensureOpenAiCompatibleBaseUrl(resolvedApiUrl),
      apiKey,
      fetch: debugFetch,
    });
    return openaiProvider.chat(modelId);
  },
};
