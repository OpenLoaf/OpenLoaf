"use client";

import type { ChatModelSource, ModelCapabilityId, ModelDefinition } from "@teatime-ai/api/common";

type ProviderKeyEntry = {
  provider: string;
  modelIds?: string[];
  modelDefinitions?: ModelDefinition[];
};

export type ProviderModelOption = {
  id: string;
  modelId: string;
  providerId: string;
  providerName: string;
  capabilityIds?: ModelCapabilityId[];
  modelDefinition?: ModelDefinition;
};

/** Normalize model source to local/cloud. */
export function normalizeChatModelSource(value: unknown): ChatModelSource {
  // 中文注释：只允许 local/cloud，非法值一律回退为 local。
  return value === "cloud" ? "cloud" : "local";
}

/**
 * Build model options from provider settings.
 */
export function buildProviderModelOptions(
  items: Array<{ id?: string; key: string; value: unknown; category?: string }>,
) {
  const options: ProviderModelOption[] = [];
  for (const item of items) {
    if ((item.category ?? "general") !== "provider") continue;
    if (!item.value || typeof item.value !== "object") continue;
    const entry = item.value as ProviderKeyEntry;
    if (!entry.provider) continue;
    if (!item.id) continue;
    const rawDefinitions = Array.isArray(entry.modelDefinitions)
      ? entry.modelDefinitions
      : [];
    // 中文注释：仅使用配置中已有的模型定义，避免回退到模板数据。
    if (rawDefinitions.length === 0) continue;
    const providerName = item.key;
    const modelDefinitionById = new Map(
      rawDefinitions
        .filter((model) => model && typeof model.id === "string" && model.id.trim())
        .map((model) => [model.id.trim(), model]),
    );
    const modelIds =
      Array.isArray(entry.modelIds) && entry.modelIds.length > 0
        ? entry.modelIds
        : Array.from(modelDefinitionById.keys());

    for (const modelId of modelIds) {
      const trimmed = typeof modelId === "string" ? modelId.trim() : "";
      if (!trimmed) continue;
      const modelDefinition = modelDefinitionById.get(trimmed);
      if (!modelDefinition) continue;
      const capabilityIds = Array.isArray(modelDefinition.capability)
        ? modelDefinition.capability
        : undefined;
      options.push({
        // 中文注释：chatModelId 前缀使用 settings.id，确保稳定可追踪。
        id: `${item.id}:${trimmed}`,
        modelId: trimmed,
        providerId: entry.provider,
        providerName,
        capabilityIds,
        modelDefinition,
      });
    }
  }
  return options;
}

/** Build model options from cloud models (placeholder). */
export function buildCloudModelOptions(): ProviderModelOption[] {
  // 中文注释：云端模型列表暂未接入，先返回空数组。
  return [];
}

/** Build model options from source selection. */
export function buildChatModelOptions(
  source: ChatModelSource,
  items: Array<{ key: string; value: unknown; category?: string }>,
) {
  // 中文注释：云端模式不读取本地服务商配置。
  if (source === "cloud") return buildCloudModelOptions();
  return buildProviderModelOptions(items);
}
