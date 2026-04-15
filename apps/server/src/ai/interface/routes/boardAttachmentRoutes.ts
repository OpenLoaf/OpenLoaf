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
import { createReadStream } from "node:fs";
import nodePath from "node:path";
import { Readable } from "node:stream";
import { getFilePreview } from "@/ai/services/image/attachmentResolver";
import {
  resolveBoardAbsPath,
  resolveBoardRootPath,
} from "@openloaf/api/common/boardPaths";
import { prisma } from "@openloaf/db";

/** Convert Buffer to Uint8Array for Hono response. */
function toUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const body = new Uint8Array(arrayBuffer);
  body.set(buffer);
  return body;
}

/** Register board attachment preview routes. */
export function registerBoardAttachmentRoutes(app: Hono) {
  app.get("/board/attachments/preview", async (c) => {
    const boardId = c.req.query("boardId")?.trim();
    const file = c.req.query("file")?.trim();
    const projectIdHint = c.req.query("projectId")?.trim();
    const includeMetadata = c.req.query("includeMetadata")?.trim() === "1";
    const maxBytesRaw = c.req.query("maxBytes")?.trim();
    const maxBytes = maxBytesRaw ? Number.parseInt(maxBytesRaw, 10) : undefined;

    if (!boardId || !file) {
      return c.json({ error: "boardId and file are required" }, 400);
    }

    if (file.includes("..")) {
      return c.json({ error: "Invalid file path" }, 400);
    }

    // 从数据库读取画布记录，获取真实的 folderUri 和 projectId
    const board = await prisma.board.findFirst({
      where: { id: boardId },
      select: { folderUri: true, projectId: true },
    });

    if (!board) {
      return c.json({ error: "Board not found" }, 404);
    }

    const projectId = board.projectId ?? projectIdHint;
    const rootPath = resolveBoardRootPath(board);
    // 用 DB 中的 folderUri 拼接，不猜测路径格式
    const absPath = resolveBoardAbsPath(rootPath, board.folderUri, file);
    const relativePath = nodePath.relative(rootPath, absPath);

    try {
      const preview = await getFilePreview({
        path: file,
        projectId,
        includeMetadata,
        maxBytes: maxBytes && Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : undefined,
        resolved: { absPath, rootPath, relativePath },
      });

      if (!preview) {
        return c.json({ error: "Preview not found" }, 404);
      }
      if (preview.kind === "too-large") {
        return c.json({
          error: "Preview too large",
          sizeBytes: preview.sizeBytes,
          maxBytes: preview.maxBytes,
        }, 413);
      }

      if (preview.kind === "file") {
        // PDF / 视频 / 音频 passthrough：走磁盘 stream 而不是 in-memory buffer，
        // 规避 HTTP/2 + 大 Uint8Array 响应触发的 ERR_HTTP2_PROTOCOL_ERROR。
        const total = preview.sizeBytes;
        const isMedia =
          preview.mediaType.startsWith("video/") || preview.mediaType.startsWith("audio/");
        const rangeHeader = c.req.header("range");
        if (isMedia && rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = Number.parseInt(match[1]!, 10);
            const end = match[2] ? Number.parseInt(match[2], 10) : total - 1;
            const clampedEnd = Math.min(end, total - 1);
            const length = clampedEnd - start + 1;
            const nodeStream = createReadStream(preview.filePath, { start, end: clampedEnd });
            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
            return c.body(webStream, 206, {
              "Content-Type": preview.mediaType,
              "Content-Range": `bytes ${start}-${clampedEnd}/${total}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(length),
            });
          }
        }
        const nodeStream = createReadStream(preview.filePath);
        const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
        const headers: Record<string, string> = {
          "Content-Type": preview.mediaType,
          "Content-Length": String(total),
        };
        if (isMedia) headers["Accept-Ranges"] = "bytes";
        return c.body(webStream, 200, headers);
      }

      const body = toUint8Array(preview.buffer);
      return c.body(body, 200, {
        "Content-Type": preview.mediaType,
      });
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : "Preview failed",
      }, 500);
    }
  });
}
