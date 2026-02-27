/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mapSaasError } from "@/modules/saas/core/errors";
import { logger } from "@/common/logger";
import {
  cancelMediaProxy,
  fetchImageModelsProxy,
  fetchVideoModelsProxy,
  isMediaProxyHttpError,
  pollMediaProxy,
  submitImageProxy,
  submitVideoProxy,
} from "@/modules/saas/modules/media/mediaProxy";

type SaasErrorPayload = {
  /** Marks response as failure. */
  success: false;
  /** Stable error code. */
  code: string;
  /** Human readable message. */
  message: string;
};

/** Resolve force refresh query flag. */
function resolveForceRefresh(queryValue?: string): boolean {
  if (!queryValue) return false;
  const normalized = queryValue.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/** Normalize numeric status to a Hono contentful status code. */
function normalizeStatus(status: number): ContentfulStatusCode {
  if (status >= 200 && status < 600) {
    return status as ContentfulStatusCode;
  }
  return 502;
}

/** Extract bearer token from request headers. */
function resolveBearerToken(c: Context): string | null {
  const authHeader = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Build a standard SaaS error response payload. */
function buildSaasErrorPayload(code: string, message: string): SaasErrorPayload {
  return { success: false, code, message };
}

type SaasMediaRouteOptions = {
  /** Allow missing access token. */
  allowAnonymous?: boolean;
};

/** Execute SaaS media handler with unified error handling. */
export async function handleSaasMediaRoute(
  c: Context,
  handler: (accessToken: string) => Promise<unknown>,
  options?: SaasMediaRouteOptions,
): Promise<Response> {
  const accessToken = resolveBearerToken(c);
  if (!accessToken && !options?.allowAnonymous) {
    return c.json(buildSaasErrorPayload("saas_auth_required", "请先登录云端账号"), 401);
  }
  const token = accessToken ?? "";
  try {
    const payload = await handler(token);
    return c.json(payload, 200);
  } catch (error) {
    if (isMediaProxyHttpError(error)) {
      return c.json(
        buildSaasErrorPayload(error.code, error.message),
        normalizeStatus(error.status),
      );
    }
    const mapped = mapSaasError(error);
    if (mapped) {
      // 逻辑：输出 SaaS 返回内容，便于排查失败原因。
      logger.error(
        {
          err: error,
          code: mapped.code,
          status: mapped.status,
          payload: mapped.payload,
        },
        "SaaS request failed",
      );
      return c.json(
        buildSaasErrorPayload(mapped.code, "SaaS 请求失败"),
        normalizeStatus(mapped.status),
      );
    }
    throw error;
  }
}

type SaasMediaRouteDeps = {
  /** Override image model fetcher for tests. */
  fetchImageModelsProxy?: typeof fetchImageModelsProxy;
  /** Override video model fetcher for tests. */
  fetchVideoModelsProxy?: typeof fetchVideoModelsProxy;
};

/** Register SaaS media proxy routes. */
export function registerSaasMediaRoutes(
  app: Hono,
  deps: SaasMediaRouteDeps = {},
): void {
  const fetchImageModelsHandler = deps.fetchImageModelsProxy ?? fetchImageModelsProxy;
  const fetchVideoModelsHandler = deps.fetchVideoModelsProxy ?? fetchVideoModelsProxy;

  app.post("/ai/image", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      const body = await c.req.json().catch(() => null);
      return submitImageProxy(body, accessToken);
    });
  });

  app.post("/ai/vedio", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      const body = await c.req.json().catch(() => null);
      return submitVideoProxy(body, accessToken);
    });
  });

  app.get("/ai/task/:taskId", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) =>
      pollMediaProxy(c.req.param("taskId"), accessToken),
    );
  });

  app.post("/ai/task/:taskId/cancel", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) =>
      cancelMediaProxy(c.req.param("taskId"), accessToken),
    );
  });

  app.get("/ai/image/models", async (c) => {
    const force = resolveForceRefresh(c.req.query("force"));
    return handleSaasMediaRoute(
      c,
      async (accessToken) => fetchImageModelsHandler(accessToken, { force }),
      { allowAnonymous: true },
    );
  });

  app.get("/ai/vedio/models", async (c) => {
    const force = resolveForceRefresh(c.req.query("force"));
    return handleSaasMediaRoute(
      c,
      async (accessToken) => fetchVideoModelsHandler(accessToken, { force }),
      { allowAnonymous: true },
    );
  });
}
