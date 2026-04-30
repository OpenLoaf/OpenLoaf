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
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";
import type {
  ModelDefinition,
  ModelReasoningCapability,
  ProviderDefinition,
} from "@openloaf/api/common";
import { cliAdapter } from "@/ai/models/cli/cliAdapter";
import { CODEX_CLI_PROVIDER_ID, CLAUDE_CODE_CLI_PROVIDER_ID } from "@/ai/models/cli/cliShared";
import { qwenAdapter } from "@/ai/models/qwen/qwenAdapter";
import {
  createQwenMultimodalMiddleware,
  wrapQwenMultimodalFetch,
} from "@/ai/models/qwen/qwenMultimodalMiddleware";
import {
  createDeepseekReasoningMiddleware,
  wrapDeepseekReasoningFetch,
} from "@/ai/models/deepseek/deepseekReasoningMiddleware";
import {
  buildAiDebugFetch,
  buildFinalUrlFetch,
  ensureOpenAiCompatibleBaseUrl,
  readApiKey,
  withUserAgentFetch,
} from "@/ai/shared/util";
import { getSessionId, getClientId, getRequestContext } from "@/ai/shared/context/requestContext";
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
      let debugFetch = buildAiDebugFetch();
      if (!apiKey || !resolvedApiUrl) return null;
      const useFinalUrl = provider.options?.finalApiUrl === true;
      debugFetch = withUserAgentFetch(debugFetch, provider.options?.customUserAgent);
      const finalFetch = useFinalUrl ? buildFinalUrlFetch(resolvedApiUrl, debugFetch) : debugFetch;
      return factory({ apiUrl: resolvedApiUrl, apiKey, fetch: finalFetch })(modelId);
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

type SaasFactoryOpts = {
  baseURL: string;
  apiKey: string;
  fetch?: typeof fetch;
  /** 模型的 reasoning 能力（v3 capabilities），用于选择性启用 thinking 协议。 */
  reasoning?: ModelReasoningCapability;
};

/**
 * Moonshot 系模型按 v3 reasoning 字段注入 providerOptions。
 *
 * - `always`：模型固定开启思考，请求需带 thinking + reasoningHistory='interleaved'，
 *   否则多轮 tool call 会被 "reasoning_content is missing" 400 拒绝。
 * - `optional`：支持思考但我们当前不消费 reasoning_content 持久化链路，
 *   统一 reasoningHistory='disabled' 关掉协议，避免二轮 400。
 * - `none` / 缺失：不注入，沿用 SDK 默认（无思考）。
 */
function wrapMoonshotWithReasoning(
  model: LanguageModelV3,
  reasoning: ModelReasoningCapability | undefined,
): LanguageModelV3 {
  if (reasoning !== "always" && reasoning !== "optional") return model;
  const moonshotOpts =
    reasoning === "always"
      ? { thinking: { type: "enabled" }, reasoningHistory: "interleaved" }
      : { reasoningHistory: "disabled" };
  return wrapLanguageModel({
    model,
    middleware: defaultSettingsMiddleware({
      settings: { providerOptions: { moonshotai: moonshotOpts } },
    }),
  }) as unknown as LanguageModelV3;
}

/**
 * DeepSeek 思考模式（OL-TX-012/013 等 V3.1+/V4 hybrid，capability `reasoning='always'|'optional'`）：
 * `@ai-sdk/deepseek` 的默认 messages 转换器会剥光历史 assistant.reasoning，
 * 与 DeepSeek 服务端"reasoning_content 必须回传"硬约束冲突 → 多轮 + 工具调用 400。
 * 详细背景见 `deepseekReasoningMiddleware.ts` 顶部注释。
 *
 * 触发条件：仅 reasoning ∈ {always, optional}。其他 deepseek 模型（如 reasoning='none'
 * 的非思考变体）走原 createDeepSeek 路径，零行为变化。
 */
function wrapDeepSeekFactory({ baseURL, apiKey, fetch, reasoning }: SaasFactoryOpts) {
  if (reasoning !== "always" && reasoning !== "optional") {
    return (modelId: string): LanguageModelV3 => createDeepSeek({ baseURL, apiKey, fetch })(modelId);
  }
  const realFetch = fetch ?? (globalThis.fetch as typeof globalThis.fetch);
  const wrappedFetch = wrapDeepseekReasoningFetch(realFetch);
  const provider = createDeepSeek({ baseURL, apiKey, fetch: wrappedFetch });
  return (modelId: string): LanguageModelV3 =>
    wrapLanguageModel({
      model: provider(modelId),
      middleware: createDeepseekReasoningMiddleware(),
    }) as unknown as LanguageModelV3;
}

/**
 * Qwen / 阿里百炼系模型：在 SDK 默认 messages 转换器不支持 video/audio 的场景下，
 * 用 transformParams middleware 把 video/audio file part 改成占位文本，
 * 再用自定义 fetch 在 HTTP body 层把占位还原成 video_url / input_audio。
 *
 * 命中模型：任何 providerId ∈ { qwen, dashscope, alibaba } 的 SaaS 或直连模型。
 */
function wrapAlibabaFactory({ baseURL, apiKey, fetch }: SaasFactoryOpts) {
  const realFetch = fetch ?? (globalThis.fetch as typeof globalThis.fetch);
  const provider = createAlibaba({ baseURL, apiKey, fetch: wrapQwenMultimodalFetch(realFetch) });
  return (modelId: string): LanguageModelV3 =>
    wrapLanguageModel({ model: provider(modelId), middleware: createQwenMultimodalMiddleware() });
}

/**
 * SaaS provider → AI SDK model factory 映射。
 * 根据模型的原始 provider 字段选择对应的 @ai-sdk/* SDK，
 * 确保各 provider 特有的消息格式（如 reasoning_content）被正确处理。
 */
const SAAS_PROVIDER_FACTORIES: Record<
  string,
  (opts: SaasFactoryOpts) => (modelId: string) => LanguageModelV3
> = {
  anthropic: ({ baseURL, apiKey, fetch }) => createAnthropic({ baseURL, apiKey, fetch }),
  moonshot: ({ baseURL, apiKey, fetch, reasoning }) => {
    const provider = createMoonshotAI({ baseURL, apiKey, fetch });
    return (modelId) => wrapMoonshotWithReasoning(provider(modelId), reasoning);
  },
  moonshotai: ({ baseURL, apiKey, fetch, reasoning }) => {
    const provider = createMoonshotAI({ baseURL, apiKey, fetch });
    return (modelId) => wrapMoonshotWithReasoning(provider(modelId), reasoning);
  },
  "moonshotai-cn": ({ baseURL, apiKey, fetch, reasoning }) => {
    const provider = createMoonshotAI({ baseURL, apiKey, fetch });
    return (modelId) => wrapMoonshotWithReasoning(provider(modelId), reasoning);
  },
  kimi: ({ baseURL, apiKey, fetch, reasoning }) => {
    const provider = createMoonshotAI({ baseURL, apiKey, fetch });
    return (modelId) => wrapMoonshotWithReasoning(provider(modelId), reasoning);
  },
  deepseek: wrapDeepSeekFactory,
  google: ({ baseURL, apiKey, fetch }) => createGoogleGenerativeAI({ baseURL, apiKey, fetch }),
  xai: ({ baseURL, apiKey, fetch }) => createXai({ baseURL, apiKey, fetch }),
  grok: ({ baseURL, apiKey, fetch }) => createXai({ baseURL, apiKey, fetch }),
  alibaba: wrapAlibabaFactory,
  dashscope: wrapAlibabaFactory,
  qwen: wrapAlibabaFactory,
};

/**
 * 构建 SaaS 专用 fetch，自动注入客户端元数据到请求体。
 * SDK 0.1.10：chatSessionId、clientId、serverVersion、webVersion、desktopVersion。
 */
function buildSaasFetch(): typeof fetch {
  const debugFetch = buildAiDebugFetch();
  return async (input, init) => {
    if (init?.body) {
      try {
        const bodyStr = typeof init.body === "string" ? init.body : String(init.body);
        const parsed = JSON.parse(bodyStr);
        const ctx = getRequestContext();
        const sessionId = ctx?.sessionId;
        const clientId = ctx?.clientId;
        if (sessionId) parsed.chatSessionId = sessionId;
        if (clientId) parsed.clientId = clientId;
        if (ctx?.serverVersion) parsed.serverVersion = ctx.serverVersion;
        if (ctx?.webVersion) parsed.webVersion = ctx.webVersion;
        if (ctx?.desktopVersion) parsed.desktopVersion = ctx.desktopVersion;
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
    buildAiSdkModel: ({ provider, modelId, modelDefinition }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim();
      let saasFetch: typeof fetch = buildSaasFetch();
      if (!apiKey || !resolvedApiUrl) return null;
      const useFinalUrl = provider.options?.finalApiUrl === true;
      const baseURL = useFinalUrl ? resolvedApiUrl : ensureOpenAiCompatibleBaseUrl(resolvedApiUrl);
      saasFetch = withUserAgentFetch(saasFetch, provider.options?.customUserAgent);
      const finalFetch = useFinalUrl ? buildFinalUrlFetch(resolvedApiUrl, saasFetch) : saasFetch;
      const factory = SAAS_PROVIDER_FACTORIES[provider.id];
      if (factory) {
        return factory({
          baseURL,
          apiKey,
          fetch: finalFetch,
          reasoning: modelDefinition?.reasoning,
        })(modelId);
      }
      const openaiProvider = createOpenAI({ baseURL, apiKey, fetch: finalFetch });
      return openaiProvider.chat(modelId);
    },
  };
}

/**
 * Build direct-path DeepSeek adapter — 与 SaaS 路径同样按 `modelDefinition.reasoning`
 * 决定是否注入 reasoning_content 回填，避免直连 DeepSeek 思考模型时被 400。
 */
function buildDeepseekAdapter(): ProviderAdapter {
  return {
    id: "deepseek",
    buildAiSdkModel: ({ provider, modelId, modelDefinition, providerDefinition }) => {
      const apiKey = readApiKey(provider.authConfig);
      const resolvedApiUrl = provider.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || "";
      if (!apiKey || !resolvedApiUrl) return null;
      let debugFetch = buildAiDebugFetch();
      debugFetch = withUserAgentFetch(debugFetch, provider.options?.customUserAgent);
      const useFinalUrl = provider.options?.finalApiUrl === true;
      const baseURL = useFinalUrl
        ? resolvedApiUrl.replace(/\/+$/, "")
        : ensureOpenAiCompatibleBaseUrl(resolvedApiUrl);
      const finalFetch = useFinalUrl ? buildFinalUrlFetch(resolvedApiUrl, debugFetch) : debugFetch;
      const reasoning = modelDefinition?.reasoning;
      if (reasoning !== "always" && reasoning !== "optional") {
        return createDeepSeek({ baseURL, apiKey, fetch: finalFetch })(modelId);
      }
      const wrappedFetch = wrapDeepseekReasoningFetch(finalFetch);
      const dsProvider = createDeepSeek({ baseURL, apiKey, fetch: wrappedFetch });
      return wrapLanguageModel({
        model: dsProvider(modelId),
        middleware: createDeepseekReasoningMiddleware(),
      }) as unknown as LanguageModelV3;
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
      const debugFetch = withUserAgentFetch(buildAiDebugFetch(), provider.options?.customUserAgent);
      const region = resolveBedrockRegion(resolvedApiUrl);
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
      let debugFetch = buildAiDebugFetch();
      if (!apiKey || !resolvedApiUrl) return null;
      debugFetch = withUserAgentFetch(debugFetch, provider.options?.customUserAgent);
      const useFinalUrl = provider.options?.finalApiUrl === true;
      const baseURL = useFinalUrl
        ? resolvedApiUrl.replace(/\/+$/, "")
        : provider.providerId === "custom"
          ? resolvedApiUrl.replace(/\/+$/, "")
          : ensureOpenAiCompatibleBaseUrl(resolvedApiUrl);
      const finalFetch = useFinalUrl ? buildFinalUrlFetch(resolvedApiUrl, debugFetch) : debugFetch;
      const openaiProvider = createOpenAI({
        baseURL,
        apiKey,
        fetch: finalFetch,
      });
      const enableResponsesApi =
        provider.options?.enableResponsesApi ?? provider.providerId !== "custom";
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
  deepseek: buildDeepseekAdapter(),
  xai: buildAiSdkAdapter("xai", ({ apiUrl, apiKey, fetch }) =>
    createXai({ baseURL: ensureOpenAiCompatibleBaseUrl(apiUrl), apiKey, fetch }),
  ),
  "openloaf-saas": buildSaasAdapter(),
  cli: cliAdapter,
  [CLAUDE_CODE_CLI_PROVIDER_ID]: cliAdapter,
  [CODEX_CLI_PROVIDER_ID]: cliAdapter,
  qwen: qwenAdapter,
  dashscope: qwenAdapter,
  "openai-compatible": qwenAdapter,
};
