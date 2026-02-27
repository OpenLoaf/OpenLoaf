/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import type { ChatModelSource, ModelDefinition, ModelTag } from "@openloaf/api/common";
import { getProviderDefinition, getProviderDefinitions } from "@/lib/model-registry";

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
  /** Provider settings id for grouping. */
  providerSettingsId?: string;
  /** Provider id. */
  providerId: string;
  /** Provider display name. */
  providerName: string;
  /** Tags for filtering. */
  tags?: ModelTag[];
  /** Model definition from registry. */
  modelDefinition?: ModelDefinition;
};

/** Adapter id for CLI providers. */
const CLI_ADAPTER_ID = "cli";

/**
 * Build CLI provider model options from registry definitions.
 * 仅包含已安装的 CLI 工具对应的模型。
 */
export function buildCliModelOptions(
  installedCliProviderIds?: Set<string>,
): ProviderModelOption[] {
  const options: ProviderModelOption[] = [];
  const providers = getProviderDefinitions().filter(
    (provider) => provider.adapterId === CLI_ADAPTER_ID,
  );
  for (const provider of providers) {
    // 逻辑：有安装状态信息时，跳过未安装的 CLI 工具。
    if (installedCliProviderIds && !installedCliProviderIds.has(provider.id)) continue;
    const providerName = provider.label || provider.id;
    const models = Array.isArray(provider.models) ? provider.models : [];
    for (const model of models) {
      if (!model || !model.id) continue;
      options.push({
        // 中文注释：CLI 模型前缀直接使用 providerId，保证与服务端匹配。
        id: `${provider.id}:${model.id}`,
        modelId: model.id,
        providerSettingsId: provider.id,
        providerId: provider.id,
        providerName,
        tags: model.tags,
        modelDefinition: { ...model, providerId: provider.id },
      });
    }
  }
  return options;
}

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
        providerSettingsId: item.id,
        providerId: entry.providerId,
        providerName,
        tags: modelDefinition?.tags,
        modelDefinition,
      });
    }
  }
  return options;
}

/** Build model options from cloud models (placeholder). */
export function buildCloudModelOptions(models: ModelDefinition[]): ProviderModelOption[] {
  const options: ProviderModelOption[] = [];
  for (const model of models) {
    if (!model || !model.id || !model.providerId) continue;
    const providerDefinition = getProviderDefinition(model.providerId);
    const providerName = providerDefinition?.label ?? model.providerId;
    options.push({
      // 中文注释：云端模型使用 providerId 作为前缀，避免依赖本地 settings id。
      id: `${model.providerId}:${model.id}`,
      modelId: model.id,
      providerId: model.providerId,
      providerName,
      tags: model.tags,
      modelDefinition: model,
    });
  }
  return options;
}

/** Build model options from source selection. */
export function buildChatModelOptions(
  source: ChatModelSource,
  items: Array<{ key: string; value: unknown; category?: string }>,
  cloudModels: ModelDefinition[] = [],
  installedCliProviderIds?: Set<string>,
) {
  // 中文注释：云端模式不读取本地服务商配置。
  if (source === "cloud") return buildCloudModelOptions(cloudModels);
  const localOptions = buildProviderModelOptions(items);
  const cliOptions = buildCliModelOptions(installedCliProviderIds);
  if (cliOptions.length === 0) return localOptions;
  // 中文注释：合并 CLI 与本地配置，避免 id 重复。
  const merged = new Map<string, ProviderModelOption>();
  for (const option of [...cliOptions, ...localOptions]) {
    if (merged.has(option.id)) continue;
    merged.set(option.id, option);
  }
  return Array.from(merged.values());
}
