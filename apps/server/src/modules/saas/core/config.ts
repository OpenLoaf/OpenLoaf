import { getEnvString } from "@openloaf/config";

/** Resolve SaaS base URL from environment. */
export function getSaasBaseUrl(): string {
  const value = getEnvString(process.env, "OPENLOAF_SAAS_URL");
  if (!value || !value.trim()) {
    // 逻辑：缺失时抛错，便于上层统一处理。
    throw new Error("saas_url_missing");
  }
  // 逻辑：去掉末尾 /，避免拼接重复。
  return value.trim().replace(/\/$/, "");
}

/** Resolve SaaS auth base URL from environment. */
export function getSaasAuthBaseUrl(): string {
  const value = getEnvString(process.env, "OPENLOAF_SAAS_AUTH_URL");
  if (!value || !value.trim()) {
    // 逻辑：缺失时抛错，便于上层统一处理。
    throw new Error("saas_auth_url_missing");
  }
  // 逻辑：去掉末尾 /，避免拼接重复。
  return value.trim().replace(/\/$/, "");
}

/** Build SaaS login URL for system browser. */
export function buildSaasLoginUrl(port: number): string {
  const base = getSaasAuthBaseUrl();
  const url = new URL(`${base}/login`);
  // 逻辑：登录来源固定 electron，服务端返回后回调本地端口。
  url.searchParams.set("from", "electron");
  url.searchParams.set("port", String(port));
  return url.toString();
}
