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
  uploadOrInlineBuffer,
  MEDIA_TYPE_MAP,
} from "@/modules/saas/modules/media/mediaProxy";
import { resolveBoardDirFromDb } from "@openloaf/api/common/boardPaths";
import { promises as fsPromises } from "node:fs";
import nodePath from "node:path";

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

  app.post("/ai/v3/media/upload", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      const contentType = c.req.header("content-type") || "";

      // JSON body: { path, boardId }
      if (contentType.includes("application/json")) {
        const body = await c.req.json().catch(() => null);
        if (!body) {
          return { success: false, message: "Invalid JSON body" };
        }
        const inputPath = typeof body.path === "string" ? body.path.trim() : "";
        const boardId = typeof body.boardId === "string" ? body.boardId.trim() : "";
        if (!inputPath || !boardId) {
          return { success: false, message: "path and boardId are required" };
        }
        if (inputPath.includes("..")) {
          return { success: false, message: "Invalid file path" };
        }
        const boardResult = await resolveBoardDirFromDb(boardId);
        if (!boardResult) {
          return { success: false, message: "Board not found" };
        }
        let absPath = nodePath.resolve(boardResult.absDir, inputPath);
        if (!absPath.startsWith(nodePath.resolve(boardResult.absDir) + nodePath.sep)) {
          return { success: false, message: "Invalid file path" };
        }
        // 逻辑：兼容旧版 global-root-relative 路径（如 "temp/boards/board_xxx/asset/xxx.png"）。
        // resolveBoardDirFromDb 已通过 resolveBoardRootPath 兼容旧 folderUri，
        // 这里仅处理 inputPath 非 board-relative 的情况（提取 asset/xxx.png 尾部）。
        try {
          await fsPromises.access(absPath);
        } catch {
          const assetMatch = inputPath.match(/(?:^|\/)(asset\/[^/]+)$/);
          if (assetMatch) {
            const altPath = nodePath.resolve(boardResult.absDir, assetMatch[1]);
            if (altPath.startsWith(nodePath.resolve(boardResult.absDir) + nodePath.sep)) {
              absPath = altPath;
            }
          }
        }
        try {
          const buffer = await fsPromises.readFile(absPath);
          const ext = nodePath.extname(absPath).toLowerCase();
          const mediaType = MEDIA_TYPE_MAP[ext] || "application/octet-stream";
          const result = await uploadOrInlineBuffer(
            Buffer.from(buffer),
            nodePath.basename(absPath),
            mediaType,
            {},
            accessToken,
          );
          return { success: true, data: result };
        } catch (err) {
          logger.warn({ err, absPath }, "Failed to read board asset file for upload");
          return { success: false, message: "File not found or unreadable" };
        }
      }

      // Multipart: file upload
      let formData: Record<string, unknown>;
      try {
        formData = await c.req.parseBody();
      } catch {
        return { success: false, message: "Invalid multipart body" };
      }
      const file = formData.file;
      if (!file || typeof file === "string") {
        return { success: false, message: "file field is required" };
      }
      const fileObj = file as File;
      const buffer = Buffer.from(await fileObj.arrayBuffer());
      const mediaType = fileObj.type || "application/octet-stream";
      const result = await uploadOrInlineBuffer(
        buffer,
        fileObj.name || "upload",
        mediaType,
        {},
        accessToken,
      );
      return { success: true, data: result };
    });
  });
}
