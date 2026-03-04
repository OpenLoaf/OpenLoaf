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

type CliModelSelection = {
  /** CLI provider id. */
  providerId: string;
  /** CLI model id. */
  modelId: string;
};

/** Hardcoded fallback definitions for CLI providers (used when SaaS API has no entry). */
const CLI_PROVIDER_FALLBACKS: Record<string, ProviderDefinition> = {
  "claude-code-cli": {
    id: "claude-code-cli",
    label: "Claude Code",
    adapterId: "cli",
    models: [
      { id: "claude-sonnet-4-6", name: "Sonnet 4.6", tags: ["code"] },
      { id: "claude-opus-4-6", name: "Opus 4.6", tags: ["code"] },
      { id: "claude-haiku-4-5", name: "Haiku 4.5", tags: ["code"] },
    ],
  } as ProviderDefinition,
  "codex-cli": {
    id: "codex-cli",
    label: "Codex CLI",
    adapterId: "cli",
    models: [
      { id: "gpt-5.3-codex", name: "GPT-5.3-Codex", tags: ["code"] },
      { id: "gpt-5.2-codex", name: "GPT-5.2-Codex", tags: ["code"] },
      { id: "gpt-5-codex", name: "GPT-5-Codex", tags: ["code"] },
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
  // 逻辑：CLI provider 始终使用本地定义，不从 SaaS 获取（避免被远程配置覆盖）
  const definition = CLI_PROVIDER_FALLBACKS[binding.providerId];
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

/** Parse provider:modelId form from a selection string. */
function parseCliModelSelection(selection: string): CliModelSelection | null {
  const normalized = selection.trim();
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) return null;
  const providerId = normalized.slice(0, separatorIndex).trim();
  const modelId = normalized.slice(separatorIndex + 1).trim();
  if (!providerId || !modelId) return null;
  return { providerId, modelId };
}

/** Resolve first available model id from a binding. */
async function resolveFirstModelId(binding: CliProviderBinding): Promise<string | null> {
  const entry = await buildCliProviderEntry(binding);
  if (!entry) return null;
  const firstModelId = Object.keys(entry.models)[0];
  if (!firstModelId) return null;
  return `${entry.id}:${firstModelId}`;
}

/**
 * 将 CLI 选择映射为可用的 chatModelId。
 * 支持：
 * 1) 旧格式 configKey（例如 "codex" / "claudeCode"）
 * 2) 新格式 provider:modelId（例如 "codex-cli:gpt-5.3-codex"）
 * 3) providerId（例如 "codex-cli"）
 */
export async function resolveCliChatModelId(
  selection: string,
): Promise<string | null> {
  const normalized = selection.trim();
  if (!normalized) return null;

  const parsed = parseCliModelSelection(normalized);
  if (parsed) {
    const binding = CLI_PROVIDER_BINDINGS.find(
      (item) => item.providerId === parsed.providerId,
    );
    if (!binding) return null;
    const entry = await buildCliProviderEntry(binding);
    if (!entry) return null;
    if (entry.models[parsed.modelId]) {
      return `${entry.id}:${parsed.modelId}`;
    }
    // 逻辑：当选择的模型已不存在时，自动回退到该 provider 的首个可用模型。
    return resolveFirstModelId(binding);
  }

  const providerBinding = CLI_PROVIDER_BINDINGS.find(
    (item) => item.providerId === normalized,
  );
  if (providerBinding) {
    return resolveFirstModelId(providerBinding);
  }

  const configBinding = CLI_PROVIDER_BINDINGS.find(
    (item) => item.configKey === normalized,
  );
  if (!configBinding) return null;
  return resolveFirstModelId(configBinding);
}

/** Get available Codex CLI models from fallback definition. */
export function getCodexCliModels() {
  const definition = CLI_PROVIDER_FALLBACKS["codex-cli"];
  if (!definition) return [];
  return Array.isArray(definition.models) ? definition.models : [];
}

/** Get available Claude Code CLI models from fallback definition. */
export function getClaudeCodeCliModels() {
  const definition = CLI_PROVIDER_FALLBACKS["claude-code-cli"];
  if (!definition) return [];
  return Array.isArray(definition.models) ? definition.models : [];
}
