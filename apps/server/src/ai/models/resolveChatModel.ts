import type { LanguageModelV3 } from "@ai-sdk/provider";
import { getProviderSettings, type ProviderSettingEntry } from "@/modules/settings/settingsService";
import type { ChatModelSource, ModelDefinition, ModelTag } from "@tenas-ai/api/common";
import { getModelDefinition, getProviderDefinition } from "@/ai/models/modelRegistry";
import { PROVIDER_ADAPTERS } from "@/ai/models/providerAdapters";
import { buildCliProviderEntries } from "@/ai/models/cli/cliProviderEntry";
import { getAccessToken } from "@/modules/auth/tokenStore";
import { ensureAccessTokenFresh } from "@/modules/auth/authRoutes";
import { fetchModelList, getSaasBaseUrl } from "@/modules/saas";

type ResolvedChatModel = {
  model: LanguageModelV3;
  modelInfo: { provider: string; modelId: string };
  chatModelId: string;
  modelDefinition?: ModelDefinition;
};

const MAX_FALLBACK_TRIES = 2;

/** Map provider settings before model construction. */
type ProviderEntryMapper = (entry: ProviderSettingEntry) => ProviderSettingEntry;

/** Resolve model definition from registry or settings. */
function resolveModelDefinition(
  providerId: string,
  modelId: string,
  providerEntry?: ProviderSettingEntry,
) {
  const fromConfig = providerEntry?.models[modelId];
  return fromConfig ?? getModelDefinition(providerId, modelId);
}

/** Normalize chatModelId input. */
function normalizeChatModelId(raw?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Parse chatModelId into provider key and model id. */
function parseChatModelId(chatModelId: string): { profileId: string; modelId: string } | null {
  const separatorIndex = chatModelId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= chatModelId.length - 1) return null;
  const profileId = chatModelId.slice(0, separatorIndex).trim();
  const modelId = chatModelId.slice(separatorIndex + 1).trim();
  if (!profileId || !modelId) return null;
  return { profileId, modelId };
}

/** Normalize chat model source input. */
function normalizeChatModelSource(raw?: string | null): ChatModelSource {
  // 中文注释：只允许 local/cloud，非法值默认回落到 local。
  return raw === "cloud" ? "cloud" : "local";
}

type CloudModelListResponse = {
  /** Success flag from SaaS. */
  success: boolean;
  /** Cloud model list. */
  data: ModelDefinition[];
};

/** Normalize cloud models into provider settings entries. */
function buildCloudProviderEntries(input: {
  models: ModelDefinition[];
  apiUrl: string;
  apiKey: string;
}): ProviderSettingEntry[] {
  const providerMap = new Map<string, ProviderSettingEntry>();
  const now = new Date();

  for (const model of input.models) {
    if (!model || typeof model.id !== "string" || !model.providerId) continue;
    const providerId = model.providerId;
    let entry = providerMap.get(providerId);
    if (!entry) {
      const providerDefinition = getProviderDefinition(providerId);
      entry = {
        id: providerId,
        key: providerDefinition?.label ?? providerId,
        providerId,
        apiUrl: input.apiUrl,
        authConfig: { apiKey: input.apiKey },
        models: {},
        updatedAt: now,
      };
      providerMap.set(providerId, entry);
    }
    // 中文注释：确保模型列表中包含 providerId，避免 SaaS 返回空值。
    entry.models[model.id] = {
      ...model,
      providerId,
      tags: Array.isArray(model.tags) ? model.tags : [],
    };
  }

  return Array.from(providerMap.values());
}

/** Build chatModelId candidates from provider settings. */
function buildChatModelCandidates(input: {
  providers: ProviderSettingEntry[];
  exclude?: string | null;
  requiredTags?: ModelTag[];
}): string[] {
  const requiredTags = (input.requiredTags ?? []).filter(Boolean);
  const providers = input.providers;
  const exclude = input.exclude;
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    for (const modelId of Object.keys(provider.models)) {
      if (requiredTags.length > 0) {
        const definition = resolveModelDefinition(provider.providerId, modelId, provider);
        const tags = definition?.tags ?? [];
        if (!requiredTags.every((item) => tags.includes(item))) {
          continue;
        }
      }
      const chatModelId = `${provider.id}:${modelId}`;
      if (exclude && chatModelId === exclude) continue;
      if (seen.has(chatModelId)) continue;
      seen.add(chatModelId);
      candidates.push(chatModelId);
    }
  }

  return candidates;
}

/** Build a readable error for required input types. */
function buildRequiredTagError(requiredTags: ModelTag[]): Error {
  const requiredSet = new Set(requiredTags);
  if (requiredSet.has("image_edit")) {
    return new Error("未找到支持图片编辑的模型");
  }
  return new Error("未找到满足输入条件的模型");
}

/** Resolve chat model from provider settings. */
async function resolveChatModelFromProviders(input: {
  chatModelId?: string | null;
  providers: ProviderSettingEntry[];
  mapProviderEntry?: ProviderEntryMapper;
  requiredTags?: ModelTag[];
  preferredChatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const normalized = normalizeChatModelId(input.chatModelId);
  const mapProviderEntry = input.mapProviderEntry ?? ((entry) => entry);
  const providers = input.providers;
  const shouldFilterTags = !normalized && (input.requiredTags?.length ?? 0) > 0;
  const providerById = new Map(providers.map((entry) => [entry.id, entry]));
  const preferredCandidateRaw = normalizeChatModelId(input.preferredChatModelId);
  const hasRequiredTags = (candidate: string): boolean => {
    const parsed = parseChatModelId(candidate);
    if (!parsed) return false;
    const providerEntry = providerById.get(parsed.profileId);
    if (!providerEntry) return false;
    if (!providerEntry.models[parsed.modelId]) return false;
    if (!shouldFilterTags) return true;
    const definition = resolveModelDefinition(
      providerEntry.providerId,
      parsed.modelId,
      providerEntry,
    );
    const tags = definition?.tags ?? [];
    return Boolean(input.requiredTags?.every((item) => tags.includes(item)));
  };
  const preferredCandidate =
    preferredCandidateRaw && hasRequiredTags(preferredCandidateRaw)
      ? preferredCandidateRaw
      : null;

  // 中文注释：显式指定模型时不做 fallback，避免静默切换。
  const fallbackCandidates = normalized
    ? []
    : buildChatModelCandidates({
        providers,
        exclude: preferredCandidate,
        requiredTags: shouldFilterTags ? input.requiredTags : undefined,
      });
  // 中文注释：auto 时默认取最近更新的模型，失败时再依次尝试 fallback。
  const candidates = normalized
    ? [normalized]
    : preferredCandidate
      ? [preferredCandidate, ...fallbackCandidates.slice(0, MAX_FALLBACK_TRIES)]
      : fallbackCandidates.slice(0, MAX_FALLBACK_TRIES + 1);

  if (candidates.length === 0) {
    if (shouldFilterTags && input.requiredTags) {
      throw buildRequiredTagError(input.requiredTags);
    }
    throw new Error("未找到可用模型配置");
  }

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const parsed = parseChatModelId(candidate);
      if (!parsed) throw new Error("chatModelId 格式无效");

      // 中文注释：chatModelId 前缀固定使用 settings.id，避免 key 重命名导致失效。
      const providerEntry = providerById.get(parsed.profileId);
      if (!providerEntry) throw new Error("模型服务商未配置");

      if (!providerEntry.models[parsed.modelId]) {
        throw new Error("模型未在服务商配置中启用");
      }

      const mappedProviderEntry = mapProviderEntry(providerEntry);
      const modelDefinition = resolveModelDefinition(
        providerEntry.providerId,
        parsed.modelId,
        providerEntry,
      );
      // 中文注释：适配器优先使用模型定义里的 providerId，避免配置误配。
      const resolvedProviderId = modelDefinition?.providerId ?? providerEntry.providerId;
      const providerDefinition = getProviderDefinition(resolvedProviderId);
      const adapterId = providerDefinition?.adapterId ?? resolvedProviderId;
      const adapter = PROVIDER_ADAPTERS[adapterId];
      if (!adapter) throw new Error("不支持的模型服务商");
      const model = adapter.buildAiSdkModel({
        provider: mappedProviderEntry,
        modelId: parsed.modelId,
        modelDefinition,
        providerDefinition,
      });
      if (!model) {
        const resolvedApiUrl = (
          mappedProviderEntry.apiUrl.trim() || providerDefinition?.apiUrl?.trim() || ""
        ).trim();
        const rawApiKey = mappedProviderEntry.authConfig?.apiKey;
        const hasApiKey = typeof rawApiKey === "string" && rawApiKey.trim().length > 0;
        // 中文注释：补齐常见配置缺失的报错，方便定位。
        if (!hasApiKey || !resolvedApiUrl) {
          throw new Error("模型服务商配置不完整：缺少 apiKey 或 apiUrl");
        }
        throw new Error(`模型构建失败：适配器(${adapterId})未返回实例`);
      }

      // 中文注释：provider 采用后端配置的 provider id，确保可追踪真实请求来源。
      return {
        model,
        modelInfo: { provider: resolvedProviderId, modelId: parsed.modelId },
        chatModelId: candidate,
        modelDefinition,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("模型解析失败");
    }
  }

  throw lastError ?? new Error("模型解析失败");
}

/** Resolve chat model from local provider settings. */
async function resolveLocalChatModel(input: {
  chatModelId?: string | null;
  requiredTags?: ModelTag[];
  preferredChatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const providers = await getProviderSettings();
  const cliProviders = buildCliProviderEntries();
  // 逻辑：CLI provider 作为内置项注入，避免依赖用户手动配置。
  const mergedProviders = [
    ...cliProviders.filter(
      (cliEntry) => !providers.some((entry) => entry.id === cliEntry.id),
    ),
    ...providers,
  ];
  return resolveChatModelFromProviders({
    providers: mergedProviders,
    chatModelId: input.chatModelId,
    requiredTags: input.requiredTags,
    preferredChatModelId: input.preferredChatModelId,
  });
}

/** Resolve chat model from cloud config. */
async function resolveCloudChatModel(_input: {
  chatModelId?: string | null;
  requiredTags?: ModelTag[];
  preferredChatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  await ensureAccessTokenFresh();
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("未登录云端账号");
  }
  let saasBaseUrl: string;
  try {
    saasBaseUrl = getSaasBaseUrl();
  } catch {
    throw new Error("云端地址未配置");
  }
  const payload = (await fetchModelList()) as CloudModelListResponse | null;
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error("云端模型列表获取失败");
  }
  const providers = buildCloudProviderEntries({
    models: payload.data,
    apiUrl: `${saasBaseUrl}/tenas-ai/v1`,
    apiKey: accessToken,
  });
  return resolveChatModelFromProviders({
    providers,
    chatModelId: _input.chatModelId,
    requiredTags: _input.requiredTags,
    preferredChatModelId: _input.preferredChatModelId,
  });
}

/** Resolve chat model by selected source. */
export async function resolveChatModel(input: {
  chatModelId?: string | null;
  chatModelSource?: ChatModelSource | null;
  requiredTags?: ModelTag[];
  preferredChatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const source = normalizeChatModelSource(input.chatModelSource);
  if (source === "cloud") {
    return resolveCloudChatModel({
      chatModelId: input.chatModelId,
      requiredTags: input.requiredTags,
      preferredChatModelId: input.preferredChatModelId,
    });
  }
  return resolveLocalChatModel({
    chatModelId: input.chatModelId,
    requiredTags: input.requiredTags,
    preferredChatModelId: input.preferredChatModelId,
  });
}
