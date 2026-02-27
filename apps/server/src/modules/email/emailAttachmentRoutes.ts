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

import { readEmailConfigFile } from "./emailConfigStore";
import { getEmailEnvValue } from "./emailEnvStore";
import { createTransport } from "./transport/factory";
import { cacheAttachment, readCachedAttachment } from "./emailFileStore";
import { logger } from "@/common/logger";

/** Register email attachment download HTTP endpoint. */
export function registerEmailAttachmentRoutes(app: Hono) {
  app.get("/api/email/attachment", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    const messageId = c.req.query("messageId");
    const indexStr = c.req.query("index");

    if (!workspaceId || !messageId || indexStr === undefined) {
      return c.text("缺少参数。", 400);
    }

    const attachmentIndex = parseInt(indexStr, 10);
    if (Number.isNaN(attachmentIndex) || attachmentIndex < 0) {
      return c.text("无效的附件索引。", 400);
    }

    try {
      // 逻辑：从数据库查找邮件以获取账号和邮箱路径信息。
      const { prisma } = await import("@openloaf/db");
      const row = await (prisma as any).emailMessage.findUnique({
        where: { id: messageId },
      });
      if (!row) {
        return c.text("邮件未找到。", 404);
      }

      // 逻辑：先检查本地缓存，命中则直接返回。
      const attachments = Array.isArray(row.attachments) ? row.attachments : [];
      const attachMeta = attachments[attachmentIndex] as { filename?: string; contentType?: string } | undefined;
      if (attachMeta?.filename) {
        const cached = await readCachedAttachment({
          workspaceId,
          accountEmail: row.accountEmail,
          mailboxPath: row.mailboxPath,
          externalId: row.externalId,
          filename: attachMeta.filename,
        });
        if (cached) {
          const encodedFilename = encodeURIComponent(attachMeta.filename);
          c.header("Content-Type", cached.contentType);
          c.header(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodedFilename}`,
          );
          return c.body(new Uint8Array(cached.content));
        }
      }

      const config = readEmailConfigFile(workspaceId);
      const account = config.emailAccounts.find(
        (a) =>
          a.emailAddress.trim().toLowerCase() ===
          row.accountEmail.trim().toLowerCase(),
      );
      if (!account) {
        return c.text("账号未找到。", 404);
      }

      const transport = createTransport(
        {
          emailAddress: account.emailAddress,
          auth: account.auth,
          imap: account.imap,
          smtp: account.smtp,
        },
        {
          workspaceId,
          password:
            account.auth.type === "password"
              ? getEmailEnvValue(account.auth.envKey)
              : undefined,
        },
      );

      try {
        if (!transport.downloadAttachment) {
          return c.text("当前适配器不支持下载附件。", 501);
        }
        const result = await transport.downloadAttachment(
          row.mailboxPath,
          row.externalId,
          attachmentIndex,
        );

        // 逻辑：下载后缓存到本地文件系统。
        void cacheAttachment({
          workspaceId,
          accountEmail: row.accountEmail,
          mailboxPath: row.mailboxPath,
          externalId: row.externalId,
          filename: result.filename,
          content: Buffer.from(result.content),
          contentType: result.contentType,
        }).catch((err) => {
          logger.warn({ err, messageId, attachmentIndex }, "attachment cache failed");
        });

        const encodedFilename = encodeURIComponent(result.filename);
        c.header("Content-Type", result.contentType);
        c.header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodedFilename}`,
        );
        return c.body(new Uint8Array(result.content));
      } finally {
        await transport.dispose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, messageId, attachmentIndex }, "attachment download failed");
      return c.text(message, 500);
    }
  });
}
