/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { logger } from "@/common/logger";

import {
  getEmailEnvValue,
  removeEmailEnvValue,
  setEmailEnvValue,
} from "../emailEnvStore";
import { refreshAccessToken } from "./oauthFlow";
import type { OAuthTokenSet } from "./types";

/** Buffer before expiry to trigger proactive refresh (5 minutes). */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** Convert email address into slug for env key (same logic as emailAccountService). */
function toEmailSlug(emailAddress: string): string {
  return emailAddress
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Build env key for OAuth refresh token. */
function buildRefreshTokenKey(workspaceId: string, slug: string): string {
  return `EMAIL_OAUTH_REFRESH__${workspaceId}__${slug}`;
}

/** Build env key for OAuth access token. */
function buildAccessTokenKey(workspaceId: string, slug: string): string {
  return `EMAIL_OAUTH_ACCESS__${workspaceId}__${slug}`;
}

/** Build env key for OAuth token expiry timestamp. */
function buildExpiresKey(workspaceId: string, slug: string): string {
  return `EMAIL_OAUTH_EXPIRES__${workspaceId}__${slug}`;
}

/** Build env key for OAuth provider id. */
function buildProviderKey(workspaceId: string, slug: string): string {
  return `EMAIL_OAUTH_PROVIDER__${workspaceId}__${slug}`;
}

/**
 * Store OAuth tokens in .env via emailEnvStore.
 * Persists access token, refresh token, expiry, and provider id.
 */
export function storeOAuthTokens(
  workspaceId: string,
  emailAddress: string,
  providerId: string,
  tokens: OAuthTokenSet,
): void {
  const slug = toEmailSlug(emailAddress);
  setEmailEnvValue(buildAccessTokenKey(workspaceId, slug), tokens.accessToken);
  setEmailEnvValue(buildRefreshTokenKey(workspaceId, slug), tokens.refreshToken);
  setEmailEnvValue(buildExpiresKey(workspaceId, slug), String(tokens.expiresAt));
  setEmailEnvValue(buildProviderKey(workspaceId, slug), providerId);

  logger.info(
    { workspaceId, emailAddress, providerId },
    "OAuth tokens stored",
  );
}

/**
 * Read OAuth tokens from .env for a given email account.
 * Returns null if tokens are not found.
 */
export function getOAuthTokens(
  workspaceId: string,
  emailAddress: string,
): OAuthTokenSet | null {
  const slug = toEmailSlug(emailAddress);
  const accessToken = getEmailEnvValue(buildAccessTokenKey(workspaceId, slug));
  const refreshToken = getEmailEnvValue(buildRefreshTokenKey(workspaceId, slug));
  const expiresRaw = getEmailEnvValue(buildExpiresKey(workspaceId, slug));

  if (!accessToken || !refreshToken || !expiresRaw) {
    return null;
  }

  const expiresAt = Number(expiresRaw);
  if (Number.isNaN(expiresAt)) {
    return null;
  }

  return { accessToken, refreshToken, expiresAt };
}

/**
 * Remove all OAuth token entries from .env for a given email account.
 */
export function removeOAuthTokens(
  workspaceId: string,
  emailAddress: string,
): void {
  const slug = toEmailSlug(emailAddress);
  removeEmailEnvValue(buildAccessTokenKey(workspaceId, slug));
  removeEmailEnvValue(buildRefreshTokenKey(workspaceId, slug));
  removeEmailEnvValue(buildExpiresKey(workspaceId, slug));
  removeEmailEnvValue(buildProviderKey(workspaceId, slug));

  logger.info({ workspaceId, emailAddress }, "OAuth tokens removed");
}

/**
 * Ensure the access token is valid. If expired (or within 5-minute buffer),
 * refresh it automatically and persist the new tokens.
 * Returns a valid OAuthTokenSet or throws if refresh fails.
 */
export async function ensureValidAccessToken(
  workspaceId: string,
  emailAddress: string,
  providerId: string,
): Promise<OAuthTokenSet> {
  const tokens = getOAuthTokens(workspaceId, emailAddress);
  if (!tokens) {
    throw new Error(`未找到 ${emailAddress} 的 OAuth 令牌。`);
  }

  const now = Date.now();
  const isExpired = tokens.expiresAt - now < EXPIRY_BUFFER_MS;

  if (!isExpired) {
    return tokens;
  }

  // 逻辑：令牌即将过期或已过期，执行刷新。
  logger.info(
    { workspaceId, emailAddress, providerId },
    "OAuth access token expired, refreshing",
  );

  const refreshed = await refreshAccessToken(providerId, tokens.refreshToken);
  storeOAuthTokens(workspaceId, emailAddress, providerId, refreshed);

  return refreshed;
}
