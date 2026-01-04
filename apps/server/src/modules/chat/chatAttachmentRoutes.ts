import type { Hono } from "hono";
import { teatimeConfigStore } from "@/modules/workspace/TeatimeConfigStoreAdapter";
import { getTeatimeFilePreview, saveChatImageAttachment } from "./teatimeFile";

const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isFileLike(value: unknown): value is File {
  return Boolean(value) && typeof value === "object" && "arrayBuffer" in (value as File);
}

export function registerChatAttachmentRoutes(app: Hono) {
  app.post("/chat/attachments", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.parseBody()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid multipart body" }, 400);
    }

    const workspaceId = toText(body.workspaceId);
    const projectId = toText(body.projectId);
    const sessionId = toText(body.sessionId);
    const rawFile = body.file;
    const file = Array.isArray(rawFile) ? rawFile[0] : rawFile;

    if (!workspaceId || !projectId || !sessionId || !isFileLike(file)) {
      return c.json({ error: "Missing required upload fields" }, 400);
    }

    const config = teatimeConfigStore.get();
    const workspaceExists = (config.workspaces ?? []).some((w) => w.id === workspaceId);
    if (!workspaceExists) {
      return c.json({ error: "Workspace not found" }, 400);
    }

    const size = typeof file.size === "number" ? file.size : 0;
    if (size > MAX_CHAT_IMAGE_BYTES) {
      return c.json({ error: "Image too large" }, 413);
    }

    try {
      // 中文注释：上传阶段即压缩并落盘，返回 teatime-file 地址给前端。
      const buffer = Buffer.from(await file.arrayBuffer());
      const mediaType = file.type || "application/octet-stream";
      const result = await saveChatImageAttachment({
        projectId,
        sessionId,
        fileName: file.name || "upload",
        mediaType,
        buffer,
      });
      return c.json({ url: result.url, mediaType: result.mediaType });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Upload failed" },
        500,
      );
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
      // 中文注释：Hono 的 body 需要 Uint8Array，避免 Buffer 类型推断问题。
      const arrayBuffer = new ArrayBuffer(preview.buffer.byteLength);
      const body = new Uint8Array(arrayBuffer);
      body.set(preview.buffer);
      return c.body(body, 200, {
        "Content-Type": preview.mediaType,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Preview failed" },
        500,
      );
    }
  });
}
