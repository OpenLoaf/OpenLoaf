"use client";

import { SaaSClient } from "@tenas-saas/sdk";
import { resolveServerUrl } from "@/utils/server-url";

type StorageType = "local" | "session";

export type SaasAuthUser = {
  /** User display name. */
  name?: string;
  /** User email. */
  email?: string;
  /** User avatar URL. */
  avatarUrl?: string;
};

type TokenPayload = {
  exp?: number;
  name?: string;
  email?: string;
};

type StoredAuth = {
  accessToken?: string;
  refreshToken?: string;
  storageType: StorageType;
};

/** Access token storage key. */
const ACCESS_TOKEN_KEY = "tn_saas_access_token";
/** Refresh token storage key. */
const REFRESH_TOKEN_KEY = "tn_saas_refresh_token";
/** User cache storage key. */
const USER_KEY = "tn_saas_user";

/** Resolve SaaS base URL from env. */
export function resolveSaasBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_TENAS_SAAS_URL ??
    process.env.NEXT_PUBLIC_SAAS_URL ??
    "";
  return raw.trim().replace(/\/$/, "");
}

/** Decode base64url string to JSON. */
function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const padded = padLength === 0 ? normalized : `${normalized}${"=".repeat(4 - padLength)}`;
  return atob(padded);
}

/** Parse JWT payload without verification. */
function parseJwt(token: string): TokenPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload)) as TokenPayload;
  } catch {
    return null;
  }
}

/** Check whether token is expired. */
function isTokenExpired(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000;
}

/** Read tokens from a given storage. */
function readTokensFromStorage(storage: Storage): StoredAuth | null {
  const accessToken = storage.getItem(ACCESS_TOKEN_KEY) ?? undefined;
  const refreshToken = storage.getItem(REFRESH_TOKEN_KEY) ?? undefined;
  if (!accessToken && !refreshToken) return null;
  const storageType: StorageType = storage === window.sessionStorage ? "session" : "local";
  return { accessToken, refreshToken, storageType };
}

/** Resolve stored tokens across local/session storage. */
function resolveStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  const local = readTokensFromStorage(window.localStorage);
  if (local) return local;
  return readTokensFromStorage(window.sessionStorage);
}

/** Persist tokens into selected storage. */
function persistTokens(input: {
  accessToken: string;
  refreshToken: string;
  remember: boolean;
  user?: SaasAuthUser;
}): void {
  if (typeof window === "undefined") return;
  const target = input.remember ? window.localStorage : window.sessionStorage;
  const other = input.remember ? window.sessionStorage : window.localStorage;
  target.setItem(ACCESS_TOKEN_KEY, input.accessToken);
  target.setItem(REFRESH_TOKEN_KEY, input.refreshToken);
  if (input.user) {
    target.setItem(USER_KEY, JSON.stringify(input.user));
  }
  // 逻辑：切换存储位置时清理另一侧，避免状态混乱。
  other.removeItem(ACCESS_TOKEN_KEY);
  other.removeItem(REFRESH_TOKEN_KEY);
  other.removeItem(USER_KEY);
}

/** Clear stored tokens in both storages. */
function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

/** Read cached user from storage. */
export function getStoredUser(): SaasAuthUser | null {
  if (typeof window === "undefined") return null;
  const localUser = window.localStorage.getItem(USER_KEY);
  if (localUser) {
    try {
      return JSON.parse(localUser) as SaasAuthUser;
    } catch {
      return null;
    }
  }
  const sessionUser = window.sessionStorage.getItem(USER_KEY);
  if (!sessionUser) return null;
  try {
    return JSON.parse(sessionUser) as SaasAuthUser;
  } catch {
    return null;
  }
}

/** Get cached access token without refresh. */
export function getCachedAccessToken(): string | null {
  const stored = resolveStoredAuth();
  if (!stored?.accessToken) return null;
  if (isTokenExpired(stored.accessToken)) return null;
  return stored.accessToken;
}

/** Create SaaS SDK client for web. */
function createSaasClient(getAccessToken?: () => string | Promise<string>) {
  const baseUrl = resolveSaasBaseUrl();
  if (!baseUrl) {
    throw new Error("saas_url_missing");
  }
  return new SaaSClient({ baseUrl, getAccessToken });
}

/** Exchange login code for access/refresh tokens. */
export async function exchangeLoginCode(input: {
  loginCode: string;
  remember: boolean;
}): Promise<SaasAuthUser | null> {
  try {
    const client = createSaasClient();
    const result = await client.auth.exchange(input.loginCode);
    if (!result?.accessToken || !result?.refreshToken) return null;
    const user: SaasAuthUser | undefined = result.user
      ? {
          name: result.user.name ?? undefined,
          email: result.user.email ?? undefined,
          avatarUrl: result.user.avatarUrl ?? undefined,
        }
      : undefined;
    persistTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      remember: input.remember,
      user,
    });
    return user ?? null;
  } catch {
    return null;
  }
}

/** Refresh access token using stored refresh token. */
export async function refreshAccessToken(): Promise<string | null> {
  const stored = resolveStoredAuth();
  if (!stored?.refreshToken) {
    clearStoredAuth();
    return null;
  }
  try {
    const client = createSaasClient();
    const result = await client.auth.refresh(stored.refreshToken);
    if (!result || typeof (result as any).accessToken !== "string") {
      clearStoredAuth();
      return null;
    }
    const accessToken = (result as any).accessToken as string;
    const refreshToken = (result as any).refreshToken as string;
    const user: SaasAuthUser | undefined = (result as any).user
      ? {
          name: (result as any).user?.name ?? undefined,
          email: (result as any).user?.email ?? undefined,
          avatarUrl: (result as any).user?.avatarUrl ?? undefined,
        }
      : undefined;
    persistTokens({
      accessToken,
      refreshToken,
      remember: stored.storageType === "local",
      user,
    });
    return accessToken;
  } catch {
    clearStoredAuth();
    return null;
  }
}

/** Get a valid access token, refreshing if needed. */
export async function getAccessToken(): Promise<string | null> {
  const stored = resolveStoredAuth();
  if (!stored?.accessToken) return null;
  if (!isTokenExpired(stored.accessToken)) return stored.accessToken;
  return refreshAccessToken();
}

/** Check current auth status. */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return Boolean(token);
}

/** Resolve auth user from cached token or storage. */
export async function resolveAuthUser(): Promise<SaasAuthUser | null> {
  const cached = getStoredUser();
  if (cached) return cached;
  const token = await getAccessToken();
  if (!token) return null;
  const payload = parseJwt(token);
  if (!payload) return null;
  return { name: payload.name, email: payload.email };
}

/** Logout from SaaS and clear stored tokens. */
export async function logout(): Promise<void> {
  const stored = resolveStoredAuth();
  try {
    if (stored?.refreshToken) {
      const client = createSaasClient();
      await client.auth.logout(stored.refreshToken);
    }
  } finally {
    clearStoredAuth();
  }
}

export type SaasLoginProvider = "google" | "wechat";

/** Build SaaS login URL for provider. */
export function buildSaasLoginUrl(input: {
  provider: SaasLoginProvider;
  returnTo?: string;
  from?: "web" | "electron";
  port?: string;
}): string {
  const baseUrl = resolveSaasBaseUrl();
  if (!baseUrl) {
    throw new Error("saas_url_missing");
  }
  const url = new URL(`/auth/${input.provider}/start`, baseUrl);
  const returnTo = input.returnTo ?? "/dashboard";
  url.searchParams.set("returnTo", returnTo);
  if (input.from) {
    url.searchParams.set("from", input.from);
  }
  if (input.port) {
    url.searchParams.set("port", input.port);
  }
  return url.toString();
}

/** Open external URL in system browser (Electron) or new tab. */
export async function openExternalUrl(url: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.tenasElectron?.openExternal) {
    const result = await window.tenasElectron.openExternal(url);
    if (!result.ok) {
      throw new Error(result.reason ?? "无法打开浏览器");
    }
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Fetch login code from local server for a given state. */
export async function fetchLoginCode(state: string): Promise<string | null> {
  const baseUrl = resolveServerUrl();
  if (!baseUrl) return null;
  const url = new URL("/auth/login-code", baseUrl);
  url.searchParams.set("state", state);
  const response = await fetch(url.toString(), { credentials: "include" });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { code?: string | null } | null;
  return payload?.code ?? null;
}
