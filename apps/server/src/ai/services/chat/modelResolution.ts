/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ModelCapabilities, ModelDefinition } from "@openloaf/api/common";
import { getModelDefinition } from "@/ai/models/modelRegistry";
import { getProviderSettings } from "@/modules/settings/settingsService";

/** Resolve explicit model definition from chatModelId. */
export async function resolveExplicitModelDefinition(
  chatModelId?: string | null,
): Promise<ModelDefinition | null> {
  const normalized = typeof chatModelId === "string" ? chatModelId.trim() : "";
  if (!normalized) {
    return null;
  }
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }
  const profileId = normalized.slice(0, separatorIndex).trim();
  const modelId = normalized.slice(separatorIndex + 1).trim();
  if (!profileId || !modelId) {
    return null;
  }

  const providers = await getProviderSettings();
  const providerEntry = providers.find((entry) => entry.id === profileId);
  if (!providerEntry) {
    const registryModel = await getModelDefinition(profileId, modelId) ?? null;
    return registryModel;
  }
  const fromConfig = providerEntry.models[modelId];
  if (!fromConfig) {
    const registryModel = await getModelDefinition(providerEntry.providerId, modelId) ?? null;
    return registryModel;
  }
  const hasTags = Array.isArray(fromConfig.tags) && fromConfig.tags.length > 0;
  const capabilities = fromConfig.capabilities as ModelCapabilities | undefined;
  // 中文注释：任一能力字段有值就视为配置包含能力信息。
  const hasCapabilities = Boolean(
    capabilities &&
      (Object.keys(capabilities.common ?? {}).length > 0 ||
        Object.keys(capabilities.params ?? {}).length > 0 ||
        Object.keys(capabilities.input ?? {}).length > 0 ||
        Object.keys(capabilities.output ?? {}).length > 0)
  );
  if (hasTags || hasCapabilities) {
    return fromConfig;
  }
  const registryModel = await getModelDefinition(providerEntry.providerId, modelId) ?? fromConfig;
  return registryModel;
}

