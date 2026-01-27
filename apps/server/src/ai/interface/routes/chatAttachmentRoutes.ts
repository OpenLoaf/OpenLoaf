import type { Hono } from "hono";
import {
  ChatAttachmentController,
  type ChatAttachmentBody,
} from "@/ai/interface/controllers/ChatAttachmentController";

const controller = new ChatAttachmentController();

/** Register chat attachment routes. */
export function registerChatAttachmentRoutes(app: Hono) {
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

  app.get("/chat/attachments/preview", async (c) => {
    const query = controller.parsePreviewQuery({
      path: c.req.query("path")?.trim(),
      projectId: c.req.query("projectId")?.trim(),
      workspaceId: c.req.query("workspaceId")?.trim(),
      includeMetadata: c.req.query("includeMetadata")?.trim(),
      maxBytes: c.req.query("maxBytes")?.trim(),
    });
    const result = await controller.preview(query);
    if (result.type === "json") {
      return c.json(result.body, result.status);
    }
    return c.body(result.body, result.status, {
      "Content-Type": result.contentType,
    });
  });
}
