import crypto from "node:crypto";
import type { Hono } from "hono";
import { logger } from "@/common/logger";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getAuth0Config,
  refreshAccessToken,
} from "./auth0Client";
import {
  applyTokenExchangeResult,
  clearAuthSession,
  getAuthSessionSnapshot,
  getRefreshToken,
  isAccessTokenValid,
} from "./tokenStore";
import { clearPkceStates, consumePkceVerifier, createPkcePair, storePkceState } from "./pkce";

/**
 * Register Auth0 login routes.
 */
export function registerAuthRoutes(app: Hono): void {
  app.get("/auth/login-url", (c) => {
    try {
      const config = getAuth0Config();
      const state = cryptoRandomId();
      const pkce = createPkcePair();
      storePkceState(state, pkce.verifier);
      const authorizeUrl = buildAuthorizeUrl({
        config,
        state,
        codeChallenge: pkce.challenge,
      });
      return c.json({ authorizeUrl });
    } catch (error) {
      logger.error({ err: error }, "Failed to build Auth0 login url");
      return c.json({ error: "auth0_config_invalid" }, 500);
    }
  });

  app.get("/auth/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return c.html(renderCallbackPage("登录失败：缺少回调参数"));
    }
    const verifier = consumePkceVerifier(state);
    if (!verifier) {
      return c.html(renderCallbackPage("登录失败：状态已过期"));
    }
    try {
      const config = getAuth0Config();
      const token = await exchangeCodeForToken({
        config,
        code,
        codeVerifier: verifier,
      });
      applyTokenExchangeResult({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in,
        idToken: token.id_token,
      });
      return c.html(renderCallbackPage("登录成功，可关闭此窗口"));
    } catch (error) {
      logger.error({ err: error }, "Auth0 callback failed");
      return c.html(renderCallbackPage("登录失败，请重试"));
    }
  });

  app.get("/auth/session", async (c) => {
    await ensureAccessTokenFresh();
    return c.json(getAuthSessionSnapshot());
  });

  app.post("/auth/cancel", (c) => {
    // 逻辑：清理等待中的 PKCE 状态，不影响已登录的 refresh token。
    clearPkceStates();
    return c.json({ ok: true });
  });

  app.post("/auth/logout", (c) => {
    // 逻辑：退出登录时清理内存与 refresh token。
    clearAuthSession();
    return c.json({ ok: true });
  });
}

/**
 * Ensure access token is fresh; refresh when possible.
 */
async function ensureAccessTokenFresh(): Promise<void> {
  if (isAccessTokenValid()) return;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return;
  try {
    const config = getAuth0Config();
    const token = await refreshAccessToken({ config, refreshToken });
    applyTokenExchangeResult({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      idToken: token.id_token,
    });
  } catch (error) {
    logger.error({ err: error }, "Auth0 refresh failed");
    // 逻辑：刷新失败视为失效，避免死循环请求。
    clearAuthSession();
  }
}

/**
 * Render a simple callback page.
 */
function renderCallbackPage(message: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Teatime 登录</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px; }
      .card { max-width: 480px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      p { margin: 0; color: #4b5563; }
      .countdown { margin-top: 12px; color: #6b7280; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${message}</h1>
      <p>此页面可安全关闭。</p>
      <p class="countdown"><span id="countdown">5</span> 秒后自动关闭</p>
    </div>
    <script>
      (function () {
        // 中文注释：倒计时结束后尝试自动关闭窗口。
        var seconds = 5;
        var node = document.getElementById("countdown");
        var timer = setInterval(function () {
          seconds -= 1;
          if (node) node.textContent = String(seconds);
          if (seconds <= 0) {
            clearInterval(timer);
            window.close();
          }
        }, 1000);
      })();
    </script>
  </body>
</html>`;
}

/**
 * Generate a random state id.
 */
function cryptoRandomId(): string {
  return crypto.randomUUID();
}
