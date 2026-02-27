/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
type AuthCallbackPageOptions = {
  message: string;
  returnUrl?: string;
};

// 中文注释：默认回到桌面端协议地址。
const DEFAULT_RETURN_URL = "openloaf://open";

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

/** Render the auth callback page HTML string. */
export function renderAuthCallbackPage(options: AuthCallbackPageOptions): string {
  const rawMessage = options.message ?? "";
  const safeMessage = escapeHtml(rawMessage);
  const returnUrl = (options.returnUrl ?? DEFAULT_RETURN_URL).trim() || DEFAULT_RETURN_URL;
  const safeReturnUrl = escapeHtml(returnUrl);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>OpenLoaf 登录</title>
    <style>
      :root {
        --bg: #f6f8fc;
        --text: #202124;
        --text2: #5f6368;
        --btn-bg: #e8f0fe;
        --btn-fg: #1a73e8;
        --btn-hover: #d2e3fc;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0f1115;
          --text: #f1f5f9;
          --text2: #94a3b8;
          --btn-bg: rgba(56,139,253,0.15);
          --btn-fg: #7dd3fc;
          --btn-hover: rgba(56,139,253,0.25);
        }
      }
      * { box-sizing: border-box; margin: 0; }
      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--bg);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: var(--text);
        text-align: center;
      }
      h1 { font-size: 28px; font-weight: 600; margin-bottom: 10px; }
      p { font-size: 15px; color: var(--text2); line-height: 1.5; }
      .btn {
        display: inline-block;
        margin-top: 20px;
        padding: 11px 28px;
        border-radius: 999px;
        border: none;
        background: var(--btn-bg);
        color: var(--btn-fg);
        font-size: 15px;
        font-weight: 500;
        text-decoration: none;
        transition: background-color 150ms;
      }
      .btn:hover { background: var(--btn-hover); }
      .close-hint { display: none; margin-top: 10px; font-size: 12px; color: var(--text2); }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeMessage}</h1>
      <p>可以关闭此页面，或点击下方按钮返回应用。</p>
      <a class="btn" href="${safeReturnUrl}" data-open-app>返回 OpenLoaf</a>
      <div class="close-hint" data-close-hint>无法自动关闭，请手动关闭此页面。</div>
    </main>
    <script>
      (() => {
        const h = document.querySelector("[data-close-hint]");
        const b = document.querySelector("[data-open-app]");
        if (!b) return;
        b.addEventListener("click", () => {
          setTimeout(() => { window.close(); setTimeout(() => { if (h) h.style.display = "block"; }, 400); }, 120);
        });
      })();
    </script>
  </body>
</html>`;
}
