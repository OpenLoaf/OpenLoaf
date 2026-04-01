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
  saasUrl?: string;
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
  const saasUrl = options.saasUrl ? escapeHtml(options.saasUrl.trim().replace(/\/$/, "")) : "";
  const isSuccess = rawMessage.includes("成功");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>OpenLoaf</title>
    <style>
      * { box-sizing: border-box; margin: 0; }
      body {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #fff;
        text-align: center;
        user-select: none;
        -webkit-user-select: none;
        overflow: hidden;
      }
      /* 边缘径向遮罩 */
      .vignette {
        position: fixed;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(ellipse 80% 60% at 50% 50%, transparent 20%, rgba(0,0,0,0.6) 60%, #000 100%);
        z-index: 0;
      }
      /* 顶部黄线 */
      .line-top {
        position: fixed;
        top: 0;
        left: 0;
        height: 1px;
        background: linear-gradient(to right, #ffcc00, transparent);
        animation: lineGrow 1.8s ease-out forwards;
        z-index: 2;
      }
      /* 底部黄线 */
      .line-bottom {
        position: fixed;
        bottom: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(to left, #ffcc00, transparent);
        animation: lineGrow 1.8s 0.5s ease-out forwards;
        z-index: 2;
      }
      @keyframes lineGrow {
        from { width: 0; }
        to { width: 50%; }
      }
      .container {
        position: relative;
        z-index: 10;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
      }
      /* 状态标签 */
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px;
        border: 1px solid #222;
        background: rgba(0,0,0,0.6);
        color: #888;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        backdrop-filter: blur(4px);
        animation: fadeSlideDown 0.6s 0.3s ease-out both;
      }
      .badge-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        background: #ffcc00;
        animation: pulse 2s infinite;
      }
      .badge-dot.success { background: #22c55e; }
      .badge-dot.error { background: #ef4444; }
      /* 主标题 */
      .title {
        font-size: clamp(2.5rem, 10vw, 5rem);
        font-weight: 700;
        line-height: 0.9;
        letter-spacing: -0.03em;
        animation: fadeSlideUp 0.8s 0.4s ease-out both;
      }
      .title .accent { color: #ffcc00; }
      /* 消息 */
      .message {
        font-size: 13px;
        color: #ccc;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        font-family: "Space Mono", "Menlo", monospace;
        animation: fadeSlideUp 0.6s 0.7s ease-out both;
      }
      /* 进度条 */
      .progress-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        animation: fadeIn 0.6s 1.0s ease-out both;
      }
      .progress-track {
        position: relative;
        width: 192px;
        height: 1px;
        background: #222;
        overflow: hidden;
      }
      .progress-bar {
        position: absolute;
        top: 0;
        left: 0;
        width: 40%;
        height: 100%;
        background: #ffcc00;
        animation: progressSlide 1.6s ease-in-out infinite;
      }
      .progress-bar.done {
        width: 100%;
        animation: none;
      }
      .progress-label {
        font-size: 10px;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 0.3em;
        font-family: "Space Mono", "Menlo", monospace;
        animation: pulse 2s infinite;
      }
      /* 返回按钮 */
      .btn {
        display: inline-block;
        margin-top: 8px;
        padding: 8px 24px;
        border: 1px solid #222;
        background: transparent;
        color: #888;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        text-decoration: none;
        transition: border-color 150ms, color 150ms;
        animation: fadeIn 0.6s 1.2s ease-out both;
      }
      .btn:hover {
        border-color: #ffcc00;
        color: #ffcc00;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      @keyframes fadeSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeSlideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes progressSlide {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }
    </style>
  </head>
  <body>
    <canvas id="pulsar" style="position:fixed;inset:0;width:100%;height:100%;z-index:0;opacity:0;transition:opacity 1.2s ease-in"></canvas>
    <div class="vignette"></div>
    <div class="line-top"></div>
    <div class="line-bottom"></div>

    <div class="container">
      <div class="badge">
        <span class="badge-dot${isSuccess ? " success" : ""}${!isSuccess && rawMessage.includes("失败") ? " error" : ""}"></span>
        ${isSuccess ? "COMPLETE" : rawMessage.includes("失败") ? "ERROR" : "AUTHENTICATING"}
      </div>

      <h1 class="title">Open<span class="accent">Loaf</span></h1>

      <div class="message">${safeMessage}</div>

      <div class="progress-wrap">
        <div class="progress-track">
          <div class="progress-bar${isSuccess ? " done" : ""}"></div>
        </div>
        <span class="progress-label">${isSuccess ? "Done" : "Processing"}</span>
      </div>

      <div style="display:flex;gap:12px;animation:fadeIn 0.6s 1.2s ease-out both">
        ${saasUrl ? `<a class="btn" href="${saasUrl}" target="_blank" rel="noopener noreferrer" style="animation:none">打开官网</a>` : ""}
        <a class="btn" href="${safeReturnUrl}" data-open-app style="animation:none">回到应用</a>
      </div>
    </div>
    <script>
      (() => {
        /* — 返回按钮 & 自动跳转 — */
        const isOk = ${isSuccess ? "true" : "false"};
        const btn = document.querySelector("[data-open-app]");
        if (btn) {
          btn.addEventListener("click", () => {
            setTimeout(() => { window.close(); }, 120);
          });
        }
        if (isOk) {
          setTimeout(() => { if (btn) btn.click(); }, 2000);
        }

        /* — PulsarGrid canvas（移植自 PulsarGrid.tsx） — */
        const canvas = document.getElementById("pulsar");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let w = 0, h = 0, dots = [], opacities, radii, time = 0, raf;
        const SP = 44, CD = SP * 1.55;
        let sg, gc, gr;
        let mx = -1, my = -1;

        function setup() {
          const dpr = Math.min(devicePixelRatio || 1, 2);
          w = innerWidth; h = innerHeight;
          canvas.width = w * dpr; canvas.height = h * dpr;
          canvas.style.width = w + "px"; canvas.style.height = h + "px";
          ctx.scale(dpr, dpr);
          dots = [];
          for (let x = 0; x <= w; x += SP)
            for (let y = 0; y <= h; y += SP)
              dots.push({ x: x + SP / 2, y: y + SP / 2 });
          opacities = new Float32Array(dots.length);
          radii = new Float32Array(dots.length);
          gc = Math.ceil(w / CD) + 1;
          gr = Math.ceil(h / CD) + 1;
          sg = Array.from({ length: gc * gr }, () => []);
          for (let i = 0; i < dots.length; i++) {
            const c = Math.floor(dots[i].x / CD), r = Math.floor(dots[i].y / CD);
            sg[c * gr + r].push(i);
          }
          canvas.style.opacity = "1";
        }

        function frame() {
          ctx.clearRect(0, 0, w, h);
          const t = time * 0.005;
          const ax = w * 0.5 + Math.sin(t * 1.3) * w * 0.28;
          const ay = h * 0.5 + Math.cos(t * 0.71) * h * 0.22;
          const hasMouse = mx >= 0;
          const fx = hasMouse ? mx : ax, fy = hasMouse ? my : ay;
          const n = dots.length;

          for (let i = 0; i < n; i++) {
            const px = dots[i].x, py = dots[i].y;
            const w1 = Math.sin(Math.hypot(px - fx, py - fy) * 0.021 - time * 0.037);
            const w2 = Math.sin(Math.hypot(px - ax, py - ay) * 0.017 - time * 0.028) * 0.55;
            const wave = Math.max(w1, w2);
            opacities[i] = Math.max(0, wave * 0.82);
            radii[i] = 1 + Math.max(0, wave) * 2.4;
          }

          /* 连线 — 低亮度 */
          ctx.lineWidth = 0.4;
          ctx.strokeStyle = "rgba(255,204,0,0.12)";
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            if (opacities[i] < 0.12) continue;
            const dx = dots[i].x, dy = dots[i].y;
            const c0 = Math.floor(dx / CD), r0 = Math.floor(dy / CD);
            for (let dc = -1; dc <= 1; dc++) {
              const nc = c0 + dc; if (nc < 0 || nc >= gc) continue;
              for (let dr = -1; dr <= 1; dr++) {
                const nr = r0 + dr; if (nr < 0 || nr >= gr) continue;
                for (const j of sg[nc * gr + nr]) {
                  if (j <= i || opacities[j] < 0.12) continue;
                  if (Math.min(opacities[i], opacities[j]) < 0.2) continue;
                  if (Math.hypot(dx - dots[j].x, dy - dots[j].y) > CD) continue;
                  ctx.moveTo(dx, dy); ctx.lineTo(dots[j].x, dots[j].y);
                }
              }
            }
          }
          ctx.stroke();

          /* 连线 — 高亮度 */
          ctx.strokeStyle = "rgba(255,204,0,0.28)";
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            if (opacities[i] < 0.55) continue;
            const dx = dots[i].x, dy = dots[i].y;
            const c0 = Math.floor(dx / CD), r0 = Math.floor(dy / CD);
            for (let dc = -1; dc <= 1; dc++) {
              const nc = c0 + dc; if (nc < 0 || nc >= gc) continue;
              for (let dr = -1; dr <= 1; dr++) {
                const nr = r0 + dr; if (nr < 0 || nr >= gr) continue;
                for (const j of sg[nc * gr + nr]) {
                  if (j <= i || opacities[j] < 0.55) continue;
                  if (Math.hypot(dx - dots[j].x, dy - dots[j].y) > CD) continue;
                  ctx.moveTo(dx, dy); ctx.lineTo(dots[j].x, dots[j].y);
                }
              }
            }
          }
          ctx.stroke();

          /* 暗点 */
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            if (opacities[i] > 0.05) continue;
            ctx.moveTo(dots[i].x + 0.5, dots[i].y);
            ctx.arc(dots[i].x, dots[i].y, 0.5, 0, Math.PI * 2);
          }
          ctx.fill();

          /* 亮点 — 分桶批绘 */
          const buckets = [
            [0.05, 0.35, "rgba(255,204,0,0.35)"],
            [0.35, 0.65, "rgba(255,204,0,0.6)"],
            [0.65, 1.0,  "rgba(255,204,0,0.85)"],
          ];
          for (const [lo, hi, style] of buckets) {
            ctx.fillStyle = style;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
              const op = opacities[i];
              if (op <= lo || op > hi) continue;
              ctx.moveTo(dots[i].x + radii[i], dots[i].y);
              ctx.arc(dots[i].x, dots[i].y, radii[i], 0, Math.PI * 2);
            }
            ctx.fill();
          }

          /* 扫描线 */
          const scanY = ((time * 0.28) % (h + 80)) - 40;
          if (scanY > -40 && scanY < h) {
            const g = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 5);
            g.addColorStop(0, "rgba(255,204,0,0)");
            g.addColorStop(0.6, "rgba(255,204,0,0.012)");
            g.addColorStop(1, "rgba(255,204,0,0.04)");
            ctx.fillStyle = g;
            ctx.fillRect(0, Math.max(0, scanY - 30), w, 35);
          }

          time++;
          raf = requestAnimationFrame(frame);
        }

        setup();
        frame();
        addEventListener("resize", setup);
        addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });
        document.addEventListener("mouseleave", (e) => { if (!e.relatedTarget) { mx = -1; my = -1; } });
      })();
    </script>
  </body>
</html>`;
}
