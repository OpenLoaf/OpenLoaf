import crypto from "node:crypto";
import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getEnvString } from "@teatime-ai/config";
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
  getAccessToken,
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
      const prompt = c.req.query("prompt") ?? undefined;
      const authorizeUrl = buildAuthorizeUrl({
        config,
        state,
        codeChallenge: pkce.challenge,
        prompt,
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

  app.get("/auth/balance", async (c) => {
    await ensureAccessTokenFresh();
    const accessToken = getAccessToken();
    if (!accessToken) {
      return c.json({ error: "auth_required" }, 401);
    }
    const saasBaseUrl = getSaasBaseUrl();
    if (!saasBaseUrl) {
      return c.json({ error: "saas_url_missing" }, 500);
    }
    try {
      const response = await fetch(`${saasBaseUrl}/api/llm/balance`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // 中文注释：SaaS 返回非 2xx 时记录状态码便于排查。
        logger.warn({ status: response.status, payload }, "SaaS balance request failed");
        // 中文注释：Hono JSON 响应需要 ContentfulStatusCode，透传 fetch 状态码。
        return c.json({ error: "saas_request_failed" }, response.status as ContentfulStatusCode);
      }
      return c.json(payload);
    } catch (error) {
      logger.error({ err: error }, "SaaS balance request failed");
      return c.json({ error: "saas_request_failed" }, 502);
    }
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
      :root {
        color-scheme: light;
        --bg: #f5f7fb;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #64748b;
        --border: #e2e8f0;
        --primary: #2563eb;
        --primary-dark: #1e40af;
      }
      * { box-sizing: border-box; }
      body {
        font-family: "Avenir Next", "Nunito", "Helvetica Neue", Arial, sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(1200px 600px at 10% -20%, rgba(59, 130, 246, 0.12), transparent 60%),
          radial-gradient(900px 500px at 110% 10%, rgba(14, 165, 233, 0.12), transparent 55%),
          var(--bg);
        padding: 28px;
      }
      .card {
        width: min(520px, 100%);
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 28px 28px 24px;
        text-align: center;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--primary-dark);
        background: rgba(37, 99, 235, 0.12);
        padding: 6px 10px;
        border-radius: 999px;
        margin-bottom: 14px;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 10px;
        color: var(--text);
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .actions {
        margin-top: 22px;
        margin-top: 14px;
        font-size: 12px;
        color: var(--muted);
      }
      .divider {
        height: 1px;
        background: var(--border);
        margin: 18px 0 12px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">Teatime Auth</div>
      <h1>${message}</h1>
      <p>此页面可安全关闭。</p>
      <div class="actions">请手动关闭此标签页</div>
    </div>
    <script>
      (function () {})();
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

/**
 * Resolve SaaS base URL from env.
 */
function getSaasBaseUrl(): string | null {
  const value = getEnvString(process.env, "TEATIME_SAAS_URL");
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}
