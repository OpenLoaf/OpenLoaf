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
import path from "node:path";
import { promises as fs } from "node:fs";
import { getProjectRootPath } from "@openloaf/api/services/vfsService";
import { logger } from "@/common/logger";

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function resolveMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

/**
 * 静态文件代理路由。
 *
 * 将项目内的文件通过 HTTP 提供，主要用于在内置浏览器组件中渲染 HTML 文件。
 * HTML 内引用的相对资源（CSS/JS/图片）也会通过此路由加载。
 *
 * GET /fs/serve/:projectId/*
 */
export function registerFileServeRoutes(app: Hono) {
  app.get("/fs/serve/:projectId/*", async (c) => {
    const projectId = c.req.param("projectId");
    if (!projectId) {
      return c.text("Missing projectId", 400);
    }

    const projectRoot = getProjectRootPath(projectId);
    if (!projectRoot) {
      return c.text("Project not found", 404);
    }

    const requestPath = c.req.path;
    const prefix = `/fs/serve/${projectId}/`;
    const relativePath = decodeURIComponent(
      requestPath.startsWith(prefix) ? requestPath.slice(prefix.length) : "",
    );
    if (!relativePath) {
      return c.text("Missing file path", 400);
    }

    // 路径穿越防护
    const resolvedRoot = path.resolve(projectRoot);
    const resolvedPath = path.resolve(resolvedRoot, relativePath);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return c.text("Invalid path", 403);
    }

    try {
      const content = await fs.readFile(resolvedPath);
      c.header("Content-Type", resolveMimeType(resolvedPath));
      c.header("Cache-Control", "no-cache");
      return c.body(new Uint8Array(content));
    } catch {
      logger.warn({ resolvedPath }, "[file-serve] file not found");
      return c.text("Not found", 404);
    }
  });
}
