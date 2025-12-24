import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { getProviderSettings, type ProviderSettingEntry } from "@/modules/settings/settingsService";
import type { ModelDefinition } from "@teatime-ai/api/common";

type ResolvedChatModel = {
  model: LanguageModelV3;
  modelInfo: { provider: string; modelId: string };
  chatModelId: string;
  modelDefinition: ModelDefinition;
};

const MAX_FALLBACK_TRIES = 2;

const PROVIDER_FACTORIES: Record<
  string,
  (input: { apiUrl: string; apiKey: string }) => (modelId: string) => LanguageModelV3
> = {
  openai: ({ apiUrl, apiKey }) => createOpenAI({ baseURL: apiUrl, apiKey }),
  anthropic: ({ apiUrl, apiKey }) => createAnthropic({ baseURL: apiUrl, apiKey }),
  deepseek: ({ apiUrl, apiKey }) => createDeepSeek({ baseURL: apiUrl, apiKey }),
  xai: ({ apiUrl, apiKey }) => createXai({ baseURL: apiUrl, apiKey }),
};

/** Resolve model definition from provider settings. */
function resolveModelDefinition(
  provider: ProviderSettingEntry,
  modelId: string,
): ModelDefinition {
  // 中文注释：模型定义必须来自设置配置，缺失则视为无效模型。
  const modelDefinition = provider.modelDefinitions.find((model) => model.id === modelId);
  if (!modelDefinition) throw new Error("模型定义缺失");
  return modelDefinition;
}

/** Normalize chatModelId input. */
function normalizeChatModelId(raw?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Parse chatModelId into provider key and model id. */
function parseChatModelId(chatModelId: string): { providerKey: string; modelId: string } | null {
  const separatorIndex = chatModelId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= chatModelId.length - 1) return null;
  const providerKey = chatModelId.slice(0, separatorIndex).trim();
  const modelId = chatModelId.slice(separatorIndex + 1).trim();
  if (!providerKey || !modelId) return null;
  return { providerKey, modelId };
}

/** Build chatModelId candidates from provider settings. */
function buildChatModelCandidates(
  providers: ProviderSettingEntry[],
  exclude?: string | null,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    for (const modelId of provider.modelIds) {
      const chatModelId = `${provider.key}:${modelId}`;
      if (exclude && chatModelId === exclude) continue;
      if (seen.has(chatModelId)) continue;
      seen.add(chatModelId);
      candidates.push(chatModelId);
    }
  }

  return candidates;
}

/** Resolve chat model from candidates with fallback attempts. */
export async function resolveChatModel(input: {
  chatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const normalized = normalizeChatModelId(input.chatModelId);
  const providers = await getProviderSettings();
  const providerByKey = new Map(providers.map((entry) => [entry.key, entry]));

  // 中文注释：流程=生成候选列表 -> 顺序解析/创建模型 -> 失败后按次数 fallback。
  const fallbackCandidates = buildChatModelCandidates(providers, normalized);
  // 中文注释：auto 时默认取最近更新的模型，失败时再依次尝试 fallback。
  const candidates = normalized
    ? [normalized, ...fallbackCandidates.slice(0, MAX_FALLBACK_TRIES)]
    : fallbackCandidates.slice(0, MAX_FALLBACK_TRIES + 1);

  if (candidates.length === 0) {
    throw new Error("未找到可用模型配置");
  }

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const parsed = parseChatModelId(candidate);
      if (!parsed) throw new Error("chatModelId 格式无效");

      const providerEntry = providerByKey.get(parsed.providerKey);
      if (!providerEntry) throw new Error("模型服务商未配置");

      if (!providerEntry.modelIds.includes(parsed.modelId)) {
        throw new Error("模型未在服务商配置中启用");
      }

      const factory = PROVIDER_FACTORIES[providerEntry.provider];
      if (!factory) throw new Error("不支持的模型服务商");

      const model = factory({
        apiUrl: providerEntry.apiUrl,
        apiKey: providerEntry.apiKey,
      })(parsed.modelId);
      const modelDefinition = resolveModelDefinition(providerEntry, parsed.modelId);

      // 中文注释：provider 采用后端配置的 provider id，确保可追踪真实请求来源。
      return {
        model,
        modelInfo: { provider: providerEntry.provider, modelId: parsed.modelId },
        chatModelId: candidate,
        modelDefinition,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("模型解析失败");
    }
  }

  throw lastError ?? new Error("模型解析失败");
}
