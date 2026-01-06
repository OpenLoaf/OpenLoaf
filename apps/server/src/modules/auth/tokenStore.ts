import { clearAuthRefreshToken, readAuthRefreshToken, writeAuthRefreshToken } from "@/modules/settings/teatimeConfStore";

export type AuthUser = {
  /** User subject id. */
  sub?: string;
  /** User email. */
  email?: string;
  /** User display name. */
  name?: string;
  /** Avatar URL. */
  avatarUrl?: string;
  /** Avatar base64 data URL. */
  picture?: string;
};

type AuthSessionState = {
  /** Access token in memory. */
  accessToken?: string;
  /** Access token expiry timestamp (ms). */
  accessTokenExpiresAt?: number;
  /** Refresh token in memory. */
  refreshToken?: string;
  /** User profile snapshot. */
  user?: AuthUser;
};

type AuthSessionSnapshot = {
  /** Whether access token is available. */
  loggedIn: boolean;
  /** User profile snapshot. */
  user?: AuthUser;
};

// 逻辑：仅在内存中保存 access_token 与用户信息。
const sessionState: AuthSessionState = {};
// 逻辑：避免重复读取配置文件。
let refreshTokenLoaded = false;
// 逻辑：提前 60 秒触发刷新，避免 token 过期。
const REFRESH_BUFFER_MS = 60 * 1000;

/**
 * Apply token exchange results into memory and config.
 */
export function applyTokenExchangeResult(input: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: AuthUser;
}): void {
  sessionState.accessToken = input.accessToken;
  sessionState.accessTokenExpiresAt = resolveExpiresAt(input.accessToken, input.expiresIn);
  if (input.refreshToken) {
    setRefreshToken(input.refreshToken);
  }
  if (input.user) {
    sessionState.user = input.user;
  }
}

/**
 * Return the current auth session snapshot.
 */
export function getAuthSessionSnapshot(): AuthSessionSnapshot {
  return {
    loggedIn: isAccessTokenValid(),
    user: sessionState.user,
  };
}

/**
 * Get the access token if it is still valid.
 */
export function getAccessToken(): string | undefined {
  return isAccessTokenValid() ? sessionState.accessToken : undefined;
}

/**
 * Check whether access token is valid and not near expiration.
 */
export function isAccessTokenValid(): boolean {
  if (!sessionState.accessToken) return false;
  if (!sessionState.accessTokenExpiresAt) return true;
  // 逻辑：预留缓冲区，避免即将过期的 token 被继续使用。
  return Date.now() + REFRESH_BUFFER_MS < sessionState.accessTokenExpiresAt;
}

/**
 * Load refresh token from config when needed.
 */
export function loadRefreshTokenIfNeeded(): string | undefined {
  if (!refreshTokenLoaded) {
    refreshTokenLoaded = true;
    const stored = readAuthRefreshToken();
    if (stored) sessionState.refreshToken = stored;
  }
  return sessionState.refreshToken;
}

/**
 * Persist refresh token to config and memory.
 */
export function setRefreshToken(refreshToken: string): void {
  sessionState.refreshToken = refreshToken;
  refreshTokenLoaded = true;
  writeAuthRefreshToken(refreshToken);
}

/**
 * Clear auth session and persisted refresh token.
 */
export function clearAuthSession(): void {
  sessionState.accessToken = undefined;
  sessionState.accessTokenExpiresAt = undefined;
  sessionState.user = undefined;
  sessionState.refreshToken = undefined;
  refreshTokenLoaded = true;
  clearAuthRefreshToken();
}

/**
 * Get refresh token from memory/config.
 */
export function getRefreshToken(): string | undefined {
  return loadRefreshTokenIfNeeded();
}

/**
 * Resolve expiration timestamp from expires_in or token payload.
 */
function resolveExpiresAt(accessToken: string, expiresIn?: number): number | undefined {
  if (expiresIn) {
    return Date.now() + expiresIn * 1000;
  }
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return undefined;
  const exp = typeof payload.exp === "number" ? payload.exp : undefined;
  if (!exp) return undefined;
  // 逻辑：JWT exp 单位是秒，需要转换成毫秒。
  return exp * 1000;
}

/**
 * Decode JWT payload without signature verification.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payloadPart = parts[1];
  if (!payloadPart) return null;
  try {
    // 逻辑：仅用于计算过期时间，不做签名校验。
    const payload = Buffer.from(base64UrlDecode(payloadPart), "base64").toString("utf-8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Convert base64url to base64 for decoding.
 */
function base64UrlDecode(input: string): string {
  return input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
}
