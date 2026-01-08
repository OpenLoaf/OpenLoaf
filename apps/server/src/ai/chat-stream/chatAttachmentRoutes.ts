import type { Hono } from "hono";
import { getWorkspaceByIdConfig } from "@teatime-ai/api/services/workspaceConfig";
import {
  getTeatimeFilePreview,
  saveChatImageAttachment,
  saveChatImageAttachmentFromTeatimeUrl,
} from "./attachmentResolver";

/** Max upload size for chat images. */
const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;

/** Normalize string input. */
function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
        // 上传阶段即压缩并落盘，返回 teatime-file 地址给前端。
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
      if (!file.startsWith("teatime-file://")) {
        return c.json({ error: "Invalid attachment source" }, 400);
      }
      // 中文注释：teatime-file 仍需压缩转码后再落盘。
      const result = await saveChatImageAttachmentFromTeatimeUrl({
        workspaceId,
        projectId,
        sessionId,
        url: file,
      });
      return c.json({ url: result.url, mediaType: result.mediaType });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Upload failed" }, 500);
    }
  });

  app.get("/chat/attachments/preview", async (c) => {
    const url = c.req.query("url")?.trim() ?? "";
    if (!url || !url.startsWith("teatime-file://")) {
      return c.json({ error: "Invalid preview url" }, 400);
    }
    try {
      const preview = await getTeatimeFilePreview({ url });
      if (!preview) return c.json({ error: "Preview not found" }, 404);
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
