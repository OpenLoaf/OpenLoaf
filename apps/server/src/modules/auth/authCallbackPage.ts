type AuthCallbackPageOptions = {
  message: string;
  returnUrl?: string;
};

// 中文注释：默认回到桌面端协议地址。
const DEFAULT_RETURN_URL = "tenas://open";

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
    <meta name="color-scheme" content="light" />
    <title>Tenas 登录</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f2ec;
        --bg-2: #efe7dc;
        --card: #ffffff;
        --ink: #1f1b16;
        --muted: #6c6257;
        --line: rgba(31, 27, 22, 0.12);
        --accent: #b48a4a;
        --accent-deep: #6e4d1e;
        --shadow: 0 24px 60px rgba(20, 16, 12, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
        background:
          radial-gradient(1200px 600px at 15% -10%, rgba(180, 138, 74, 0.18), transparent 60%),
          radial-gradient(900px 520px at 100% 10%, rgba(37, 64, 115, 0.12), transparent 55%),
          linear-gradient(135deg, var(--bg), var(--bg-2));
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        color: var(--ink);
      }
      .card {
        width: min(560px, 100%);
        background: var(--card);
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
        border: 1px solid rgba(255, 255, 255, 0.8);
        pointer-events: none;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--line);
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
        color: var(--accent-deep);
        background: rgba(255, 255, 255, 0.7);
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
        border: 1px solid var(--accent);
        color: var(--accent-deep);
        background: transparent;
        text-decoration: none;
        font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
        font-size: 14px;
        letter-spacing: 0.04em;
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }
      .primary:hover {
        background: rgba(180, 138, 74, 0.12);
        box-shadow: 0 12px 24px rgba(31, 27, 22, 0.12);
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
      <div class="badge">Tenas Auth</div>
      <h1>${safeMessage}</h1>
      <p>若已打开桌面端，请继续操作；未打开请点击下方按钮。</p>
      <div class="actions">
        <a class="primary" href="${safeReturnUrl}" data-open-app>返回 Tenas AI</a>
      </div>
      <div class="footnote">点击按钮后将尝试关闭此页。</div>
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
