"use client";

import type { ChatModelSource, IOType, ModelDefinition, ModelTag } from "@teatime-ai/api/common";

type ProviderKeyEntry = {
  /** Provider id. */
  providerId: string;
  /** Enabled model definitions keyed by model id. */
  models?: Record<string, ModelDefinition>;
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
    const models = entry.models ?? {};
    for (const [modelId, modelDefinition] of Object.entries(models)) {
      const trimmed = modelId.trim();
      if (!trimmed || !modelDefinition) continue;
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
