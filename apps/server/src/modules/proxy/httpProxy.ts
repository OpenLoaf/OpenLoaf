import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { getEnvString } from "@teatime-ai/config";

type ProxyConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
};

/**
 * Appends local loopback hosts to a no_proxy list.
 */
function ensureLocalNoProxy(raw?: string): string {
  const items = (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const existing = new Set(items);
  const required = ['localhost', '127.0.0.1', '::1'];
  // 追加本地回环地址，避免服务端内部请求被代理拦截。
  for (const host of required) {
    if (!existing.has(host)) items.push(host);
  }
  return items.join(',');
}

/**
 * Read proxy settings from env vars with Teatime overrides.
 */
function readProxyConfig(env: Record<string, string | undefined> = process.env): ProxyConfig {
  return {
    httpProxy: getEnvString(env, "TEATIME_HTTP_PROXY")
      ?? getEnvString(env, "HTTP_PROXY")
      ?? getEnvString(env, "http_proxy"),
    httpsProxy: getEnvString(env, "TEATIME_HTTPS_PROXY")
      ?? getEnvString(env, "HTTPS_PROXY")
      ?? getEnvString(env, "https_proxy"),
    noProxy: getEnvString(env, "TEATIME_NO_PROXY")
      ?? getEnvString(env, "NO_PROXY")
      ?? getEnvString(env, "no_proxy"),
  };
}

/**
 * Check whether any proxy value is configured.
 */
function hasProxyConfig(config: ProxyConfig): boolean {
  return Boolean(config.httpProxy || config.httpsProxy || config.noProxy);
}

/**
 * Install the global HTTP(S) proxy dispatcher for server-side requests.
 */
export function installHttpProxy(): void {
  const config = readProxyConfig();
  if (!hasProxyConfig(config)) return;
  const mergedNoProxy = ensureLocalNoProxy(config.noProxy);

  // 流程说明：
  // 1) 读取 Teatime 覆盖与标准代理环境变量
  // 2) 将覆盖值回写到标准 env key，确保 undici 能读取
  // 3) 设置全局 dispatcher，让 fetch/AI SDK 等请求走代理
  if (config.httpProxy) {
    process.env.HTTP_PROXY = config.httpProxy;
    process.env.http_proxy = config.httpProxy;
  }
  if (config.httpsProxy) {
    process.env.HTTPS_PROXY = config.httpsProxy;
    process.env.https_proxy = config.httpsProxy;
  }
  if (mergedNoProxy) {
    process.env.NO_PROXY = mergedNoProxy;
    process.env.no_proxy = mergedNoProxy;
  }

  setGlobalDispatcher(new EnvHttpProxyAgent());
}
