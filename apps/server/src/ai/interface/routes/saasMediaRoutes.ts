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
  fetchMediaModelsProxy,
  isMediaProxyHttpError,
  fetchCapabilitiesProxy,
  submitV3GenerateProxy,
  pollV3TaskProxy,
  cancelV3TaskProxy,
  pollV3TaskGroupProxy,
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

type SaasMediaRouteOptions = {
  /** Allow missing access token. */
  allowAnonymous?: boolean;
};

/** Execute SaaS media handler with unified error handling. */
async function handleSaasMediaRoute(
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

/** Register SaaS media proxy routes. */
export function registerSaasMediaRoutes(app: Hono): void {
  // 逻辑：v2 models 路由保留，供 AI 聊天模型偏好使用。
  app.get("/ai/media/models", async (c) => {
    const feature = c.req.query("feature") || undefined;
    return handleSaasMediaRoute(
      c,
      async (accessToken) => fetchMediaModelsProxy(accessToken, feature),
      { allowAnonymous: true },
    );
  });

  // ── v3 routes ──

  app.get("/ai/v3/capabilities/:category", async (c) => {
    const category = c.req.param("category");
    if (!["image", "video", "audio"].includes(category)) {
      return c.json(buildSaasErrorPayload("invalid_category", "无效的能力类别"), 400);
    }
    return handleSaasMediaRoute(
      c,
      async (accessToken) => fetchCapabilitiesProxy(category as any, accessToken),
      { allowAnonymous: true },
    );
  });

  app.post("/ai/v3/generate", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      const body = await c.req.json().catch(() => null);
      return submitV3GenerateProxy(body, accessToken);
    });
  });

  app.get("/ai/v3/task/:taskId", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      const projectId = c.req.query("projectId") || undefined;
      const saveDir = c.req.query("saveDir") || undefined;
      const boardId = c.req.query("boardId") || undefined;
      return pollV3TaskProxy(c.req.param("taskId"), accessToken, { projectId, saveDir, boardId });
    });
  });

  app.post("/ai/v3/task/:taskId/cancel", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      return cancelV3TaskProxy(c.req.param("taskId"), accessToken);
    });
  });

  app.get("/ai/v3/task-group/:groupId", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      return pollV3TaskGroupProxy(c.req.param("groupId"), accessToken);
    });
  });
}
