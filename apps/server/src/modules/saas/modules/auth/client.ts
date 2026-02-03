import type { AuthRefreshResponse } from "@tenas-saas/sdk/server";
import { getSaasClient } from "../../client";

/** Refresh access token via SaaS SDK. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthRefreshResponse> {
  // 逻辑：统一走 SDK 并复用缓存 client。
  const client = getSaasClient();
  return client.auth.refresh(refreshToken);
}
