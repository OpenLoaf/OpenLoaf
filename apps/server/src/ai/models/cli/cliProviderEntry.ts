import type { ProviderDefinition, ModelDefinition } from "@tenas-ai/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { getProviderDefinition } from "@/ai/models/modelRegistry";
type CliProviderBinding = {
  /** Provider id in registry. */
  providerId: string;
  /** Basic config key. */
  configKey: "codex" | "claudeCode";
};

/** CLI provider bindings for registry injection. */
const CLI_PROVIDER_BINDINGS: CliProviderBinding[] = [
  { providerId: "codex-cli", configKey: "codex" },
];

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
function buildCliProviderEntry(binding: CliProviderBinding): ProviderSettingEntry | null {
  const definition = getProviderDefinition(binding.providerId);
  if (!definition) return null;
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
export function buildCliProviderEntries(): ProviderSettingEntry[] {
  const entries: ProviderSettingEntry[] = [];
  for (const binding of CLI_PROVIDER_BINDINGS) {
    const entry = buildCliProviderEntry(binding);
    if (!entry) continue;
    entries.push(entry);
  }
  return entries;
}
