"use client";

import type { ModelCapabilityId, ModelDefinition } from "@teatime-ai/api/common";

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
    if (!entry.provider) continue;
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
        id: `${item.key}:${trimmed}`,
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
