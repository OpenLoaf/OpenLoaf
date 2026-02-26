/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { getEnvString } from "@openloaf/config";
import { readBasicConf, writeBasicConf } from "@/modules/settings/openloafConfStore";

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
    getEnvString(env, "OPENLOAF_HTTPS_PROXY") ??
    getEnvString(env, "HTTPS_PROXY") ??
    getEnvString(env, "https_proxy") ??
    getEnvString(env, "OPENLOAF_HTTP_PROXY") ??
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
 * Sync current system proxy settings into settings.json.
 */
export async function syncSystemProxySettings(): Promise<void> {
  const basic = readBasicConf();
  const hasProxyConfig =
    basic.proxyEnabled ||
    Boolean(
      basic.proxyHost ||
      basic.proxyPort ||
      basic.proxyUsername ||
      basic.proxyPassword,
    );
  // 启动时若已有代理设置，保持现有配置不覆盖。
  if (hasProxyConfig) return;
  const snapshot = readProxySettingsFromEnv();
  // 流程：启动时同步系统代理配置，确保配置与当前环境一致。
  writeBasicConf({
    ...basic,
    proxyEnabled: snapshot.enabled,
    proxyHost: snapshot.host,
    proxyPort: snapshot.port,
    proxyUsername: snapshot.username,
    proxyPassword: snapshot.password,
  });
}
