import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createVercel } from "@ai-sdk/vercel";
import { createXai } from "@ai-sdk/xai";
import type { ModelDefinition, ProviderDefinition } from "@tenas-ai/api/common";
import { cliAdapter } from "@/ai/models/cli/cliAdapter";
import { qwenAdapter } from "@/ai/models/qwen/qwenAdapter";
import {
  buildAiDebugFetch,
  ensureOpenAiCompatibleBaseUrl,
  readApiKey,
} from "@/ai/shared/util";
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

type BedrockAuth = {
  /** Bearer token for Bedrock. */
  apiKey: string;
  /** AWS access key id. */
  accessKeyId: string;
  /** AWS secret access key. */
  secretAccessKey: string;
  /** AWS session token. */
  sessionToken: string;
};

/** SaaS adapter id. */
const SAAS_ADAPTER_ID = "tenas-saas";

export type ProviderAdapter = {
  id: string;
  /** Build AI SDK model for chat. */
  buildAiSdkModel: (input: AdapterInput) => LanguageModelV3 | null;
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
  };
}

/** Read Amazon Bedrock auth config. */
function readBedrockAuth(authConfig: Record<string, unknown>): BedrockAuth {
  const apiKey = typeof authConfig.apiKey === "string" ? authConfig.apiKey.trim() : "";
  const accessKeyId =
    typeof authConfig.accessKeyId === "string" ? authConfig.accessKeyId.trim() : "";
  const secretAccessKey =
    typeof authConfig.secretAccessKey === "string" ? authConfig.secretAccessKey.trim() : "";
  const sessionToken =
    typeof authConfig.sessionToken === "string" ? authConfig.sessionToken.trim() : "";
  return { apiKey, accessKeyId, secretAccessKey, sessionToken };
}

/** Resolve Bedrock region from API URL. */
function resolveBedrockRegion(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (!trimmed) return "";
  try {
    const host = new URL(trimmed).host;
    const match = host.match(/bedrock-runtime[.-]([a-z0-9-]+)\./i);
    return match?.[1] ?? "";
  } catch {
    // 逻辑：URL 解析失败时回退空值，避免抛错影响模型构建。
    return "";
  }
}

/** Build SaaS AI SDK adapter (OpenAI compatible). */
function buildSaasAdapter(): ProviderAdapter {
  return {
    id: SAAS_ADAPTER_ID,
    buildAiSdkModel: ({ provider, modelId }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim();
      const debugFetch = buildAiDebugFetch();
      // 中文注释：SaaS 必须带 token 与固定 apiUrl。
      if (!apiKey || !resolvedApiUrl) return null;
      const openaiProvider = createOpenAI({
        baseURL: ensureOpenAiCompatibleBaseUrl(resolvedApiUrl),
        apiKey,
        fetch: debugFetch,
      });
      return openaiProvider.chat(modelId);
    },
  };
}

/** Build Amazon Bedrock adapter. */
function buildBedrockAdapter(): ProviderAdapter {
  return {
    id: "amazon-bedrock",
    buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
      const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
      const { apiKey, accessKeyId, secretAccessKey, sessionToken } = readBedrockAuth(
        provider.authConfig,
      );
      const debugFetch = buildAiDebugFetch();
      const region = resolveBedrockRegion(resolvedApiUrl);
      // 逻辑：Bedrock 必须提供 apiUrl，且需要 apiKey 或 AK/SK。
      if (!resolvedApiUrl) return null;
      if (!apiKey && (!accessKeyId || !secretAccessKey)) return null;
      const bedrockProvider = createAmazonBedrock({
        baseURL: resolvedApiUrl,
        region: region || undefined,
        apiKey: apiKey || undefined,
        accessKeyId: accessKeyId || undefined,
        secretAccessKey: secretAccessKey || undefined,
        sessionToken: sessionToken || undefined,
        fetch: debugFetch,
      });
      return bedrockProvider(modelId);
    },
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
  },
  anthropic: buildAiSdkAdapter("anthropic", ({ apiUrl, apiKey, fetch }) =>
    createAnthropic({ baseURL: apiUrl, apiKey, fetch }),
  ),
  moonshot: buildAiSdkAdapter("moonshot", ({ apiUrl, apiKey, fetch }) =>
    createMoonshotAI({ baseURL: apiUrl, apiKey, fetch }),
  ),
  vercel: buildAiSdkAdapter("vercel", ({ apiUrl, apiKey, fetch }) =>
    createVercel({ baseURL: apiUrl, apiKey, fetch }),
  ),
  "amazon-bedrock": buildBedrockAdapter(),
  google: buildAiSdkAdapter("google", ({ apiUrl, apiKey, fetch }) =>
    createGoogleGenerativeAI({ baseURL: apiUrl, apiKey, fetch }),
  ),
  deepseek: buildAiSdkAdapter("deepseek", ({ apiUrl, apiKey, fetch }) =>
    createDeepSeek({ baseURL: ensureOpenAiCompatibleBaseUrl(apiUrl), apiKey, fetch }),
  ),
  xai: buildAiSdkAdapter("xai", ({ apiUrl, apiKey, fetch }) =>
    createXai({ baseURL: ensureOpenAiCompatibleBaseUrl(apiUrl), apiKey, fetch }),
  ),
  "tenas-saas": buildSaasAdapter(),
  cli: cliAdapter,
  qwen: qwenAdapter,
  dashscope: qwenAdapter,
  "openai-compatible": qwenAdapter,
};
