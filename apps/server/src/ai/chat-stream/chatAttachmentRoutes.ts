import type { Hono } from "hono";
import { getWorkspaceByIdConfig } from "@tenas-ai/api/services/workspaceConfig";
import {
  getFilePreview,
  saveChatImageAttachment,
  saveChatImageAttachmentFromPath,
} from "./attachmentResolver";
import { toText } from "@/routers/route-utils";

/** Max upload size for chat images. */
const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
/** Multipart boundary prefix for preview responses. */
const MULTIPART_BOUNDARY_PREFIX = "tenas-preview";

/** Parse a positive integer from a query value. */
function parsePositiveInt(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/** Build multipart/mixed response payload. */
function buildMultipartMixed(input: {
  metadata: string | null | undefined;
  buffer: Buffer;
  mediaType: string;
}): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const boundary = `${MULTIPART_BOUNDARY_PREFIX}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const metadataBody = input.metadata?.trim() ? input.metadata : "null";
  // 逻辑：metadata 放首段，图片放第二段，前端可只解析元信息。
  const header =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=utf-8\r\n\r\n" +
    `${metadataBody}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${input.mediaType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const bodyBuffer = Buffer.concat([
    Buffer.from(header, "utf8"),
    input.buffer,
    Buffer.from(footer, "utf8"),
  ]);
  const arrayBuffer = new ArrayBuffer(bodyBuffer.byteLength);
  const body = new Uint8Array(arrayBuffer);
  body.set(bodyBuffer);
  return {
    body,
    contentType: `multipart/mixed; boundary=${boundary}`,
  };
}

/** Check if value is file-like. */
function isFileLike(value: unknown): value is File {
  return Boolean(value) && typeof value === "object" && "arrayBuffer" in (value as File);
}

type ChatAttachmentBody = {
  workspaceId?: unknown;
  projectId?: unknown;
  sessionId?: unknown;
  file?: unknown;
};

type ParsedChatAttachmentBody = {
  workspaceId: string;
  projectId?: string;
  sessionId: string;
  file: File | string | null;
};

/** Parse and normalize chat attachment body. */
function parseChatAttachmentBody(body: ChatAttachmentBody): ParsedChatAttachmentBody {
  const workspaceId = toText(body.workspaceId);
  const projectId = toText(body.projectId) || undefined;
  const sessionId = toText(body.sessionId);
  const rawFile = body.file;
  const file = Array.isArray(rawFile) ? rawFile[0] : rawFile;
  if (isFileLike(file)) {
    return { workspaceId, projectId, sessionId, file };
  }
  if (typeof file === "string" && file.trim()) {
    return { workspaceId, projectId, sessionId, file: file.trim() };
  }
  return { workspaceId, projectId, sessionId, file: null };
}

/** Register chat attachment routes. */
export function registerChatAttachmentRoutes(app: Hono) {
  app.post("/chat/attachments", async (c) => {
    let body: ChatAttachmentBody;
    try {
      body = (await c.req.parseBody()) as ChatAttachmentBody;
    } catch {
      return c.json({ error: "Invalid multipart body" }, 400);
    }

    const { workspaceId, projectId, sessionId, file } = parseChatAttachmentBody(body);

    if (!workspaceId || !sessionId || !file) {
      return c.json({ error: "Missing required upload fields" }, 400);
    }

    const workspaceExists = Boolean(getWorkspaceByIdConfig(workspaceId));
    if (!workspaceExists) {
      return c.json({ error: "Workspace not found" }, 400);
    }

    try {
      if (isFileLike(file)) {
        const size = typeof file.size === "number" ? file.size : 0;
        if (size > MAX_CHAT_IMAGE_BYTES) {
          return c.json({ error: "Image too large" }, 413);
        }
        // 上传阶段即压缩并落盘，返回相对路径给前端。
        const buffer = Buffer.from(await file.arrayBuffer());
        const mediaType = file.type || "application/octet-stream";
        const result = await saveChatImageAttachment({
          workspaceId,
          projectId,
          sessionId,
          fileName: file.name || "upload",
          mediaType,
          buffer,
        });
        return c.json({ url: result.url, mediaType: result.mediaType });
      }
      // 中文注释：相对路径仍需压缩转码后再落盘。
      const result = await saveChatImageAttachmentFromPath({
        workspaceId,
        projectId,
        sessionId,
        path: file,
      });
      return c.json({ url: result.url, mediaType: result.mediaType });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Upload failed" }, 500);
    }
  });

  app.get("/chat/attachments/preview", async (c) => {
    const path = c.req.query("path")?.trim() ?? "";
    const projectId = c.req.query("projectId")?.trim() || undefined;
    const includeMetadata = c.req.query("includeMetadata") === "1";
    const maxBytes = parsePositiveInt(c.req.query("maxBytes")?.trim());
    if (!path) {
      return c.json({ error: "Invalid preview path" }, 400);
    }
    try {
      const preview = await getFilePreview({ path, projectId, includeMetadata, maxBytes });
      if (!preview) return c.json({ error: "Preview not found" }, 404);
      if (includeMetadata) {
        const multipart = buildMultipartMixed({
          metadata: preview.metadata ?? null,
          buffer: preview.buffer,
          mediaType: preview.mediaType,
        });
        return c.body(multipart.body, 200, {
          "Content-Type": multipart.contentType,
        });
      }
      // Hono 的 body 需要 Uint8Array，避免 Buffer 类型推断问题。
      const arrayBuffer = new ArrayBuffer(preview.buffer.byteLength);
      const body = new Uint8Array(arrayBuffer);
      body.set(preview.buffer);
      return c.body(body, 200, {
        "Content-Type": preview.mediaType,
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Preview failed" }, 500);
    }
  });
}
