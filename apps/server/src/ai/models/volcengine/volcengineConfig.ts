import type { ProviderDefinition } from "@tenas-ai/api/common";
import type { ProviderSettingEntry } from "@/modules/settings/settingsService";

export const VOLCENGINE_REGION = "cn-north-1";
export const VOLCENGINE_SERVICE = "cv";
export const VOLCENGINE_VERSION = "2022-08-31";
export const VOLCENGINE_CONTENT_TYPE = "application/json";

export type VolcengineProviderConfig = {
  /** API base URL. */
  apiUrl: string;
  /** Access key id. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
};

/** Resolve Volcengine provider config from settings entry. */
export function resolveVolcengineConfig(input: {
  /** Provider settings entry. */
  provider: ProviderSettingEntry;
  /** Provider definition fallback. */
  providerDefinition?: ProviderDefinition;
}): VolcengineProviderConfig {
  const apiUrl = input.provider.apiUrl.trim() || input.providerDefinition?.apiUrl?.trim() || "";
  const accessKeyRaw = input.provider.authConfig.accessKeyId;
  const secretKeyRaw = input.provider.authConfig.secretAccessKey;
  const accessKeyId = typeof accessKeyRaw === "string" ? accessKeyRaw.trim() : "";
  const secretAccessKey = typeof secretKeyRaw === "string" ? secretKeyRaw.trim() : "";
  // 中文注释：认证信息缺失直接阻断调用。
  if (!apiUrl || !accessKeyId || !secretAccessKey) {
    throw new Error("Volcengine 配置缺失");
  }
  return { apiUrl, accessKeyId, secretAccessKey };
}
