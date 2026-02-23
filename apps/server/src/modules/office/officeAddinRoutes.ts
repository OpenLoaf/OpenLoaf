import type { Hono } from "hono";
import path from "node:path";
import { promises as fs } from "node:fs";
import { logger } from "@/common/logger";

const DOCX_ENV_KEYS = ["WPS_ADDIN_DOCX_PATH", "TENAS_WPS_ADDIN_DOCX_PATH"];

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function resolveDocxAddinRoot(): string | null {
  for (const key of DOCX_ENV_KEYS) {
    const raw = process.env[key];
    if (raw && raw.trim()) return raw.trim();
  }
  return null;
}

function resolveMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function resolveSafePath(root: string, relativePath: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (!resolvedPath.startsWith(resolvedRoot)) return null;
  return resolvedPath;
}

async function readFileIfExists(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export function registerOfficeAddinRoutes(app: Hono) {
  app.get("/wps-addins/docx/*", async (c) => {
    const root = resolveDocxAddinRoot();
    if (!root) {
      return c.text("WPS addin path not configured", 404);
    }

    const requestPath = c.req.path;
    const prefix = "/wps-addins/docx/";
    const relative = requestPath.startsWith(prefix)
      ? requestPath.slice(prefix.length)
      : "";
    const target = relative || "manifest.xml";
    const safePath = resolveSafePath(root, target);
    if (!safePath) {
      return c.text("Invalid path", 403);
    }

    const content = await readFileIfExists(safePath);
    if (!content) {
      logger.warn({ safePath }, "[office-addin] file not found");
      return c.text("Not found", 404);
    }

    c.header("content-type", resolveMimeType(safePath));
    return c.body(new Uint8Array(content));
  });
}
