/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { Hono } from "hono";
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
    // 逻辑：视频文件支持 Range 请求，浏览器 <video> 元素需要此功能进行 seeking。
    if (result.contentType.startsWith("video/")) {
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
