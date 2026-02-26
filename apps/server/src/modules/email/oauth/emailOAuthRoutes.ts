/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { Hono } from "hono";

import { logger } from "@/common/logger";

import { exchangeCode, fetchUserEmail, generateAuthUrl } from "./oauthFlow";
import { listOAuthProviderIds } from "./providers";
import { storeOAuthTokens } from "./tokenManager";

/** Escape HTML special characters to prevent injection. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

/** Render success HTML page for OAuth callback (auto-closes for Electron popup). */
function renderOAuthSuccessPage(email: string): string {
  const safeEmail = escapeHtml(email);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>邮箱授权</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0c0f;
        --bg-2: #12141b;
        --card: #171a22;
        --ink: #f0eee9;
        --muted: #a39a8f;
        --line: rgba(255, 255, 255, 0.08);
        --accent: #d8b272;
        --accent-deep: #f1d9a3;
        --shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      }
      * { box-sizing: border-box; }
      html, body { height: 100%; }
      html { background: var(--bg); }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        background:
          radial-gradient(1200px 600px at 12% -10%, rgba(216, 178, 114, 0.16), transparent 60%),
          radial-gradient(900px 520px at 100% 10%, rgba(97, 119, 160, 0.12), transparent 55%),
          linear-gradient(135deg, var(--bg), var(--bg-2));
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        color: var(--ink);
      }
      .card {
        width: min(560px, 100%);
        background: linear-gradient(180deg, rgba(23, 26, 34, 0.92), rgba(17, 20, 28, 0.98));
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 34px 32px 28px;
        text-align: center;
        box-shadow: var(--shadow);
        position: relative;
      }
      .card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        pointer-events: none;
      }
      h1 {
        margin: 18px 0 10px;
        font-size: 24px;
        letter-spacing: 0.02em;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
      }
      .email {
        margin-top: 8px;
        font-size: 16px;
        color: var(--accent-deep);
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
      }
      .footnote {
        margin-top: 16px;
        font-size: 12px;
        color: var(--muted);
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>授权成功</h1>
      <p class="email">${safeEmail}</p>
      <p class="footnote">此窗口将在 2 秒后自动关闭…</p>
    </main>
    <script>
      setTimeout(() => { window.close(); }, 2000);
    </script>
  </body>
</html>`;
}

/** Render error HTML page for OAuth callback. */
function renderOAuthErrorPage(message: string): string {
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>邮箱授权</title>
    <style>
      :root { color-scheme: dark; --bg: #0b0c0f; --ink: #f0eee9; --err: #e06c75; }
      * { box-sizing: border-box; }
      html, body { height: 100%; }
      html { background: var(--bg); }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        color: var(--ink);
      }
      .card {
        width: min(560px, 100%);
        background: rgba(23, 26, 34, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 22px;
        padding: 34px 32px 28px;
        text-align: center;
      }
      h1 { color: var(--err); font-size: 24px; }
      p { color: #a39a8f; line-height: 1.7; font-family: "Avenir Next", sans-serif; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>授权失败</h1>
      <p>${safeMessage}</p>
    </main>
  </body>
</html>`;
}

/** Register email OAuth routes on the Hono app. */
export function registerEmailOAuthRoutes(app: Hono): void {
  const validProviders = new Set(listOAuthProviderIds());

  // 逻辑：启动 OAuth 授权流程，生成 PKCE 并重定向到提供商。
  app.get("/auth/email/:providerId/start", (c) => {
    const providerId = c.req.param("providerId");
    if (!validProviders.has(providerId)) {
      return c.json({ error: `不支持的提供商：${providerId}` }, 400);
    }

    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) {
      return c.json({ error: "缺少 workspaceId 参数。" }, 400);
    }

    try {
      const origin = new URL(c.req.url).origin;
      const redirectUri = `${origin}/auth/email/${providerId}/callback`;
      const { url } = generateAuthUrl(providerId, workspaceId, redirectUri);
      return c.redirect(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      logger.error({ err, providerId, workspaceId }, "OAuth start failed");
      return c.json({ error: message }, 500);
    }
  });

  // 逻辑：OAuth 回调，交换授权码并存储令牌。
  app.get("/auth/email/:providerId/callback", async (c) => {
    const providerId = c.req.param("providerId");
    if (!validProviders.has(providerId)) {
      return c.html(renderOAuthErrorPage(`不支持的提供商：${providerId}`), 400);
    }

    const code = c.req.query("code");
    const stateKey = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      const errorDescription = c.req.query("error_description") ?? error;
      logger.warn({ providerId, error, errorDescription }, "OAuth callback received error");
      return c.html(renderOAuthErrorPage(errorDescription), 400);
    }

    if (!code || !stateKey) {
      return c.html(renderOAuthErrorPage("缺少回调参数（code 或 state）。"), 400);
    }

    try {
      // 逻辑：exchangeCode 返回令牌及原始 state 中的 providerId 和 workspaceId。
      const { tokens, workspaceId } = await exchangeCode(stateKey, code);
      const email = await fetchUserEmail(providerId, tokens.accessToken);

      // 逻辑：将 OAuth 令牌持久化到 .env，供后续邮件收发使用。
      storeOAuthTokens(workspaceId, email, providerId, tokens);

      logger.info(
        { providerId, workspaceId, email },
        "Email OAuth authorization completed",
      );

      return c.html(renderOAuthSuccessPage(email));
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      logger.error({ err, providerId }, "OAuth callback failed");
      return c.html(renderOAuthErrorPage(message), 500);
    }
  });
}
