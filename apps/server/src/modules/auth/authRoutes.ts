import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getEnvString } from "@tenas-ai/config";
import { logger } from "@/common/logger";
import {
  applyTokenExchangeResult,
  clearAuthSession,
  getAccessToken,
  getAuthSessionSnapshot,
  getRefreshToken,
  isAccessTokenValid,
} from "./tokenStore";

/** 判断是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type LoginUrlResponse = {
  /** Login URL for the SaaS. */
  authorizeUrl: string;
};

type RefreshTokenResponse = {
  /** New access token. */
  accessToken: string;
  /** New refresh token. */
  refreshToken?: string;
  /** Access token expiry in seconds. */
  expiresIn?: number;
  /** User profile. */
  user?: {
    /** User email. */
    email?: string;
    /** User display name. */
    name?: string;
    /** User avatar URL. */
    avatarUrl?: string;
  };
};

/**
 * Register SaaS auth routes.
 */
export function registerAuthRoutes(app: Hono): void {
  app.get("/auth/login-url", (c) => {
    try {
      const authorizeUrl = buildLoginUrl();
      return c.json({ authorizeUrl } satisfies LoginUrlResponse);
    } catch (error) {
      logger.error({ err: error }, "Failed to build SaaS login url");
      return c.json({ error: "saas_url_missing" }, 500);
    }
  });

  app.get("/auth/callback", async (c) => {
    const accessToken = c.req.query("access_token");
    const refreshToken = c.req.query("refresh_token");
    const avatarUrl = c.req.query("avatar_url");
    const email = c.req.query("email");
    const name = c.req.query("name");
    const expiresIn = parseExpiresIn(c.req.query("expires_in"));
    if (!accessToken) {
      return c.html(renderCallbackPage("登录失败：缺少回调参数"));
    }
    const pictureBase64 = await resolveAvatarBase64(avatarUrl);
    // 逻辑：回调收到 token 后写入配置/内存，并允许页面提示关闭。
    applyTokenExchangeResult({
      accessToken,
      refreshToken: refreshToken ?? undefined,
      expiresIn,
      user:
        pictureBase64 || avatarUrl || email || name
          ? {
              picture: pictureBase64 ?? undefined,
              avatarUrl: avatarUrl ?? undefined,
              email: email ?? undefined,
              name: name ?? undefined,
            }
          : undefined,
    });
    return c.html(renderCallbackPage("登录成功，可关闭此窗口"));
  });

  app.get("/auth/session", async (c) => {
    await ensureAccessTokenFresh();
    const snapshot = getAuthSessionSnapshot();
    return c.json({
      loggedIn: snapshot.loggedIn,
      user: snapshot.user
        ? {
            email: snapshot.user.email,
            name: snapshot.user.name,
            picture: snapshot.user.picture,
            avatarUrl: snapshot.user.avatarUrl,
          }
        : undefined,
    });
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
        // SaaS 返回非 2xx 时记录状态码便于排查。
        logger.warn({ status: response.status, payload }, "SaaS balance request failed");
        // Hono JSON 响应需要 ContentfulStatusCode，透传 fetch 状态码。
        return c.json({ error: "saas_request_failed" }, response.status as ContentfulStatusCode);
      }
      const snapshot = getAuthSessionSnapshot();
      const safePayload = isRecord(payload) ? payload : {};
      return c.json({
        ...safePayload,
        user: snapshot.user
          ? {
              email: snapshot.user.email,
              name: snapshot.user.name,
              avatarUrl: snapshot.user.avatarUrl,
            }
          : undefined,
      });
    } catch (error) {
      logger.error({ err: error }, "SaaS balance request failed");
      return c.json({ error: "saas_request_failed" }, 502);
    }
  });

  app.post("/auth/cancel", (c) => {
    // 逻辑：保留接口以兼容前端取消流程，不做额外处理。
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
export async function ensureAccessTokenFresh(): Promise<void> {
  if (isAccessTokenValid()) return;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return;
  try {
    // 逻辑：access token 失效时使用 refresh token 获取新 token。
    const token = await refreshAccessToken({ refreshToken });
    const pictureBase64 = await resolveAvatarBase64(token.user?.avatarUrl);
    applyTokenExchangeResult({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
      user: token.user
        ? {
            picture: pictureBase64 ?? undefined,
            avatarUrl: token.user.avatarUrl ?? undefined,
            email: token.user.email ?? undefined,
            name: token.user.name ?? undefined,
          }
        : undefined,
    });
  } catch (error) {
    logger.error({ err: error }, "SaaS refresh failed");
    // 逻辑：刷新失败视为失效，避免死循环请求。
    clearAuthSession();
  }
}

/**
 * Request access token refresh from SaaS.
 */
async function refreshAccessToken(input: {
  refreshToken: string;
}): Promise<RefreshTokenResponse> {
  const saasBaseUrl = getSaasBaseUrl();
  if (!saasBaseUrl) {
    throw new Error("saas_url_missing");
  }
  const response = await fetch(`${saasBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: input.refreshToken }),
  });
  if (!response.ok) {
    throw new Error(`saas_refresh_failed_${response.status}`);
  }
  const payload = (await response.json()) as Partial<
    RefreshTokenResponse & {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: {
        email?: string;
        name?: string;
        avatarUrl?: string;
        avatar_url?: string;
      };
    }
  >;
  const accessToken = payload.accessToken ?? payload.access_token;
  if (!accessToken) {
    throw new Error("saas_refresh_invalid");
  }
  return {
    accessToken,
    refreshToken: payload.refreshToken ?? payload.refresh_token,
    expiresIn: payload.expiresIn ?? payload.expires_in,
    user: payload.user
      ? {
          email: payload.user.email ?? undefined,
          name: payload.user.name ?? undefined,
          avatarUrl: payload.user.avatarUrl ?? payload.user.avatar_url ?? undefined,
        }
      : undefined,
  };
}

/**
 * Build the SaaS login URL for system browser.
 */
function buildLoginUrl(): string {
  const saasAuthBaseUrl = getSaasAuthBaseUrl();
  if (!saasAuthBaseUrl) {
    throw new Error("saas_auth_url_missing");
  }
  const port = getServerPort();
  const url = new URL(`${saasAuthBaseUrl}/login`);
  url.searchParams.set("from", "electron");
  url.searchParams.set("port", String(port));
  return url.toString();
}

/**
 * Resolve server port from environment.
 */
function getServerPort(): number {
  const portValue = process.env.PORT ?? "23333";
  const parsed = Number(portValue);
  return Number.isFinite(parsed) ? parsed : 23333;
}

/**
 * Parse expires_in from query string.
 */
function parseExpiresIn(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Resolve avatar to base64 data URL for storage.
 */
async function resolveAvatarBase64(avatarUrl: string | undefined): Promise<string | undefined> {
  if (!avatarUrl) return undefined;
  if (avatarUrl.startsWith("data:")) return avatarUrl;
  if (!isHttpUrl(avatarUrl)) {
    // 逻辑：非 HTTP 地址默认视为已是 base64 字符串。
    return avatarUrl;
  }
  try {
    const response = await fetch(avatarUrl);
    if (!response.ok) {
      logger.warn({ status: response.status }, "Failed to fetch avatar for base64");
      return undefined;
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    // 逻辑：统一存储为 data URL，前端可直接作为图片源使用。
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    logger.warn({ err: error }, "Failed to resolve avatar base64");
    return undefined;
  }
}

/**
 * Check whether a string is an HTTP(S) URL.
 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
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
      <div class="badge">Tenas Auth</div>
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
 * Resolve SaaS base URL from env.
 */
export function getSaasBaseUrl(): string | null {
  const value = getEnvString(process.env, "TENAS_SAAS_URL");
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

/**
 * Resolve SaaS auth base URL from env.
 */
function getSaasAuthBaseUrl(): string | null {
  const value = getEnvString(process.env, "TENAS_SAAS_AUTH_URL");
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}
