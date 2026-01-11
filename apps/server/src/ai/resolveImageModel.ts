import type { ImageModelV3 } from "@ai-sdk/provider";
import type { ModelDefinition } from "@tenas-ai/api/common";
import { getProviderSettings, type ProviderSettingEntry } from "@/modules/settings/settingsService";
import { getModelDefinition, getProviderDefinition } from "@/ai/models/modelRegistry";
import { PROVIDER_ADAPTERS } from "@/ai/models/providerAdapters";
import { logger } from "@/common/logger";

type ResolvedImageModel = {
  /** Resolved ImageModelV3 instance. */
  model: ImageModelV3;
  /** Provider metadata. */
  modelInfo: { provider: string; modelId: string; adapterId: string };
  /** Image model id key. */
  imageModelId: string;
  /** Optional model definition. */
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

/** Normalize imageModelId input. */
function normalizeImageModelId(raw?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Parse imageModelId into provider key and model id. */
function parseImageModelId(imageModelId: string): { profileId: string; modelId: string } | null {
  const separatorIndex = imageModelId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= imageModelId.length - 1) return null;
  const profileId = imageModelId.slice(0, separatorIndex).trim();
  const modelId = imageModelId.slice(separatorIndex + 1).trim();
  if (!profileId || !modelId) return null;
  return { profileId, modelId };
}

/** Build imageModelId candidates from provider settings. */
function buildImageModelCandidates(
  providers: ProviderSettingEntry[],
  exclude?: string | null,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    for (const modelId of Object.keys(provider.models)) {
      const imageModelId = `${provider.id}:${modelId}`;
      if (exclude && imageModelId === exclude) continue;
      if (seen.has(imageModelId)) continue;
      seen.add(imageModelId);
      candidates.push(imageModelId);
    }
  }

  return candidates;
}

/** Resolve image model from provider settings. */
async function resolveImageModelFromProviders(input: {
  imageModelId?: string | null;
  providers: ProviderSettingEntry[];
  mapProviderEntry?: ProviderEntryMapper;
}): Promise<ResolvedImageModel> {
  const normalized = normalizeImageModelId(input.imageModelId);
  const mapProviderEntry = input.mapProviderEntry ?? ((entry) => entry);
  const providers = input.providers;
  const providerById = new Map(providers.map((entry) => [entry.id, entry]));

  // 显式指定模型时不做 fallback，避免静默切换。
  const fallbackCandidates = normalized ? [] : buildImageModelCandidates(providers, normalized);
  // auto 时默认取最近更新的模型，失败时再依次尝试 fallback。
  const candidates = normalized
    ? [normalized]
    : fallbackCandidates.slice(0, MAX_FALLBACK_TRIES + 1);

  if (candidates.length === 0) {
    throw new Error("未找到可用模型配置");
  }

  logger.debug(
    {
      imageModelId: normalized,
      candidateCount: candidates.length,
      candidates,
    },
    "[image-model] resolve candidates",
  );

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const parsed = parseImageModelId(candidate);
      if (!parsed) throw new Error("imageModelId 格式无效");

      // imageModelId 前缀固定使用 settings.id，避免 key 重命名导致失效。
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
      // 适配器优先使用模型定义里的 providerId，避免配置误配。
      const resolvedProviderId = modelDefinition?.providerId ?? providerEntry.providerId;
      const providerDefinition = getProviderDefinition(resolvedProviderId);
      // custom 服务强制使用 openai 适配器，避免 provider 定义缺失。
      const adapterId =
        resolvedProviderId === "custom" ? "openai" : providerDefinition?.adapterId ?? resolvedProviderId;
      const adapter = PROVIDER_ADAPTERS[adapterId];
      logger.debug(
        {
          candidate,
          profileId: parsed.profileId,
          modelId: parsed.modelId,
          providerId: providerEntry.providerId,
          resolvedProviderId,
          adapterId,
          modelDefinitionProviderId: modelDefinition?.providerId,
          modelDefinitionTags: modelDefinition?.tags,
        },
        "[image-model] resolve adapter",
      );
      if (!adapter) throw new Error("不支持的模型服务商");
      const model = adapter.buildImageModel({
        provider: mappedProviderEntry,
        modelId: parsed.modelId,
        modelDefinition,
        providerDefinition,
      });
      if (!model) {
        throw new Error("模型不支持 AI SDK 调用");
      }

      // provider 采用后端配置的 provider id，确保可追踪真实请求来源。
      return {
        model,
        modelInfo: { provider: resolvedProviderId, modelId: parsed.modelId, adapterId },
        imageModelId: candidate,
        modelDefinition,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error("模型解析失败");
      logger.debug(
        {
          candidate,
          error: error.message,
        },
        "[image-model] resolve candidate failed",
      );
      lastError = error;
    }
  }

  throw lastError ?? new Error("模型解析失败");
}

/** Resolve image model from local provider settings. */
export async function resolveImageModel(input: {
  imageModelId?: string | null;
}): Promise<ResolvedImageModel> {
  const providers = await getProviderSettings();
  logger.debug(
    {
      imageModelId: input.imageModelId,
      providerCount: providers.length,
    },
    "[image-model] resolve from settings",
  );
  return resolveImageModelFromProviders({ providers, imageModelId: input.imageModelId });
}
