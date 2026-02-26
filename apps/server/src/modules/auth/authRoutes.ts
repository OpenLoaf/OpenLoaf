import type { Hono } from "hono";
import { logger } from "@/common/logger";
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
  app.get("/auth/callback", (c) => {
    const loginCode = c.req.query("code");
    const returnTo = c.req.query("returnTo");
    if (!loginCode) {
      return c.html(
        renderAuthCallbackPage({
          message: "登录失败：缺少回调参数",
          returnUrl: "openloaf://open",
        })
      );
    }
    const state = extractLoginState(returnTo);
    // 逻辑：login_code 缓存供本地 Web 轮询消费。
    storeLoginCode(state, loginCode);
    logger.info({ state: state ?? "default" }, "SaaS login code received");
    return c.html(
      renderAuthCallbackPage({
        message: "登录成功，可关闭此窗口",
        returnUrl: "openloaf://open",
      })
    );
  });

  app.get("/auth/login-code", (c) => {
    const state = c.req.query("state");
    const code = consumeLoginCode(state);
    return c.json({ code: code ?? null });
  });
}
