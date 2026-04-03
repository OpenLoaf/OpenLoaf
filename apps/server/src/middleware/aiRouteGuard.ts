/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Context, Next } from 'hono'
import { logger } from '@/common/logger'

/**
 * Custom header name that OpenLoaf clients must include in AI route requests.
 *
 * This provides CSRF-style protection: browser cross-origin requests via
 * `<form>`, `<img>`, or simple GET/POST cannot attach custom headers.
 * Combined with CORS policy, this blocks drive-by requests from malicious
 * websites even when the server runs on localhost.
 */
export const CLIENT_HEADER_NAME = 'x-openloaf-client'

/**
 * AI route guard middleware.
 *
 * Verifies that requests to AI endpoints carry the `X-OpenLoaf-Client` header.
 * This complements `localAuthGuard` (which handles remote/session auth) by
 * protecting local-loopback requests against cross-site abuse:
 *
 * - Browsers enforce CORS preflight for custom headers, so a malicious page
 *   cannot call `POST /ai/chat` with this header unless the CORS policy allows
 *   the origin.
 * - Non-browser callers (curl, scripts) on localhost can still call the API —
 *   this is acceptable for a local-first desktop app where the user has full
 *   machine access.
 *
 * Skipped for:
 * - OPTIONS (CORS preflight)
 * - GET requests to SSE/stream endpoints (EventSource cannot set custom headers;
 *   these are protected by session cookie via localAuthGuard)
 */
export async function aiRouteGuard(c: Context, next: Next): Promise<Response | void> {
  // CORS preflight — always allow.
  if (c.req.method === 'OPTIONS') {
    return next()
  }

  // GET requests: SSE streams use EventSource which cannot set custom headers.
  // These endpoints are read-only and already guarded by localAuthGuard cookie.
  if (c.req.method === 'GET') {
    return next()
  }

  const clientHeader = c.req.header(CLIENT_HEADER_NAME)
  if (!clientHeader) {
    logger.warn(
      { path: c.req.path, method: c.req.method },
      '[aiRouteGuard] Missing X-OpenLoaf-Client header',
    )
    return c.json({ error: 'missing_client_header' }, 403)
  }

  return next()
}
