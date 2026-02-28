/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { SaaSClient } from "@openloaf-saas/sdk";
import { getSaasBaseUrl } from "./core/config";

/** Connect timeout for SaaS requests (ms). */
const SAAS_TIMEOUT_MS = 30_000;

/** Fetch wrapper with configurable timeout. */
const timeoutFetcher: typeof fetch = (input, init) => {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(SAAS_TIMEOUT_MS),
  });
};

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
      fetcher: timeoutFetcher,
    });
  }
  if (cached?.baseUrl === baseUrl) {
    return cached.client;
  }
  // 逻辑：baseUrl 变化时才重建 client，避免重复创建。
  const client = new SaaSClient({ baseUrl, fetcher: timeoutFetcher });
  cached = { baseUrl, client };
  return client;
}
