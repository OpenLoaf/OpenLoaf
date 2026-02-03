import type { Hono } from "hono";
import { logger } from "@/common/logger";
import { consumeLoginCode, storeLoginCode } from "./loginCodeStore";

/** Extract login state from returnTo parameter. */
function extractLoginState(returnTo?: string | null): string | null {
  if (!returnTo) return null;
  const trimmed = returnTo.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("tenas-login:")) {
    const state = trimmed.slice("tenas-login:".length).trim();
    return state || null;
  }
  return null;
}

/** Render a simple callback page. */
function renderCallbackPage(message: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tenas 登录</title>
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
      <div class="badge">Tenas Auth</div>
      <h1>${message}</h1>
      <p>此页面可安全关闭。</p>
      <div class="actions">请手动关闭此标签页</div>
    </div>
  </body>
</html>`;
}

/** Register SaaS login callback routes. */
export function registerAuthRoutes(app: Hono): void {
  app.get("/auth/callback", (c) => {
    const loginCode = c.req.query("code");
    const returnTo = c.req.query("returnTo");
    if (!loginCode) {
      return c.html(renderCallbackPage("登录失败：缺少回调参数"));
    }
    const state = extractLoginState(returnTo);
    // 逻辑：login_code 缓存供本地 Web 轮询消费。
    storeLoginCode(state, loginCode);
    logger.info({ state: state ?? "default" }, "SaaS login code received");
    return c.html(renderCallbackPage("登录成功，可关闭此窗口"));
  });

  app.get("/auth/login-code", (c) => {
    const state = c.req.query("state");
    const code = consumeLoginCode(state);
    return c.json({ code: code ?? null });
  });
}
