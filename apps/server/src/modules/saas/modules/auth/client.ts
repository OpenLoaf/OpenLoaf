/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { AuthRefreshResponse } from "@openloaf-saas/sdk";
import { getSaasClient } from "../../client";

/** Refresh access token via SaaS SDK. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthRefreshResponse> {
  // 逻辑：统一走 SDK 并复用缓存 client。
  const client = getSaasClient();
  return client.auth.refresh(refreshToken);
}
