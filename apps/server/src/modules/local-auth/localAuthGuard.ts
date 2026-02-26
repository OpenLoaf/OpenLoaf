/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { Context, Next } from "hono";
import { getSignedCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import { ensureLocalAuthSecret, isLocalAuthConfigured } from "./localAuthStore";

/** Local auth session cookie name. */
export const LOCAL_AUTH_COOKIE_NAME = "tn_local_auth";

type LocalAuthSessionPayload = {
  /** Issued timestamp (ms). */
  iat: number;
  /** Expire timestamp (ms). */
  exp?: number;
};

/** Check whether address is loopback. */
function isLoopbackAddress(address?: string | null): boolean {
  if (!address) return false;
  if (address === "127.0.0.1" || address === "::1") return true;
  // 逻辑：兼容 IPv6 映射的 IPv4 回环地址。
  return address.startsWith("::ffff:127.0.0.1");
}

/** Parse session payload from cookie value. */
function parseSessionPayload(raw: string): LocalAuthSessionPayload | null {
  try {
    const parsed = JSON.parse(raw) as LocalAuthSessionPayload;
    if (!parsed || typeof parsed.iat !== "number") return null;
    if (parsed.exp && typeof parsed.exp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Check whether session payload is still valid. */
function isSessionValid(payload: LocalAuthSessionPayload): boolean {
  if (!payload.exp) return true;
  return Date.now() < payload.exp;
}

/** Local auth guard middleware for remote access. */
export async function localAuthGuard(c: Context, next: Next): Promise<Response | void> {
  if (c.req.method === "OPTIONS") {
    return next();
  }

  const path = c.req.path;
  if (path.startsWith("/local-auth/")) {
    return next();
  }

  const conn = getConnInfo(c);
  if (isLoopbackAddress(conn.remote?.address)) {
    return next();
  }

  if (!isLocalAuthConfigured()) {
    // 逻辑：远程访问且未设置密码时直接拒绝。
    return c.json({ error: "local_auth_unconfigured" }, 403);
  }

  const secret = ensureLocalAuthSecret();
  const signed = await getSignedCookie(c, secret, LOCAL_AUTH_COOKIE_NAME);
  if (!signed) {
    return c.json({ error: "local_auth_required" }, 401);
  }

  const payload = parseSessionPayload(signed);
  if (!payload || !isSessionValid(payload)) {
    return c.json({ error: "local_auth_required" }, 401);
  }

  return next();
}
