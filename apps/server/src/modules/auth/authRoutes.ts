/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Hono } from "hono";
import { logger } from "@/common/logger";
import { getEnvString } from "@openloaf/config";
import { renderAuthCallbackPage } from "./authCallbackPage";
import { consumeLoginCode, storeLoginCode } from "./loginCodeStore";
import {
  applyTokenExchangeResult,
  clearAuthSession,
  ensureServerAccessToken,
  getAuthSessionSnapshot,
  getRefreshToken,
} from "./tokenStore";
import {
  exchangeLoginCodeViaSaas,
  revokeRefreshTokenViaSaas,
} from "@/modules/saas/modules/auth/client";

type ErrorPayload = {
  /** Always false for failures. */
  success: false;
  /** Stable error code. */
  code: string;
  /** Human readable message. */
  message: string;
};

function errorPayload(code: string, message: string): ErrorPayload {
  return { success: false, code, message };
}

type PublicUser = {
  /** Display name. */
  name?: string;
  /** Email. */
  email?: string;
  /** Avatar URL. */
  avatarUrl?: string;
};

function pickPublicUser(
  user: { name?: string; email?: string; avatarUrl?: string } | undefined,
): PublicUser | undefined {
  if (!user) return undefined;
  const result: PublicUser = {};
  if (user.name) result.name = user.name;
  if (user.email) result.email = user.email;
  if (user.avatarUrl) result.avatarUrl = user.avatarUrl;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Extract login state from returnTo parameter. */
function extractLoginState(returnTo?: string | null): string | null {
  if (!returnTo) return null;
  const trimmed = returnTo.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("openloaf-login:")) {
    const state = trimmed.slice("openloaf-login:".length).trim();
    return state || null;
  }
  return null;
}

/** Register SaaS login callback routes. */
export function registerAuthRoutes(app: Hono): void {
  const saasUrl = getEnvString(process.env, "OPENLOAF_SAAS_URL") || "";

  app.get("/auth/callback", (c) => {
    const loginCode = c.req.query("code");
    const returnTo = c.req.query("returnTo");
    if (!loginCode) {
      logger.warn("[auth] callback missing login code");
      return c.html(
        renderAuthCallbackPage({
          message: "OpenLoaf 登录失败，缺少回调参数",
          returnUrl: "openloaf://open",
          saasUrl,
        })
      );
    }
    const state = extractLoginState(returnTo);
    // 逻辑：login_code 缓存供本地 Web 轮询消费。
    storeLoginCode(state, loginCode);
    logger.info({ state: state ?? "default" }, "[auth] login code received and stored");
    return c.html(
      renderAuthCallbackPage({
        message: "已成功登录 OpenLoaf",
        returnUrl: "openloaf://open",
        saasUrl,
      })
    );
  });

  app.get("/auth/login-code", (c) => {
    const state = c.req.query("state");
    const code = consumeLoginCode(state);
    if (code) {
      logger.info({ state: state ?? "default" }, "[auth] login code consumed by frontend");
    }
    return c.json({ code: code ?? null });
  });

  // 逻辑：Web 侧拿到 loginCode 后调此端点，Server 作为 token 唯一持有者
  // 完成一次 code ↔ token 的交换，tokens 写入 auth.json + 内存，
  // 响应体只返回用户信息，Web 永远不接触 access/refresh token。
  app.post("/auth/exchange", async (c) => {
    let body: { loginCode?: unknown } | null = null;
    try {
      body = (await c.req.json()) as { loginCode?: unknown } | null;
    } catch {
      return c.json(errorPayload("invalid_json", "请求体不是有效 JSON"), 400);
    }
    const loginCode = typeof body?.loginCode === "string" ? body.loginCode.trim() : "";
    if (!loginCode) {
      return c.json(errorPayload("missing_login_code", "缺少 loginCode"), 400);
    }
    try {
      const result = await exchangeLoginCodeViaSaas(loginCode);
      applyTokenExchangeResult({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
      return c.json({
        success: true as const,
        user: pickPublicUser(result.user),
      });
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "[auth] /auth/exchange failed",
      );
      return c.json(errorPayload("exchange_failed", "登录码交换失败"), 401);
    }
  });

  // 逻辑：Web 显式触发刷新（页面打开、登录态校验等场景）。
  // Server 内部用 ensureServerAccessToken 完成刷新并落盘，返回最新会话快照。
  app.post("/auth/refresh", async (c) => {
    const token = await ensureServerAccessToken();
    if (!token) {
      return c.json(
        errorPayload("refresh_failed", "刷新失败，请重新登录"),
        401,
      );
    }
    const snapshot = getAuthSessionSnapshot();
    return c.json({
      success: true as const,
      loggedIn: snapshot.loggedIn,
      user: pickPublicUser(snapshot.user),
    });
  });

  // 逻辑：Web 注销时调此端点，Server 负责向 SaaS 撤销 refresh token
  // 并清理本地 auth.json + 内存。撤销失败不阻塞本地清理。
  app.post("/auth/logout", async (c) => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await revokeRefreshTokenViaSaas(refreshToken);
    }
    clearAuthSession();
    return c.json({ success: true as const });
  });

  // 逻辑：Web 启动或页面切回时拉取当前会话状态。
  // **关键行为**：先 await ensureServerAccessToken() 触发按需刷新 ——
  // 进程重启后 sessionState 内存清空，但 auth.json 里的 refresh token
  // 仍然有效。不主动触发刷新的话，`isAccessTokenValid()` 会读到 undefined
  // 返回 loggedIn=false，导致 Web 误判用户已登出。刷新成功后 user 信息
  // 会被 `applyTokenExchangeResult` 写回 sessionState。
  app.get("/auth/session", async (c) => {
    await ensureServerAccessToken();
    const snapshot = getAuthSessionSnapshot();
    return c.json({
      loggedIn: snapshot.loggedIn,
      user: pickPublicUser(snapshot.user),
    });
  });
}
