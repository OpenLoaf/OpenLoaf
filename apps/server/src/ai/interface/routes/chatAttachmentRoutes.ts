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
import { promises as fsPromises } from "node:fs";
import nodePath from "node:path";
import JSZip from "jszip";
import {
  ChatAttachmentController,
  type ChatAttachmentBody,
} from "@/ai/interface/controllers/ChatAttachmentController";
import { resolveMessagesJsonlPath } from "@/ai/services/chat/repositories/chatFileStore";

const controller = new ChatAttachmentController();
const SESSION_EXPORT_MAX_BYTES = 10 * 1024 * 1024;
const SESSION_COMPACT_FILE_NAMES = new Set([
  "messages.jsonl",
  "session.json",
  "system.json",
  "PROMPT.md",
  "PREFACE.md",
]);

type SessionFileEntry = {
  /** Absolute file path on disk. */
  absolutePath: string;
  /** Relative path inside zip archive. */
  relativePath: string;
  /** File size in bytes. */
  size: number;
};

/** Normalize path separators to zip-friendly POSIX style. */
function toZipRelativePath(value: string): string {
  return value.split(nodePath.sep).join("/");
}

/** Recursively collect all files under a directory. */
async function collectDirectoryFiles(
  rootDir: string,
  currentDir = rootDir,
): Promise<SessionFileEntry[]> {
  const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
  const files: SessionFileEntry[] = [];
  for (const entry of entries) {
    const absolutePath = nodePath.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectDirectoryFiles(rootDir, absolutePath);
      files.push(...nested);
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await fsPromises.stat(absolutePath);
    const relativePath = toZipRelativePath(nodePath.relative(rootDir, absolutePath));
    files.push({ absolutePath, relativePath, size: stat.size });
  }
  return files;
}

/** Resolve export entries with size-based fallback strategy. */
function resolveExportEntries(input: {
  allFiles: SessionFileEntry[];
  sourceBytes: number;
}): { files: SessionFileEntry[]; compactMode: boolean } {
  if (input.sourceBytes <= SESSION_EXPORT_MAX_BYTES) {
    return { files: input.allFiles, compactMode: false };
  }
  // 逻辑：会话目录超过 10MB 时，仅保留核心会话文件，避免上传超大 zip。
  const compactFiles = input.allFiles.filter((file) => {
    const parsed = nodePath.posix.parse(file.relativePath);
    return (
      (parsed.dir === "" || parsed.dir === ".") &&
      SESSION_COMPACT_FILE_NAMES.has(parsed.base)
    );
  });
  return { files: compactFiles, compactMode: true };
}

/** Build a zip archive from file entries. */
async function buildZipFromEntries(entries: SessionFileEntry[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const entry of entries) {
    const content = await fsPromises.readFile(entry.absolutePath);
    zip.file(entry.relativePath, content);
  }
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/** Register chat attachment routes. */
export function registerChatAttachmentRoutes(app: Hono) {
  app.get("/chat/sessions/:sessionId/export-zip", async (c) => {
    const sessionId = c.req.param("sessionId")?.trim();
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    let sessionDir = "";
    try {
      const messagesPath = await resolveMessagesJsonlPath(sessionId);
      sessionDir = nodePath.dirname(messagesPath);
      const stat = await fsPromises.stat(sessionDir);
      if (!stat.isDirectory()) {
        return c.json({ error: "Session directory not found" }, 404);
      }
    } catch {
      return c.json({ error: "Session directory not found" }, 404);
    }

    const allFiles = await collectDirectoryFiles(sessionDir);
    const sourceBytes = allFiles.reduce((sum, file) => sum + file.size, 0);
    const { files, compactMode } = resolveExportEntries({ allFiles, sourceBytes });
    if (files.length === 0) {
      return c.json({ error: "No exportable files in session directory" }, 404);
    }

    const zipped = await buildZipFromEntries(files);
    const exportMode = compactMode ? "compact" : "full";
    const filename = `${sessionId}-${exportMode}.zip`;
    return c.body(new Uint8Array(zipped) as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-OpenLoaf-Export-Mode": exportMode,
      "X-OpenLoaf-Source-Bytes": String(sourceBytes),
      "Cache-Control": "no-store",
    });
  });

  app.post("/chat/attachments", async (c) => {
    let body: ChatAttachmentBody;
    try {
      body = (await c.req.parseBody()) as ChatAttachmentBody;
    } catch {
      return c.json({ error: "Invalid multipart body" }, 400);
    }

    const result = await controller.upload(body);
    if (result.type === "json") {
      return c.json(result.body, result.status);
    }
    return c.body(result.body, result.status, {
      "Content-Type": result.contentType,
    });
  });

  app.post("/chat/files", async (c) => {
    let body: ChatAttachmentBody;
    try {
      body = (await c.req.parseBody()) as ChatAttachmentBody;
    } catch {
      return c.json({ error: "Invalid multipart body" }, 400);
    }
    const result = await controller.uploadGenericFile(body);
    return c.json(result.body, result.status);
  });

  app.get("/chat/attachments/preview", async (c) => {
    const query = controller.parsePreviewQuery({
      path: c.req.query("path")?.trim(),
      projectId: c.req.query("projectId")?.trim(),
      includeMetadata: c.req.query("includeMetadata")?.trim(),
      maxBytes: c.req.query("maxBytes")?.trim(),
    });
    const result = await controller.preview(query);
    if (result.type === "json") {
      return c.json(result.body, result.status);
    }
    // 逻辑：视频/音频文件支持 Range 请求，浏览器媒体元素需要此功能进行 seeking。
    if (result.contentType.startsWith("video/") || result.contentType.startsWith("audio/")) {
      const total = result.body.byteLength;
      const rangeHeader = c.req.header("range");
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = Number.parseInt(match[1]!, 10);
          const end = match[2] ? Number.parseInt(match[2], 10) : total - 1;
          const clampedEnd = Math.min(end, total - 1);
          const chunk = result.body.slice(start, clampedEnd + 1);
          return c.body(chunk, 206, {
            "Content-Type": result.contentType,
            "Content-Range": `bytes ${start}-${clampedEnd}/${total}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunk.byteLength),
          });
        }
      }
      return c.body(result.body, result.status, {
        "Content-Type": result.contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(total),
      });
    }
    return c.body(result.body, result.status, {
      "Content-Type": result.contentType,
    });
  });
}
