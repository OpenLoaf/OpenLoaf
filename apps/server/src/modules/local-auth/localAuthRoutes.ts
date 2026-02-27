/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import {
  ensureLocalAuthSecret,
  getLocalAuthSnapshot,
  isLocalAuthConfigured,
  setLocalAuthPassword,
  verifyLocalAuthPassword,
} from "./localAuthStore";
import { LOCAL_AUTH_COOKIE_NAME } from "./localAuthGuard";

/** Short session lifetime in seconds. */
const SHORT_SESSION_SECONDS = 8 * 60 * 60;
/** Remember-me session lifetime in seconds. */
const LONG_SESSION_SECONDS = 30 * 24 * 60 * 60;

type LocalAuthSessionPayload = {
  /** Issued timestamp (ms). */
  iat: number;
  /** Expire timestamp (ms). */
  exp?: number;
};

type LocalAuthSessionResponse = {
  /** Whether request comes from localhost. */
  isLocal: boolean;
  /** Whether a local password is configured. */
  configured: boolean;
  /** Whether current request has a valid session. */
  loggedIn: boolean;
  /** Whether remote access requires login. */
  requiresAuth: boolean;
  /** Whether remote access is blocked due to missing password. */
  blocked: boolean;
  /** Password updated timestamp. */
  updatedAt?: string;
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

/** Build session payload and cookie options. */
function buildSession(remember: boolean): {
  payload: LocalAuthSessionPayload;
  maxAge: number;
} {
  const maxAge = remember ? LONG_SESSION_SECONDS : SHORT_SESSION_SECONDS;
  const now = Date.now();
  return {
    payload: { iat: now, exp: now + maxAge * 1000 },
    maxAge,
  };
}

/** Register local auth routes. */
export function registerLocalAuthRoutes(app: Hono): void {
  app.get("/local-auth/session", async (c) => {
    const conn = getConnInfo(c);
    const isLocal = isLoopbackAddress(conn.remote?.address);
    const snapshot = getLocalAuthSnapshot();
    const configured = snapshot.configured;
    let loggedIn = isLocal;
    if (!isLocal && configured) {
      const secret = ensureLocalAuthSecret();
      const signed = await getSignedCookie(c, secret, LOCAL_AUTH_COOKIE_NAME);
      if (signed) {
        const payload = parseSessionPayload(signed);
        loggedIn = Boolean(payload && isSessionValid(payload));
      }
    }
    const blocked = !isLocal && !configured;
    const requiresAuth = !isLocal && configured && !loggedIn;
    const response: LocalAuthSessionResponse = {
      isLocal,
      configured,
      loggedIn,
      requiresAuth,
      blocked,
      updatedAt: snapshot.updatedAt,
    };
    return c.json(response);
  });

  app.post("/local-auth/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";
    const remember = Boolean(body?.remember);
    if (!password) {
      return c.json({ error: "password_required" }, 400);
    }
    if (!isLocalAuthConfigured()) {
      return c.json({ error: "local_auth_unconfigured" }, 400);
    }
    if (!verifyLocalAuthPassword(password)) {
      return c.json({ error: "local_auth_invalid" }, 401);
    }
    const secret = ensureLocalAuthSecret();
    const session = buildSession(remember);
    await setSignedCookie(
      c,
      LOCAL_AUTH_COOKIE_NAME,
      JSON.stringify(session.payload),
      secret,
      {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: session.maxAge,
      },
    );
    return c.json({ ok: true });
  });

  app.post("/local-auth/logout", (c) => {
    deleteCookie(c, LOCAL_AUTH_COOKIE_NAME, { path: "/" });
    return c.json({ ok: true });
  });

  app.post("/local-auth/setup", async (c) => {
    const conn = getConnInfo(c);
    const isLocal = isLoopbackAddress(conn.remote?.address);
    if (!isLocal) {
      return c.json({ error: "local_only" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";
    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    if (!password || password.trim().length < 6) {
      return c.json({ error: "password_too_short" }, 400);
    }
    if (isLocalAuthConfigured() && !verifyLocalAuthPassword(currentPassword)) {
      return c.json({ error: "local_auth_invalid" }, 401);
    }
    setLocalAuthPassword(password.trim());
    return c.json({ ok: true });
  });
}
