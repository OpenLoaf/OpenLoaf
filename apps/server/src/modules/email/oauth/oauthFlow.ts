/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createHash, randomBytes } from "node:crypto";

import { logger } from "@/common/logger";

import { getOAuthProvider } from "./providers";
import type { OAuthState, OAuthTokenSet, OAuthExchangeResult } from "./types";

/** Pending OAuth states keyed by state string. TTL = 10 minutes. */
const pendingStates = new Map<string, OAuthState>();

/** TTL for pending OAuth states in milliseconds (10 minutes). */
const STATE_TTL_MS = 10 * 60 * 1000;

/** Generate a cryptographically random base64url string. */
function randomBase64url(byteLength: number): string {
  return randomBytes(byteLength)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Compute SHA-256 hash and return base64url encoded string. */
function sha256Base64url(input: string): string {
  return createHash("sha256")
    .update(input, "utf-8")
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Purge expired pending states from the map. */
function purgeExpiredStates(): void {
  const now = Date.now();
  for (const [key, state] of pendingStates) {
    if (now - state.timestamp > STATE_TTL_MS) {
      pendingStates.delete(key);
    }
  }
}

/**
 * Generate an OAuth authorization URL with PKCE.
 * Returns the URL to redirect the user to and the state key for later exchange.
 */
export function generateAuthUrl(
  providerId: string,
  workspaceId: string,
  redirectUri: string,
): { url: string; stateKey: string } {
  purgeExpiredStates();

  const provider = getOAuthProvider(providerId);
  const clientId = process.env[provider.clientIdEnvKey];
  if (!clientId) {
    throw new Error(`缺少环境变量：${provider.clientIdEnvKey}`);
  }

  const codeVerifier = randomBase64url(64);
  const codeChallenge = sha256Base64url(codeVerifier);
  const stateKey = randomBase64url(32);

  const oauthState: OAuthState = {
    providerId,
    workspaceId,
    codeVerifier,
    redirectUri,
    timestamp: Date.now(),
  };
  pendingStates.set(stateKey, oauthState);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: provider.scopes.join(" "),
    state: stateKey,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  // 逻辑：Microsoft 需要 prompt=consent 确保返回 refresh_token。
  if (providerId === "microsoft") {
    params.set("prompt", "consent");
  }

  // 逻辑：Google 需要 access_type=offline 和 prompt=consent 获取 refresh_token。
  if (providerId === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }

  const url = `${provider.authorizeUrl}?${params.toString()}`;
  logger.info({ providerId, workspaceId }, "OAuth authorization URL generated");

  return { url, stateKey };
}

/**
 * Exchange authorization code for tokens using the stored PKCE state.
 * Returns tokens along with providerId and workspaceId from the original state.
 */
export async function exchangeCode(
  stateKey: string,
  code: string,
): Promise<OAuthExchangeResult> {
  purgeExpiredStates();

  const state = pendingStates.get(stateKey);
  if (!state) {
    throw new Error("OAuth 状态无效或已过期。");
  }
  // 逻辑：使用后立即删除，防止重放攻击。
  pendingStates.delete(stateKey);

  const provider = getOAuthProvider(state.providerId);
  const clientId = process.env[provider.clientIdEnvKey];
  if (!clientId) {
    throw new Error(`缺少环境变量：${provider.clientIdEnvKey}`);
  }

  const body: Record<string, string> = {
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: state.redirectUri,
    code_verifier: state.codeVerifier,
  };

  // 逻辑：如果配置了 client_secret，则附加到请求体中。
  if (provider.clientSecretEnvKey) {
    const clientSecret = process.env[provider.clientSecretEnvKey];
    if (clientSecret) {
      body.client_secret = clientSecret;
    }
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { providerId: state.providerId, status: response.status, errorText },
      "OAuth token exchange failed",
    );
    throw new Error(`OAuth 令牌交换失败（${response.status}）。`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const expiresIn = data.expires_in;

  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("OAuth 响应中缺少 access_token。");
  }
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw new Error("OAuth 响应中缺少 refresh_token。");
  }

  const expiresAt =
    typeof expiresIn === "number"
      ? Date.now() + expiresIn * 1000
      : Date.now() + 3600 * 1000;

  logger.info({ providerId: state.providerId }, "OAuth token exchange succeeded");

  return {
    tokens: { accessToken, refreshToken, expiresAt },
    providerId: state.providerId,
    workspaceId: state.workspaceId,
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  providerId: string,
  refreshToken: string,
): Promise<OAuthTokenSet> {
  const provider = getOAuthProvider(providerId);
  const clientId = process.env[provider.clientIdEnvKey];
  if (!clientId) {
    throw new Error(`缺少环境变量：${provider.clientIdEnvKey}`);
  }

  const body: Record<string, string> = {
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  if (provider.clientSecretEnvKey) {
    const clientSecret = process.env[provider.clientSecretEnvKey];
    if (clientSecret) {
      body.client_secret = clientSecret;
    }
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { providerId, status: response.status, errorText },
      "OAuth token refresh failed",
    );
    throw new Error(`OAuth 令牌刷新失败（${response.status}）。`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = data.access_token;
  const newRefreshToken = data.refresh_token;
  const expiresIn = data.expires_in;

  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("OAuth 刷新响应中缺少 access_token。");
  }

  const expiresAt =
    typeof expiresIn === "number"
      ? Date.now() + expiresIn * 1000
      : Date.now() + 3600 * 1000;

  logger.info({ providerId }, "OAuth token refresh succeeded");

  return {
    accessToken,
    // 逻辑：部分提供商在刷新时返回新的 refresh_token，优先使用新值。
    refreshToken: typeof newRefreshToken === "string" && newRefreshToken
      ? newRefreshToken
      : refreshToken,
    expiresAt,
  };
}

/**
 * Fetch user email address from the provider's userinfo endpoint.
 */
export async function fetchUserEmail(
  providerId: string,
  accessToken: string,
): Promise<string> {
  const provider = getOAuthProvider(providerId);

  const response = await fetch(provider.userInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { providerId, status: response.status, errorText },
      "OAuth userinfo fetch failed",
    );
    throw new Error(`获取用户信息失败（${response.status}）。`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return provider.parseUserEmail(data);
}
