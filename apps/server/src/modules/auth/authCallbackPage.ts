/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\ntype AuthCallbackPageOptions = {
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
    <meta name="color-scheme" content="dark" />
    <title>OpenLoaf 登录</title>
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
      html,
      body {
        height: 100%;
      }
      html {
        background: var(--bg);
      }
      body {
        margin: 0;
        min-height: 100vh;
        height: 100vh;
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
      @supports (height: 100svh) {
        body {
          min-height: 100svh;
          height: 100svh;
        }
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
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(216, 178, 114, 0.2);
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
        color: var(--accent-deep);
        background: rgba(216, 178, 114, 0.12);
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
      .actions {
        margin-top: 22px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: center;
      }
      .primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 22px;
        border-radius: 999px;
        border: 1px solid rgba(216, 178, 114, 0.45);
        color: var(--accent-deep);
        background: rgba(216, 178, 114, 0.08);
        text-decoration: none;
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
        font-size: 14px;
        letter-spacing: 0.04em;
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }
      .primary:hover {
        background: rgba(216, 178, 114, 0.18);
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
        transform: translateY(-1px);
      }
      .footnote {
        margin-top: 16px;
        font-size: 12px;
        color: var(--muted);
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
      }
      .manual-close {
        display: none;
        margin-top: 10px;
        font-size: 12px;
        color: var(--muted);
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${safeMessage}</h1>
      <p>若已打开桌面端，请继续操作；未打开请点击下方按钮。</p>
      <div class="actions">
        <a class="primary" href="${safeReturnUrl}" data-open-app>打开 OpenLoaf AI</a>
      </div>
      <div class="manual-close" data-close-hint>未能自动关闭，请手动关闭此标签页。</div>
    </main>
    <script>
      (() => {
        const closeHint = document.querySelector("[data-close-hint]");
        const button = document.querySelector("[data-open-app]");
        if (!button) return;
        button.addEventListener("click", () => {
          // 中文注释：点击后先尝试唤起桌面端，再关闭当前页。
          window.setTimeout(() => {
            window.close();
            window.setTimeout(() => {
              if (closeHint) closeHint.style.display = "block";
            }, 400);
          }, 120);
        });
      })();
    </script>
  </body>
</html>`;
}
