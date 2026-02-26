import { SaaSClient } from "@openloaf-saas/sdk";
import { getSaasBaseUrl } from "./core/config";

/** Cache SaaS client instance by base URL. */
let cached: { baseUrl: string; client: SaaSClient } | null = null;

/** Get SaaS SDK client with optional access token. */
export function getSaasClient(accessToken?: string): SaaSClient {
  const baseUrl = getSaasBaseUrl();
  if (accessToken) {
    // 逻辑：按请求传入 token 时不复用缓存，避免跨用户共享。
    return new SaaSClient({
      baseUrl,
      getAccessToken: () => accessToken,
    });
  }
  if (cached?.baseUrl === baseUrl) {
    return cached.client;
  }
  // 逻辑：baseUrl 变化时才重建 client，避免重复创建。
  const client = new SaaSClient({ baseUrl });
  cached = { baseUrl, client };
  return client;
}
