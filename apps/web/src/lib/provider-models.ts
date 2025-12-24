"use client";

import {
  DEEPSEEK_MODEL_CATALOG,
  XAI_MODEL_CATALOG,
  type ModelCapabilityId,
} from "@teatime-ai/api/common";

type ProviderModelEntry =
  | string
  | {
      id?: string;
      modelId?: string;
      capability?: ModelCapabilityId[];
      capabilities?: ModelCapabilityId[];
    };

type ProviderKeyEntry = {
  provider: string;
  modelIds?: ProviderModelEntry[];
};

export type ProviderModelOption = {
  id: string;
  modelId: string;
  providerId: string;
  providerName: string;
  capabilityIds?: ModelCapabilityId[];
};

const MODEL_CAPABILITY_BY_PROVIDER = new Map<string, Map<string, ModelCapabilityId[]>>([
  [
    DEEPSEEK_MODEL_CATALOG.getProviderId(),
    new Map(DEEPSEEK_MODEL_CATALOG.getModels().map((model) => [model.id, model.capability])),
  ],
  [
    XAI_MODEL_CATALOG.getProviderId(),
    new Map(XAI_MODEL_CATALOG.getModels().map((model) => [model.id, model.capability])),
  ],
]);

/**
 * Build model options from provider settings.
 */
export function buildProviderModelOptions(
  items: Array<{ key: string; value: unknown; category?: string }>,
) {
  const options: ProviderModelOption[] = [];
  for (const item of items) {
    if ((item.category ?? "general") !== "provider") continue;
    if (!item.value || typeof item.value !== "object") continue;
    const entry = item.value as ProviderKeyEntry;
    if (!entry.provider || !Array.isArray(entry.modelIds)) continue;
    const providerName = item.key;
    for (const modelEntry of entry.modelIds) {
      const normalized =
        typeof modelEntry === "string"
          ? { modelId: modelEntry, capabilityIds: undefined }
          : {
              modelId:
                typeof modelEntry.modelId === "string"
                  ? modelEntry.modelId
                  : typeof modelEntry.id === "string"
                    ? modelEntry.id
                    : "",
              capabilityIds: Array.isArray(modelEntry.capability)
                ? modelEntry.capability
                : Array.isArray(modelEntry.capabilities)
                  ? modelEntry.capabilities
                  : undefined,
            };
      const trimmed = typeof normalized.modelId === "string" ? normalized.modelId.trim() : "";
      if (!trimmed) continue;
      // 优先使用配置中的能力信息，缺失时从内置 catalog 补齐。
      const capabilityIds =
        (Array.isArray(normalized.capabilityIds) && normalized.capabilityIds.length > 0
          ? normalized.capabilityIds
          : MODEL_CAPABILITY_BY_PROVIDER.get(entry.provider)?.get(trimmed)) ?? undefined;
      options.push({
        id: `${item.key}:${trimmed}`,
        modelId: trimmed,
        providerId: entry.provider,
        providerName,
        capabilityIds,
      });
    }
  }
  return options;
}
