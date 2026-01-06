import type { ImageModelV3 } from "@ai-sdk/provider";
import type { ModelDefinition } from "@teatime-ai/api/common";
import { getProviderSettings, type ProviderSettingEntry } from "@/modules/settings/settingsService";
import { getModelDefinition, getProviderDefinition } from "@/modules/model/modelRegistry";
import { PROVIDER_ADAPTERS } from "@/modules/model/providerAdapters";

type ResolvedImageModel = {
  /** Resolved ImageModelV3 instance. */
  model: ImageModelV3;
  /** Provider metadata. */
  modelInfo: { provider: string; modelId: string };
  /** Image model id key. */
  imageModelId: string;
  /** Optional model definition. */
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

  // 中文注释：流程=生成候选列表 -> 顺序解析/创建模型 -> 失败后按次数 fallback。
  const fallbackCandidates = buildImageModelCandidates(providers, normalized);
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
      const parsed = parseImageModelId(candidate);
      if (!parsed) throw new Error("imageModelId 格式无效");

      // 中文注释：imageModelId 前缀固定使用 settings.id，避免 key 重命名导致失效。
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
      const model = adapter.buildImageModel({
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
        imageModelId: candidate,
        modelDefinition,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("模型解析失败");
    }
  }

  throw lastError ?? new Error("模型解析失败");
}

/** Resolve image model from local provider settings. */
export async function resolveImageModel(input: {
  imageModelId?: string | null;
}): Promise<ResolvedImageModel> {
  const providers = await getProviderSettings();
  return resolveImageModelFromProviders({ providers, imageModelId: input.imageModelId });
}
