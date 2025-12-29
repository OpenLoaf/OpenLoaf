"use client";

import type { ChatModelSource, IOType, ModelDefinition, ModelTag } from "@teatime-ai/api/common";
import { resolveModelDefinition } from "@/lib/model-registry";

type ProviderKeyEntry = {
  /** Provider id. */
  providerId: string;
  /** Enabled model ids. */
  modelIds?: string[];
  /** Custom model definitions. */
  customModels?: ModelDefinition[];
  /** API base URL. */
  apiUrl?: string;
  /** Raw auth config. */
  authConfig?: Record<string, unknown>;
};

export type ProviderModelOption = {
  /** Unique chat model id in settings scope. */
  id: string;
  /** Model id. */
  modelId: string;
  /** Provider id. */
  providerId: string;
  /** Provider display name. */
  providerName: string;
  /** Input types. */
  input?: IOType[];
  /** Output types. */
  output?: IOType[];
  /** Tags for filtering. */
  tags?: ModelTag[];
  /** Model definition from registry. */
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
    if (!entry.providerId) continue;
    if (!item.id) continue;
    const providerName = item.key;
    const modelIds =
      Array.isArray(entry.modelIds) && entry.modelIds.length > 0
        ? entry.modelIds
        : [];

    const customModels = Array.isArray(entry.customModels) ? entry.customModels : [];
    for (const modelId of modelIds) {
      const trimmed = typeof modelId === "string" ? modelId.trim() : "";
      if (!trimmed) continue;
      const modelDefinition =
        resolveModelDefinition(entry.providerId, trimmed) ??
        customModels.find((model) => model.id === trimmed);
      options.push({
        // 中文注释：chatModelId 前缀使用 settings.id，确保稳定可追踪。
        id: `${item.id}:${trimmed}`,
        modelId: trimmed,
        providerId: entry.providerId,
        providerName,
        input: modelDefinition?.input,
        output: modelDefinition?.output,
        tags: modelDefinition?.tags,
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
