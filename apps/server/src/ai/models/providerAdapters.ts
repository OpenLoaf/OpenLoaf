/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createAlibaba } from "@ai-sdk/alibaba";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createVercel } from "@ai-sdk/vercel";
import { createXai } from "@ai-sdk/xai";
import type { ModelDefinition, ProviderDefinition } from "@openloaf/api/common";
import { cliAdapter } from "@/ai/models/cli/cliAdapter";
import { qwenAdapter } from "@/ai/models/qwen/qwenAdapter";
import {
  buildAiDebugFetch,
  ensureOpenAiCompatibleBaseUrl,
  readApiKey,
} from "@/ai/shared/util";
import { getSessionId } from "@/ai/shared/context/requestContext";
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
const SAAS_ADAPTER_ID = "openloaf-saas";

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

/**
 * SaaS provider → AI SDK model factory 映射。
 * 根据模型的原始 provider 字段选择对应的 @ai-sdk/* SDK，
 * 确保各 provider 特有的消息格式（如 reasoning_content）被正确处理。
 */
const SAAS_PROVIDER_FACTORIES: Record<
  string,
  (opts: { baseURL: string; apiKey: string; fetch?: typeof fetch }) => (modelId: string) => LanguageModelV3
> = {
  anthropic: ({ baseURL, apiKey, fetch }) => createAnthropic({ baseURL, apiKey, fetch }),
  moonshot: ({ baseURL, apiKey, fetch }) => createMoonshotAI({ baseURL, apiKey, fetch }),
  moonshotai: ({ baseURL, apiKey, fetch }) => createMoonshotAI({ baseURL, apiKey, fetch }),
  "moonshotai-cn": ({ baseURL, apiKey, fetch }) => createMoonshotAI({ baseURL, apiKey, fetch }),
  deepseek: ({ baseURL, apiKey, fetch }) => createDeepSeek({ baseURL, apiKey, fetch }),
  google: ({ baseURL, apiKey, fetch }) => createGoogleGenerativeAI({ baseURL, apiKey, fetch }),
  xai: ({ baseURL, apiKey, fetch }) => createXai({ baseURL, apiKey, fetch }),
  grok: ({ baseURL, apiKey, fetch }) => createXai({ baseURL, apiKey, fetch }),
  alibaba: ({ baseURL, apiKey, fetch }) => createAlibaba({ baseURL, apiKey, fetch }),
  dashscope: ({ baseURL, apiKey, fetch }) => createAlibaba({ baseURL, apiKey, fetch }),
  qwen: ({ baseURL, apiKey, fetch }) => createAlibaba({ baseURL, apiKey, fetch }),
};

/**
 * 构建 SaaS 专用 fetch，自动注入 chatSessionId 到请求体。
 * SDK 0.1.9 新增：/api/v1/chat/completions 和 /api/v1/responses 支持可选 chatSessionId 字段。
 */
function buildSaasFetch(): typeof fetch {
  const debugFetch = buildAiDebugFetch();
  return async (input, init) => {
    const sessionId = getSessionId();
    if (sessionId && init?.body) {
      try {
        const bodyStr = typeof init.body === "string" ? init.body : String(init.body);
        const parsed = JSON.parse(bodyStr);
        parsed.chatSessionId = sessionId;
        init = { ...init, body: JSON.stringify(parsed) };
      } catch {
        // JSON 解析失败时不注入，保持原始请求
      }
    }
    return debugFetch(input, init);
  };
}

/** Build SaaS AI SDK adapter — 根据模型的 provider 字段路由到正确的 SDK。 */
function buildSaasAdapter(): ProviderAdapter {
  return {
    id: SAAS_ADAPTER_ID,
    buildAiSdkModel: ({ provider, modelId }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim();
      const saasFetch = buildSaasFetch();
      if (!apiKey || !resolvedApiUrl) return null;
      const baseURL = ensureOpenAiCompatibleBaseUrl(resolvedApiUrl);
      // 根据 provider.id（SaaS 模型的原始 provider，如 "moonshot"）选择对应 SDK。
      const factory = SAAS_PROVIDER_FACTORIES[provider.id];
      if (factory) {
        return factory({ baseURL, apiKey, fetch: saasFetch })(modelId);
      }
      // 未匹配的 provider 回退到 OpenAI chat completions。
      const openaiProvider = createOpenAI({ baseURL, apiKey, fetch: saasFetch });
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

/** Build OpenAI-compatible adapter (OpenAI + custom endpoints). */
function buildOpenAiAdapter(id: string): ProviderAdapter {
  return {
    id,
    buildAiSdkModel: ({ provider, modelId, providerDefinition }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
      const debugFetch = buildAiDebugFetch();
      if (!apiKey || !resolvedApiUrl) return null;
      const baseURL = provider.providerId === "custom"
        ? resolvedApiUrl.replace(/\/+$/, "")
        : ensureOpenAiCompatibleBaseUrl(resolvedApiUrl);
      const openaiProvider = createOpenAI({
        baseURL,
        apiKey,
        fetch: debugFetch,
      });
      const enableResponsesApi =
        provider.options?.enableResponsesApi ?? provider.providerId !== "custom";
      // 自定义服务商默认走 chat completions，启用时才使用 /responses。
      return enableResponsesApi ? openaiProvider(modelId) : openaiProvider.chat(modelId);
    },
  };
}

export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  openai: buildOpenAiAdapter("openai"),
  custom: buildOpenAiAdapter("custom"),
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
  "openloaf-saas": buildSaasAdapter(),
  cli: cliAdapter,
  "claude-code-cli": cliAdapter,
  "codex-cli": cliAdapter,
  qwen: qwenAdapter,
  dashscope: qwenAdapter,
  "openai-compatible": qwenAdapter,
};
