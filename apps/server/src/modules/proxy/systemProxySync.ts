import { getEnvString } from "@teatime-ai/config";
import prisma from "@teatime-ai/db";
import { setSettingValue } from "@/modules/settings/settingsService";
import { ServerSettingDefs } from "@/settings/settingDefs";

type ProxySettingsSnapshot = {
  enabled: boolean;
  host: string;
  port: string;
  username: string;
  password: string;
};

/**
 * Parse a proxy URL into settings fields.
 */
function parseProxyUrl(raw: string): ProxySettingsSnapshot | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(value);
    const port =
      url.port ||
      (url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "");
    return {
      enabled: Boolean(url.hostname),
      host: url.hostname ?? "",
      port,
      username: url.username ? decodeURIComponent(url.username) : "",
      password: url.password ? decodeURIComponent(url.password) : "",
    };
  } catch {
    return null;
  }
}

/**
 * Read proxy settings from system env overrides.
 */
function readProxySettingsFromEnv(
  env: Record<string, string | undefined> = process.env,
): ProxySettingsSnapshot {
  const proxyValue =
    getEnvString(env, "TEATIME_HTTPS_PROXY") ??
    getEnvString(env, "HTTPS_PROXY") ??
    getEnvString(env, "https_proxy") ??
    getEnvString(env, "TEATIME_HTTP_PROXY") ??
    getEnvString(env, "HTTP_PROXY") ??
    getEnvString(env, "http_proxy") ??
    getEnvString(env, "ALL_PROXY") ??
    getEnvString(env, "all_proxy");

  const hasProxyValue = Boolean(proxyValue);
  const parsed = proxyValue ? parseProxyUrl(proxyValue) : null;
  if (!parsed) {
    return {
      enabled: false,
      host: "",
      port: "",
      username: "",
      password: "",
    };
  }
  return {
    ...parsed,
    enabled: hasProxyValue,
  };
}

/**
 * Sync current system proxy settings into the settings table.
 */
export async function syncSystemProxySettings(): Promise<void> {
  const existing = await prisma.setting.findFirst({
    where: {
      category: "proxy",
    },
  });
  // 启动时若已有代理设置，保持现有配置不覆盖。
  if (existing) return;
  const snapshot = readProxySettingsFromEnv();
  // 流程：启动时同步系统代理配置，确保设置表与当前环境一致。
  await Promise.all([
    setSettingValue(ServerSettingDefs.ProxyEnabled.key, snapshot.enabled),
    setSettingValue(ServerSettingDefs.ProxyHost.key, snapshot.host),
    setSettingValue(ServerSettingDefs.ProxyPort.key, snapshot.port),
    setSettingValue(ServerSettingDefs.ProxyUsername.key, snapshot.username),
    setSettingValue(ServerSettingDefs.ProxyPassword.key, snapshot.password),
  ]);
}
