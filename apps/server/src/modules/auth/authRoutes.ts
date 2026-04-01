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
}
