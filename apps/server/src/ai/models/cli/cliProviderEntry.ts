/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ProviderDefinition, ModelDefinition } from "@openloaf/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { getProviderDefinition } from "@/ai/models/modelRegistry";
import { getCliToolStatus } from "@/ai/models/cli/cliToolService";
type CliProviderBinding = {
  /** Provider id in registry. */
  providerId: string;
  /** Basic config key. */
  configKey: "codex" | "claudeCode";
};

/** CLI provider bindings for registry injection. */
const CLI_PROVIDER_BINDINGS: CliProviderBinding[] = [
  { providerId: "codex-cli", configKey: "codex" },
  { providerId: "claude-code-cli", configKey: "claudeCode" },
];

/** Hardcoded fallback definitions for CLI providers (used when SaaS API has no entry). */
const CLI_PROVIDER_FALLBACKS: Record<string, ProviderDefinition> = {
  "claude-code-cli": {
    id: "claude-code-cli",
    label: "Claude Code",
    adapterId: "cli",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", tags: ["code"] },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4", tags: ["code"] },
    ],
  } as ProviderDefinition,
  "codex-cli": {
    id: "codex-cli",
    label: "Codex CLI",
    adapterId: "cli",
    models: [
      { id: "codex-mini", name: "Codex Mini", tags: ["code"] },
    ],
  } as ProviderDefinition,
};

/** Build enabled model map from provider definition. */
function buildModelMap(definition: ProviderDefinition): Record<string, ModelDefinition> {
  const models = Array.isArray(definition.models) ? definition.models : [];
  const modelMap: Record<string, ModelDefinition> = {};
  for (const model of models) {
    if (!model || !model.id) continue;
    modelMap[model.id] = { ...model, providerId: definition.id };
  }
  return modelMap;
}

/** Build CLI provider settings entry for runtime. */
async function buildCliProviderEntry(binding: CliProviderBinding): Promise<ProviderSettingEntry | null> {
  const definition = await getProviderDefinition(binding.providerId)
    ?? CLI_PROVIDER_FALLBACKS[binding.providerId];
  if (!definition) return null;
  // 逻辑：未安装的 CLI 工具不注入 provider，避免 Auto 模式误选。
  const status = await getCliToolStatus(binding.configKey);
  if (!status.installed) return null;
  const models = buildModelMap(definition);
  if (Object.keys(models).length === 0) return null;
  const basic = readBasicConf();
  const cliConfig = basic.cliTools[binding.configKey];
  // 逻辑：CLI 配置来自基础设置，不依赖 provider 列表存储。
  return {
    id: binding.providerId,
    key: definition.label || binding.providerId,
    providerId: binding.providerId,
    apiUrl: cliConfig.apiUrl.trim(),
    authConfig: {
      apiKey: cliConfig.apiKey.trim(),
      forceCustomApiKey: cliConfig.forceCustomApiKey,
    },
    models,
    updatedAt: new Date(),
  };
}

/** Build CLI provider entries for model resolution. */
export async function buildCliProviderEntries(): Promise<ProviderSettingEntry[]> {
  const entries: ProviderSettingEntry[] = [];
  for (const binding of CLI_PROVIDER_BINDINGS) {
    const entry = await buildCliProviderEntry(binding);
    if (!entry) continue;
    entries.push(entry);
  }
  return entries;
}
