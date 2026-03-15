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

/**
 * Fixed scope key for env key naming (backward compatible).
 * Legacy env keys used project-space naming; current email scope is global.
 */
const ENV_KEY_SCOPE = "default";

/** Convert email address into slug for env key (same logic as emailAccountService). */
function toEmailSlug(emailAddress: string): string {
  return emailAddress
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Build env key for OAuth refresh token. */
function buildRefreshTokenKey(slug: string): string {
  return `EMAIL_OAUTH_REFRESH__${ENV_KEY_SCOPE}__${slug}`;
}

/** Build env key for OAuth access token. */
function buildAccessTokenKey(slug: string): string {
  return `EMAIL_OAUTH_ACCESS__${ENV_KEY_SCOPE}__${slug}`;
}

/** Build env key for OAuth token expiry timestamp. */
function buildExpiresKey(slug: string): string {
  return `EMAIL_OAUTH_EXPIRES__${ENV_KEY_SCOPE}__${slug}`;
}

/** Build env key for OAuth provider id. */
function buildProviderKey(slug: string): string {
  return `EMAIL_OAUTH_PROVIDER__${ENV_KEY_SCOPE}__${slug}`;
}

/**
 * Store OAuth tokens in .env via emailEnvStore.
 * Persists access token, refresh token, expiry, and provider id.
 */
export function storeOAuthTokens(
  emailAddress: string,
  providerId: string,
  tokens: OAuthTokenSet,
): void {
  const slug = toEmailSlug(emailAddress);
  setEmailEnvValue(buildAccessTokenKey(slug), tokens.accessToken);
  setEmailEnvValue(buildRefreshTokenKey(slug), tokens.refreshToken);
  setEmailEnvValue(buildExpiresKey(slug), String(tokens.expiresAt));
  setEmailEnvValue(buildProviderKey(slug), providerId);

  logger.info(
    { emailAddress, providerId },
    "OAuth tokens stored",
  );
}

/**
 * Read OAuth tokens from .env for a given email account.
 * Returns null if tokens are not found.
 */
function getOAuthTokens(
  emailAddress: string,
): OAuthTokenSet | null {
  const slug = toEmailSlug(emailAddress);
  const accessToken = getEmailEnvValue(buildAccessTokenKey(slug));
  const refreshToken = getEmailEnvValue(buildRefreshTokenKey(slug));
  const expiresRaw = getEmailEnvValue(buildExpiresKey(slug));

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
function removeOAuthTokens(
  emailAddress: string,
): void {
  const slug = toEmailSlug(emailAddress);
  removeEmailEnvValue(buildAccessTokenKey(slug));
  removeEmailEnvValue(buildRefreshTokenKey(slug));
  removeEmailEnvValue(buildExpiresKey(slug));
  removeEmailEnvValue(buildProviderKey(slug));

  logger.info({ emailAddress }, "OAuth tokens removed");
}

/**
 * Ensure the access token is valid. If expired (or within 5-minute buffer),
 * refresh it automatically and persist the new tokens.
 * Returns a valid OAuthTokenSet or throws if refresh fails.
 */
export async function ensureValidAccessToken(
  emailAddress: string,
  providerId: string,
): Promise<OAuthTokenSet> {
  const tokens = getOAuthTokens(emailAddress);
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
    { emailAddress, providerId },
    "OAuth access token expired, refreshing",
  );

  const refreshed = await refreshAccessToken(providerId, tokens.refreshToken);
  storeOAuthTokens(emailAddress, providerId, refreshed);

  return refreshed;
}
