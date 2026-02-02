import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mapSaasError } from "@/modules/saas/core/errors";
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

/** Execute SaaS media handler with unified error handling. */
async function handleSaasMediaRoute(
  c: Context,
  handler: (accessToken: string) => Promise<unknown>,
): Promise<Response> {
  const accessToken = resolveBearerToken(c);
  if (!accessToken) {
    return c.json(buildSaasErrorPayload("saas_auth_required", "请先登录云端账号"), 401);
  }
  try {
    const payload = await handler(accessToken);
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
      return c.json(
        buildSaasErrorPayload(mapped.code, "SaaS 请求失败"),
        normalizeStatus(mapped.status),
      );
    }
    throw error;
  }
}

/** Register SaaS media proxy routes. */
export function registerSaasMediaRoutes(app: Hono): void {
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
    return handleSaasMediaRoute(c, async (accessToken) =>
      fetchImageModelsProxy(accessToken),
    );
  });

  app.get("/ai/vedio/models", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) =>
      fetchVideoModelsProxy(accessToken),
    );
  });
}
