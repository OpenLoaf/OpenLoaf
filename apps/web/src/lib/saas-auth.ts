/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { SaaSClient } from "@openloaf-saas/sdk";
import { resolveServerUrl } from "@/utils/server-url";
import { CLIENT_HEADERS } from "@/lib/client-headers";
import i18n from "@/i18n";

export type SaasAuthUser = {
  /** User display name. */
  name?: string;
  /** User email. */
  email?: string;
  /** User avatar URL. */
  avatarUrl?: string;
};

/** Log prefix for auth module. */
const LOG_TAG = "[auth]";

/** Resolve SaaS base URL from env (for building login URLs / external links). */
export function resolveSaasBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_OPENLOAF_SAAS_URL ??
    process.env.NEXT_PUBLIC_SAAS_URL ??
    "";
  return raw.trim().replace(/\/$/, "");
}

/**
 * Mount point of the local reverse proxy under the Server origin.
 * The SaaS SDK's internal `new URL(endpoint.path, baseUrl)` drops the
 * path segment of baseUrl when endpoint.path is absolute, so we cannot
 * embed this prefix into SaaSClient.baseUrl directly — instead we pass
 * the origin only and install a custom `fetcher` that injects this prefix.
 */
const SAAS_PROXY_MOUNT = "/api/saas/raw";

/**
 * Resolve the reverse-proxy base URL for **manual fetch** call sites.
 * Returns `${serverOrigin}/api/saas/raw`. Do NOT pass this to
 * `new SaaSClient({ baseUrl })` — use `createSaasProxyClient()` helpers.
 */
export function resolveSaasProxyBaseUrl(): string {
  const server = resolveServerUrl();
  if (!server) return "";
  return `${server.replace(/\/$/, "")}${SAAS_PROXY_MOUNT}`;
}

/**
 * Build a fetcher that prefixes every same-origin request path with
 * `/api/saas/raw`. Used by SaaSClient to route SDK calls through the
 * local reverse proxy without changing baseUrl semantics.
 */
export function createSaasProxyFetcher(serverOrigin: string): typeof fetch {
  const origin = serverOrigin.replace(/\/$/, "");
  return async (input, init) => {
    let url: URL;
    if (typeof input === "string") {
      url = new URL(input);
    } else if (input instanceof URL) {
      url = new URL(input.toString());
    } else {
      url = new URL((input as Request).url);
    }
    if (
      url.origin === origin &&
      !url.pathname.startsWith(SAAS_PROXY_MOUNT)
    ) {
      url.pathname = `${SAAS_PROXY_MOUNT}${url.pathname}`;
    }
    return fetch(url.toString(), init);
  };
}

/** Resolve the Server origin (no trailing slash). */
export function resolveServerOriginForSaasProxy(): string {
  const server = resolveServerUrl();
  if (!server) return "";
  return server.replace(/\/$/, "");
}

// ─────────────────────────────────────────────────────────────────
// 内存会话缓存（全部来自 Server，没有 localStorage/sessionStorage）
// ─────────────────────────────────────────────────────────────────

type SessionCache = {
  /** Last known logged-in flag. */
  loggedIn: boolean;
  /** Last known user info. */
  user: SaasAuthUser | null;
};

const sessionCache: SessionCache = {
  loggedIn: false,
  user: null,
};

// --- 认证失效事件回调 ---
type AuthLostListener = () => void;
const authLostListeners = new Set<AuthLostListener>();

/** Register a listener for auth lost events. Returns unsubscribe function. */
export function onAuthLost(listener: AuthLostListener): () => void {
  authLostListeners.add(listener);
  return () => {
    authLostListeners.delete(listener);
  };
}

function notifyAuthLost() {
  for (const listener of authLostListeners) listener();
}

function setSession(loggedIn: boolean, user: SaasAuthUser | null): void {
  const wasLoggedIn = sessionCache.loggedIn;
  sessionCache.loggedIn = loggedIn;
  sessionCache.user = user;
  if (wasLoggedIn && !loggedIn) {
    notifyAuthLost();
  }
}

function clearSession(): void {
  setSession(false, null);
}

// ─────────────────────────────────────────────────────────────────
// Server 端点调用
// ─────────────────────────────────────────────────────────────────

type ServerExchangeResult = {
  success: boolean;
  user?: SaasAuthUser;
  code?: string;
  message?: string;
};

type ServerSessionResult = {
  loggedIn: boolean;
  user?: SaasAuthUser;
};

type ServerRefreshResult = {
  success: boolean;
  loggedIn?: boolean;
  user?: SaasAuthUser;
  code?: string;
  message?: string;
};

function buildServerUrl(path: string): string | null {
  const base = resolveServerUrl();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${path}`;
}

async function postJson<T>(path: string, body?: unknown): Promise<T | null> {
  const url = buildServerUrl(path);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...CLIENT_HEADERS },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      return (await res.json().catch(() => null)) as T | null;
    }
    return (await res.json()) as T;
  } catch (error) {
    console.info(LOG_TAG, "postJson failed", path, error);
    return null;
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  const url = buildServerUrl(path);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: { ...CLIENT_HEADERS },
    });
    if (!res.ok) {
      return (await res.json().catch(() => null)) as T | null;
    }
    return (await res.json()) as T;
  } catch (error) {
    console.info(LOG_TAG, "getJson failed", path, error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// 公共 API（签名向后兼容）
// ─────────────────────────────────────────────────────────────────

/** Read cached user from in-memory session state. */
export function getStoredUser(): SaasAuthUser | null {
  return sessionCache.user;
}

/**
 * Force a token refresh on Server and sync the session snapshot back
 * to the Web in-memory cache. The token itself is never returned to Web —
 * all SaaS calls go through the reverse proxy which injects it server-side.
 */
export async function refreshAccessToken(): Promise<boolean> {
  const result = await postJson<ServerRefreshResult>("/auth/refresh");
  if (!result?.success) {
    clearSession();
    return false;
  }
  if (result.user) {
    setSession(true, result.user);
  }
  return true;
}

/** Check current auth status via Server session endpoint. */
export async function isAuthenticated(): Promise<boolean> {
  const result = await getJson<ServerSessionResult>("/auth/session");
  if (!result) return false;
  setSession(result.loggedIn, result.user ?? null);
  return result.loggedIn;
}

/** Resolve auth user from Server session snapshot. */
export async function resolveAuthUser(): Promise<SaasAuthUser | null> {
  if (sessionCache.user) return sessionCache.user;
  await isAuthenticated();
  return sessionCache.user;
}

/** Exchange login code for tokens on Server. Tokens stay on Server. */
export async function exchangeLoginCode(input: {
  loginCode: string;
}): Promise<SaasAuthUser | null> {
  console.info(LOG_TAG, "exchanging login code via Server");
  const result = await postJson<ServerExchangeResult>("/auth/exchange", {
    loginCode: input.loginCode,
  });
  if (!result?.success || !result.user) {
    console.info(LOG_TAG, "exchange failed", result?.message);
    clearSession();
    return null;
  }
  setSession(true, result.user);
  return result.user;
}

/** Logout via Server (revokes on SaaS + clears local state). */
export function logout(): void {
  console.info(LOG_TAG, "user logout");
  void postJson("/auth/logout");
  clearSession();
}

// ─────────────────────────────────────────────────────────────────
// 业务数据获取（全部经由反向代理）
// ─────────────────────────────────────────────────────────────────

/** Create SaaS SDK client pointing at the local reverse proxy. */
function createProxyClient() {
  const origin = resolveServerOriginForSaasProxy();
  if (!origin) {
    throw new Error("server_origin_missing");
  }
  return new SaaSClient({
    // 逻辑：baseUrl 是 Server 的 origin（不含 /api/saas/raw 前缀）——
    // SDK 用 `new URL(endpoint.path, baseUrl)` 构造 URL，绝对 path 会吞掉
    // baseUrl 的 pathname。前缀注入在 fetcher 里做。
    baseUrl: origin,
    // 逻辑：反代注入 token，SDK 构造参数仍要求给出 getter，返回空串即可。
    getAccessToken: async () => "",
    // 逻辑：每个请求都带 X-OpenLoaf-Client，通过 Server 的 strictClientGuard。
    headers: { ...CLIENT_HEADERS },
    locale: i18n.language || "en-US",
    fetcher: createSaasProxyFetcher(origin),
  });
}

/** Fetch full user profile through reverse proxy. */
export async function fetchUserProfile(): Promise<{
  id: string;
  membershipLevel: "free" | "lite" | "pro" | "premium" | "infinity";
  creditsBalance: number;
  isInternal?: boolean;
} | null> {
  try {
    const client = createProxyClient();
    const result = await client.user.self();
    return {
      id: result.user.id,
      membershipLevel: result.user.membershipLevel,
      creditsBalance: result.user.creditsBalance,
      isInternal: result.user.isInternal,
    };
  } catch {
    return null;
  }
}

/** Fetch current active subscription via reverse proxy tRPC passthrough. */
export async function fetchCurrentSubscription(): Promise<{
  id: string;
  planCode: string;
  period: "monthly" | "yearly";
  status: "active" | "expired" | "cancelled";
  creditsQuota: number;
  creditsUsed: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
} | null> {
  const base = resolveSaasProxyBaseUrl();
  if (!base) return null;
  try {
    const url = `${base}/api/trpc/memberSubscription.current`;
    const res = await fetch(url, {
      credentials: "include",
      headers: { ...CLIENT_HEADERS },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result?.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch credits transaction list via reverse proxy tRPC passthrough. */
export async function fetchCreditsTransactions(input: {
  page: number;
  pageSize: number;
  type?: string;
}): Promise<{
  items: Array<{
    id: string;
    type: string;
    kind: string | null;
    amount: number;
    balanceAfter: number;
    description: string;
    createdAt: string;
  }>;
  total: number;
} | null> {
  const base = resolveSaasProxyBaseUrl();
  if (!base) return null;
  try {
    const inputParam = encodeURIComponent(JSON.stringify(input));
    const url = `${base}/api/trpc/memberCredits.transactions?input=${inputParam}`;
    const res = await fetch(url, {
      credentials: "include",
      headers: { ...CLIENT_HEADERS },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result?.data ?? null;
  } catch {
    return null;
  }
}

/** Redeem one code for current user. */
export async function redeemCode(input: {
  code: string;
}): Promise<{
  id: string;
  code: string;
  title: string;
  creditsAmount: number;
  newBalance: number;
  createdAt: string;
}> {
  const client = createProxyClient();
  return client.redeemCode.redeem(input);
}

/** Fetch redeem code records for current user. */
export async function fetchRedeemCodeRecords(input: {
  page: number;
  pageSize: number;
}): Promise<{
  items: Array<{
    id: string;
    creditsAmount: number;
    createdAt: string;
    redeemCode: {
      id: string;
      code: string;
      title: string;
    };
  }>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
} | null> {
  try {
    const client = createProxyClient();
    return await client.redeemCode.records(input);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// 登录引导 / 回调流程辅助（保留）
// ─────────────────────────────────────────────────────────────────

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
  // 关键逻辑：SaaS 后端 OAuth 路由挂在 /api 下，避免缺少 /api 导致 404。
  const url = new URL(`/api/auth/${input.provider}/start`, baseUrl);
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
  if (window.openloafElectron?.openExternal) {
    const result = await window.openloafElectron.openExternal(url);
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
  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: { ...CLIENT_HEADERS },
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { code?: string | null } | null;
  return payload?.code ?? null;
}
