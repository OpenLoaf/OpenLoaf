/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AuthClientInfo, AuthRefreshResponse } from "@openloaf-saas/sdk";
import { getSaasClient } from "../../client";
import { logger } from "../../../../common/logger";

let cachedClientInfo: AuthClientInfo | undefined;
function buildClientInfo(): AuthClientInfo {
  if (cachedClientInfo) return cachedClientInfo;
  let appVersion: string | undefined;
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; version?: string };
        if (pkg.name === "server") {
          appVersion = pkg.version;
          break;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // 逻辑：读不到 package.json 时静默兜底，clientInfo.appVersion 留空。
  }
  cachedClientInfo = {
    appId: "openloaf-server",
    platform: process.platform,
    ...(appVersion ? { appVersion } : {}),
  };
  return cachedClientInfo;
}

/** Token exchange / refresh user shape from SaaS SDK. */
export type SaasAuthSdkUser = {
  /** Display name. */
  name?: string;
  /** Email. */
  email?: string;
  /** Avatar URL. */
  avatarUrl?: string;
  /** Admin flag. */
  isAdmin?: boolean;
};

/** Success payload for token exchange / refresh. */
export type SaasAuthTokenResult = {
  /** Access token. */
  accessToken: string;
  /** Refresh token. */
  refreshToken: string;
  /** User profile snapshot. */
  user: SaasAuthSdkUser;
};

/** Refresh access token via SaaS SDK. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthRefreshResponse> {
  logger.info("[auth] refreshing access token via SaaS SDK");
  // 逻辑：统一走 SDK 并复用缓存 client。
  const client = getSaasClient();
  try {
    const result = await client.auth.refresh(refreshToken, buildClientInfo());
    logger.info("[auth] access token refreshed successfully");
    return result;
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "[auth] access token refresh failed");
    throw error;
  }
}

/** Exchange a one-time login code for tokens via SaaS SDK. */
export async function exchangeLoginCodeViaSaas(
  loginCode: string,
): Promise<SaasAuthTokenResult> {
  logger.info("[auth] exchanging login code via SaaS SDK");
  const client = getSaasClient();
  try {
    const result = await client.auth.exchange(loginCode, buildClientInfo());
    logger.info({ email: result.user?.email }, "[auth] login code exchanged successfully");
    return result;
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "[auth] login code exchange failed",
    );
    throw error;
  }
}

/** Revoke refresh token on SaaS (best effort). */
export async function revokeRefreshTokenViaSaas(
  refreshToken: string,
): Promise<void> {
  try {
    const client = getSaasClient();
    await client.auth.logout(refreshToken);
    logger.info("[auth] refresh token revoked on SaaS");
  } catch (error) {
    // 逻辑：注销是最大努力，上游失败不阻塞本地清理。
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "[auth] refresh token revoke failed",
    );
  }
}
