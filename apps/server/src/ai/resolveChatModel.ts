import type { LanguageModelV3 } from "@ai-sdk/provider";
import { getEnvString } from "@teatime-ai/config";
import { getProviderSettings, type ProviderSettingEntry } from "@/modules/settings/settingsService";
import type { ChatModelSource, IOType, ModelDefinition } from "@teatime-ai/api/common";
import { getModelDefinition, getProviderDefinition } from "@/modules/model/modelRegistry";
import { PROVIDER_ADAPTERS } from "@/modules/model/providerAdapters";
import { getAccessToken } from "@/modules/auth/tokenStore";

type ResolvedChatModel = {
  model: LanguageModelV3;
  modelInfo: { provider: string; modelId: string };
  chatModelId: string;
  modelDefinition?: ModelDefinition;
};

const MAX_FALLBACK_TRIES = 2;

/** Map provider settings before model construction. */
type ProviderEntryMapper = (entry: ProviderSettingEntry) => ProviderSettingEntry;

/** Resolve model definition from registry. */
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

/** Build chatModelId candidates from provider settings. */
function buildChatModelCandidates(input: {
  providers: ProviderSettingEntry[];
  exclude?: string | null;
  requiredInput?: IOType[];
}): string[] {
  const requiredInput = (input.requiredInput ?? []).filter(Boolean);
  const providers = input.providers;
  const exclude = input.exclude;
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    for (const modelId of Object.keys(provider.models)) {
      if (requiredInput.length > 0) {
        const definition = resolveModelDefinition(provider.providerId, modelId, provider);
        const inputTypes = definition?.input ?? [];
        if (!requiredInput.every((item) => inputTypes.includes(item))) {
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
function buildRequiredInputError(requiredInput: IOType[]): Error {
  const requiredSet = new Set(requiredInput);
  if (requiredSet.has("imageUrl") && requiredSet.has("image")) {
    return new Error("未找到支持图片输入的模型");
  }
  if (requiredSet.has("imageUrl")) {
    return new Error("未找到支持图片链接的模型");
  }
  if (requiredSet.has("image")) {
    return new Error("未找到支持图片的模型");
  }
  return new Error("未找到满足输入条件的模型");
}

/** Resolve chat model from provider settings. */
async function resolveChatModelFromProviders(input: {
  chatModelId?: string | null;
  providers: ProviderSettingEntry[];
  mapProviderEntry?: ProviderEntryMapper;
  requiredInput?: IOType[];
  preferredChatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const normalized = normalizeChatModelId(input.chatModelId);
  const mapProviderEntry = input.mapProviderEntry ?? ((entry) => entry);
  const providers = input.providers;
  const shouldFilterInput = !normalized && (input.requiredInput?.length ?? 0) > 0;
  const providerById = new Map(providers.map((entry) => [entry.id, entry]));
  const preferredCandidateRaw = normalizeChatModelId(input.preferredChatModelId);
  const hasRequiredInput = (candidate: string): boolean => {
    const parsed = parseChatModelId(candidate);
    if (!parsed) return false;
    const providerEntry = providerById.get(parsed.profileId);
    if (!providerEntry) return false;
    if (!providerEntry.models[parsed.modelId]) return false;
    if (!shouldFilterInput) return true;
    const definition = resolveModelDefinition(
      providerEntry.providerId,
      parsed.modelId,
      providerEntry,
    );
    const inputTypes = definition?.input ?? [];
    return Boolean(input.requiredInput?.every((item) => inputTypes.includes(item)));
  };
  const preferredCandidate =
    preferredCandidateRaw && hasRequiredInput(preferredCandidateRaw)
      ? preferredCandidateRaw
      : null;

  // 中文注释：流程=生成候选列表 -> 顺序解析/创建模型 -> 失败后按次数 fallback。
  const fallbackCandidates = buildChatModelCandidates({
    providers,
    exclude: normalized ?? preferredCandidate,
    requiredInput: shouldFilterInput ? input.requiredInput : undefined,
  });
  // 中文注释：auto 时默认取最近更新的模型，失败时再依次尝试 fallback。
  const candidates = normalized
    ? [normalized, ...fallbackCandidates.slice(0, MAX_FALLBACK_TRIES)]
    : preferredCandidate
      ? [preferredCandidate, ...fallbackCandidates.slice(0, MAX_FALLBACK_TRIES)]
      : fallbackCandidates.slice(0, MAX_FALLBACK_TRIES + 1);

  if (candidates.length === 0) {
    if (shouldFilterInput && input.requiredInput) {
      throw buildRequiredInputError(input.requiredInput);
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
      const providerDefinition = getProviderDefinition(providerEntry.providerId);
      const adapterId = providerDefinition?.adapterId ?? providerEntry.providerId;
      const adapter = PROVIDER_ADAPTERS[adapterId];
      if (!adapter) throw new Error("不支持的模型服务商");

      const modelDefinition = resolveModelDefinition(
        providerEntry.providerId,
        parsed.modelId,
        providerEntry,
      );
      const model = adapter.buildAiSdkModel({
        provider: mappedProviderEntry,
        modelId: parsed.modelId,
        modelDefinition,
        providerDefinition,
      });
      if (!model) {
        throw new Error("模型不支持 AI SDK 调用");
      }

      // 中文注释：provider 采用后端配置的 provider id，确保可追踪真实请求来源。
      return {
        model,
        modelInfo: { provider: providerEntry.providerId, modelId: parsed.modelId },
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
  requiredInput?: IOType[];
  preferredChatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const providers = await getProviderSettings();
  return resolveChatModelFromProviders({
    providers,
    chatModelId: input.chatModelId,
    requiredInput: input.requiredInput,
    preferredChatModelId: input.preferredChatModelId,
  });
}

/** Resolve chat model from cloud config. */
async function resolveCloudChatModel(_input: {
  chatModelId?: string | null;
  requiredInput?: IOType[];
  preferredChatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const saasUrl = getEnvString(process.env, "TEATIME_SAAS_URL");
  const accessToken = getAccessToken();
  const providers = await getProviderSettings();
  const normalizedSaasUrl = saasUrl ? saasUrl.replace(/\/+$/, "") : undefined;

  return resolveChatModelFromProviders({
    providers,
    chatModelId: _input.chatModelId,
    requiredInput: _input.requiredInput,
    preferredChatModelId: _input.preferredChatModelId,
    mapProviderEntry: (providerEntry) => {
      const authConfig = accessToken
        ? { ...(providerEntry.authConfig ?? {}), apiKey: accessToken }
        : providerEntry.authConfig;
      // 中文注释：云端调用优先使用 SaaS 的 /ttai 与 access token，未配置时回落本地配置。
      return {
        ...providerEntry,
        apiUrl: normalizedSaasUrl ? `${normalizedSaasUrl}/ttai/v1` : providerEntry.apiUrl,
        authConfig,
      };
    },
  });
}

/** Resolve chat model by selected source. */
export async function resolveChatModel(input: {
  chatModelId?: string | null;
  chatModelSource?: ChatModelSource | null;
  requiredInput?: IOType[];
  preferredChatModelId?: string | null;
}): Promise<ResolvedChatModel> {
  const source = normalizeChatModelSource(input.chatModelSource);
  if (source === "cloud") {
    return resolveCloudChatModel({
      chatModelId: input.chatModelId,
      requiredInput: input.requiredInput,
      preferredChatModelId: input.preferredChatModelId,
    });
  }
  return resolveLocalChatModel({
    chatModelId: input.chatModelId,
    requiredInput: input.requiredInput,
    preferredChatModelId: input.preferredChatModelId,
  });
}
