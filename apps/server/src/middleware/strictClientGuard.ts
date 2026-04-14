/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Context, Next } from "hono";
import { logger } from "@/common/logger";
import { CLIENT_HEADER_NAME } from "@/middleware/aiRouteGuard";

/**
 * Paths exempt from the strict client header check under /api/saas/raw/*.
 * These are SSE endpoints consumed via EventSource which cannot set custom
 * headers. They remain protected by taskId unguessability (SaaS SDK design).
 */
const SSE_EXEMPT_RE =
  /^\/api\/saas\/raw\/api\/ai\/v3\/task\/[^/]+\/events$/;

/**
 * Paths exempt under /auth/*: these are **browser-navigated** (redirect
 * targets from OAuth providers) and cannot carry custom headers.
 * - /auth/callback: SaaS redirects browser here after OAuth success with
 *   a one-time loginCode in query string; safe because the code is
 *   short-lived and single-use.
 */
const AUTH_BROWSER_NAV_EXEMPT: ReadonlySet<string> = new Set([
  "/auth/callback",
]);

/**
 * Strict CSRF guard — requires `X-OpenLoaf-Client` header on all non-OPTIONS
 * requests, including GET. Complements `localAuthGuard` by blocking drive-by
 * cross-origin reads of sensitive endpoints (`/auth/*`, `/api/saas/raw/*`).
 *
 * Unlike `aiRouteGuard`, this does NOT skip GET — sensitive JSON responses
 * must not be readable by malicious local pages via simple GET.
 *
 * SSE endpoints (task events) are the only exemption: EventSource cannot set
 * custom headers, and those endpoints are protected by unguessable taskIds.
 */
export async function strictClientGuard(
  c: Context,
  next: Next,
): Promise<Response | void> {
  if (c.req.method === "OPTIONS") {
    return next();
  }
  if (c.req.method === "GET" && SSE_EXEMPT_RE.test(c.req.path)) {
    return next();
  }
  // OAuth 回跳由浏览器导航触发，无法设置自定义 header —— 白名单豁免。
  if (c.req.method === "GET" && AUTH_BROWSER_NAV_EXEMPT.has(c.req.path)) {
    return next();
  }
  const clientHeader = c.req.header(CLIENT_HEADER_NAME);
  if (!clientHeader) {
    logger.warn(
      { path: c.req.path, method: c.req.method },
      "[strictClientGuard] Missing X-OpenLoaf-Client header",
    );
    return c.json({ error: "missing_client_header" }, 403);
  }
  return next();
}
