import type { ProviderDefinition } from "@tenas-ai/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";

type QwenProviderConfig = {
  /** API base URL. */
  apiUrl: string;
  /** API key. */
  apiKey: string;
};

/** Resolve Qwen provider config from settings entry. */
export function resolveQwenConfig(input: {
  /** Provider settings entry. */
  provider: ProviderSettingEntry;
  /** Provider definition fallback. */
  providerDefinition?: ProviderDefinition;
}): QwenProviderConfig {
  const apiUrl = input.provider.apiUrl.trim() || input.providerDefinition?.apiUrl?.trim() || "";
  const apiKeyRaw = input.provider.authConfig.apiKey;
  const apiKey = typeof apiKeyRaw === "string" ? apiKeyRaw.trim() : "";
  // 中文注释：apiUrl 与 apiKey 任意缺失都视为不可用。
  if (!apiUrl || !apiKey) {
    throw new Error("Qwen 配置缺失");
  }
  return { apiUrl, apiKey };
}
