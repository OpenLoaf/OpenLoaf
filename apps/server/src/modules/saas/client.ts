import { SaaSClient } from "@tenas-saas/sdk";
import { getAccessToken } from "@/modules/auth/tokenStore";
import { getSaasBaseUrl } from "./core/config";

/** Cache SaaS client instance by base URL. */
let cached: { baseUrl: string; client: SaaSClient } | null = null;

/** Get SaaS SDK client with shared access token provider. */
export function getSaasClient(): SaaSClient {
  const baseUrl = getSaasBaseUrl();
  if (cached?.baseUrl === baseUrl) {
    return cached.client;
  }
  // 逻辑：baseUrl 变化时才重建 client，避免重复创建。
  const client = new SaaSClient({
    baseUrl,
    getAccessToken: () => getAccessToken() ?? "",
  });
  cached = { baseUrl, client };
  return client;
}
