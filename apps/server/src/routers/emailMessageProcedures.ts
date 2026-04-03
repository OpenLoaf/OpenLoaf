/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  shieldedProcedure,
  emailSchemas,
} from "@openloaf/api";
import type { PrismaClient } from "@openloaf/db";
import {
  markEmailMessageRead,
  setEmailMessageFlagged,
} from "@/modules/email/emailSyncService";
import {
  ensureDeletedFlag,
  normalizeEmailFlags,
  removeDeletedFlag,
} from "@/modules/email/emailFlags";
import { readEmailConfigFile } from "@/modules/email/emailConfigStore";
import { getEmailEnvValue } from "@/modules/email/emailEnvStore";
import { createTransport } from "@/modules/email/transport/factory";
import {
  moveEmailMessage as moveEmailMessageFile,
  readEmailBodyHtml,
  readEmailBodyHtmlRaw,
  readEmailBodyMd,
  updateEmailFlags,
} from "@/modules/email/emailFileStore";
import { logger } from "@/common/logger";
import { getErrorMessage } from "@/shared/errorMessages";
import {
  buildPrivateSenderSet,
  extractSenderEmail,
  fetchMessageRowsPage,
  findTrashMailboxPath,
  moveMessageToTrash,
  normalizeAddressList,
  normalizeAttachments,
  normalizeStringArray,
  resolveMessagePageSize,
  toMessageSummary,
} from "./emailHelpers";

export const messageProcedures = {
  listMessages: shieldedProcedure
    .input(emailSchemas.listMessages.input)
    .output(emailSchemas.listMessages.output)
    .query(async ({ input, ctx }) => {
      const privateSenders = buildPrivateSenderSet();
      const pageSize = resolveMessagePageSize(input.pageSize);
      const { rows, nextCursor } = await fetchMessageRowsPage({
        prisma: ctx.prisma,
        where: {

          accountEmail: input.accountEmail,
          mailboxPath: input.mailbox,
        },
        pageSize,
        cursor: input.cursor,
      });
      return {
        items: rows.map((row) =>
          toMessageSummary({
            id: row.id,
            accountEmail: row.accountEmail,
            mailboxPath: row.mailboxPath,
            from: row.from,
            subject: row.subject,
            snippet: row.snippet,
            date: row.date,
            flags: row.flags,
            attachments: row.attachments,
            privateSenders,
          }),
        ),
        nextCursor,
      };
    }),

  getMessage: shieldedProcedure
    .input(emailSchemas.getMessage.input)
    .output(emailSchemas.getMessage.output)
    .query(async ({ input, ctx }) => {
      const row = await ctx.prisma.emailMessage.findFirst({
        where: { id: input.id },
      });
      if (!row) {
        throw new Error(getErrorMessage('EMAIL_NOT_FOUND', ctx.lang));
      }
      const privateSenders = buildPrivateSenderSet();
      const fromAddress = extractSenderEmail(row.from ?? "");
      const isPrivate = fromAddress ? privateSenders.has(fromAddress) : false;
      // 逻辑：从文件系统读取正文内容。
      const [bodyHtml, bodyHtmlRaw, bodyText] = await Promise.all([
        readEmailBodyHtml({

          accountEmail: row.accountEmail,
          mailboxPath: row.mailboxPath,
          externalId: row.externalId,
        }),
        readEmailBodyHtmlRaw({

          accountEmail: row.accountEmail,
          mailboxPath: row.mailboxPath,
          externalId: row.externalId,
        }),
        readEmailBodyMd({

          accountEmail: row.accountEmail,
          mailboxPath: row.mailboxPath,
          externalId: row.externalId,
        }),
      ]);
      return {
        id: row.id,
        accountEmail: row.accountEmail,
        mailbox: row.mailboxPath,
        subject: row.subject ?? undefined,
        from: normalizeAddressList(row.from),
        to: normalizeAddressList(row.to),
        cc: normalizeAddressList(row.cc),
        bcc: normalizeAddressList(row.bcc),
        date: row.date ? row.date.toISOString() : undefined,
        bodyHtml: bodyHtml ?? undefined,
        bodyHtmlRaw: bodyHtmlRaw ?? undefined,
        bodyText: bodyText ?? undefined,
        attachments: normalizeAttachments(row.attachments),
        flags: normalizeStringArray(row.flags),
        fromAddress: fromAddress ?? undefined,
        isPrivate,
      };
    }),

  markMessageRead: shieldedProcedure
    .input(emailSchemas.markMessageRead.input)
    .output(emailSchemas.markMessageRead.output)
    .mutation(async ({ input, ctx }) => {
      await markEmailMessageRead({
        prisma: ctx.prisma,

        id: input.id,
      });
      return { ok: true };
    }),

  setMessageFlagged: shieldedProcedure
    .input(emailSchemas.setMessageFlagged.input)
    .output(emailSchemas.setMessageFlagged.output)
    .mutation(async ({ input, ctx }) => {
      await setEmailMessageFlagged({
        prisma: ctx.prisma,

        id: input.id,
        flagged: input.flagged,
      });
      return { ok: true };
    }),

  deleteMessage: shieldedProcedure
    .input(emailSchemas.deleteMessage.input)
    .output(emailSchemas.deleteMessage.output)
    .mutation(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      const row = await prisma.emailMessage.findUnique({
        where: { id: input.id },
      });
      if (!row) throw new Error(getErrorMessage('EMAIL_NOT_FOUND', ctx.lang));
      // 逻辑：软删除 — 添加 \\Deleted 标记 + 移动到 Trash 邮箱。
      const existingFlags = normalizeEmailFlags(row.flags);
      const newFlags = ensureDeletedFlag(existingFlags);
      await prisma.emailMessage.update({
        where: { id: input.id },
        data: { flags: newFlags },
      });
      void updateEmailFlags({

        accountEmail: row.accountEmail,
        mailboxPath: row.mailboxPath,
        externalId: row.externalId,
        flags: newFlags,
      }).catch((err) => {
        logger.warn({ err, id: input.id }, "email file store soft delete failed");
      });
      // 逻辑：移动到 Trash 邮箱，使账号级"已删除"视图可见。
      const trashPath = await findTrashMailboxPath(
        prisma,
        row.accountEmail,
      );
      if (trashPath) {
        try {
          await moveMessageToTrash({
            prisma,

            row: {
              id: row.id,
              accountEmail: row.accountEmail,
              mailboxPath: row.mailboxPath,
              externalId: row.externalId,
            },
            trashPath,
          });
        } catch (err) {
          logger.warn({ err, id: input.id }, "move to trash failed");
        }
      }
      return { ok: true };
    }),

  restoreMessage: shieldedProcedure
    .input(emailSchemas.restoreMessage.input)
    .output(emailSchemas.restoreMessage.output)
    .mutation(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      const row = await prisma.emailMessage.findUnique({
        where: { id: input.id },
      });
      if (!row) throw new Error(getErrorMessage('EMAIL_NOT_FOUND', ctx.lang));
      // 逻辑：恢复 — 移除 \\Deleted 标记。
      const existingFlags = normalizeEmailFlags(row.flags);
      const newFlags = removeDeletedFlag(existingFlags);
      await prisma.emailMessage.update({
        where: { id: input.id },
        data: { flags: newFlags },
      });
      void updateEmailFlags({

        accountEmail: row.accountEmail,
        mailboxPath: row.mailboxPath,
        externalId: row.externalId,
        flags: newFlags,
      }).catch((err) => {
        logger.warn({ err, id: input.id }, "email file store restore failed");
      });
      return { ok: true };
    }),

  moveMessage: shieldedProcedure
    .input(emailSchemas.moveMessage.input)
    .output(emailSchemas.moveMessage.output)
    .mutation(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      const row = await prisma.emailMessage.findUnique({
        where: { id: input.id },
      });
      if (!row) throw new Error(getErrorMessage('EMAIL_NOT_FOUND', ctx.lang));
      const config = readEmailConfigFile();
      const account = config.emailAccounts.find(
        (a) =>
          a.emailAddress.trim().toLowerCase() ===
          row.accountEmail.trim().toLowerCase(),
      );
      if (!account) throw new Error(getErrorMessage('ACCOUNT_NOT_FOUND', ctx.lang));
      const transport = createTransport(
        {
          emailAddress: account.emailAddress,
          auth: account.auth,
          imap: account.imap,
          smtp: account.smtp,
        },
        {

          password: account.auth.type === "password"
            ? getEmailEnvValue(account.auth.envKey)
            : undefined,
        },
      );
      try {
        if (!transport.moveMessage) {
          throw new Error(getErrorMessage('ADAPTER_DOES_NOT_SUPPORT_MOVE', ctx.lang));
        }
        await transport.moveMessage(row.mailboxPath, input.toMailbox, row.externalId);
        await prisma.emailMessage.update({
          where: { id: input.id },
          data: { mailboxPath: input.toMailbox },
        });
        // 逻辑：双写文件系统移动。
        void moveEmailMessageFile({

          accountEmail: row.accountEmail,
          fromMailboxPath: row.mailboxPath,
          toMailboxPath: input.toMailbox,
          externalId: row.externalId,
        }).catch((err) => {
          logger.warn({ err, id: input.id }, "email file store move failed");
        });
        return { ok: true };
      } finally {
        await transport.dispose();
      }
    }),

  batchMarkRead: shieldedProcedure
    .input(emailSchemas.batchMarkRead.input)
    .output(emailSchemas.batchMarkRead.output)
    .mutation(async ({ input, ctx }) => {
      for (const id of input.ids) {
        await markEmailMessageRead({
          prisma: ctx.prisma as PrismaClient,

          id,
        });
      }
      return { ok: true };
    }),

  batchDelete: shieldedProcedure
    .input(emailSchemas.batchDelete.input)
    .output(emailSchemas.batchDelete.output)
    .mutation(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      // 逻辑：批量软删除 — 添加 \\Deleted 标记 + 移动到 Trash。
      // 逻辑：按账号分组查找 Trash 路径，避免重复查询。
      const trashPathCache = new Map<string, string | null>();
      for (const id of input.ids) {
        const row = await prisma.emailMessage.findUnique({ where: { id } });
        if (!row) continue;
        const existingFlags = normalizeEmailFlags(row.flags);
        const newFlags = ensureDeletedFlag(existingFlags);
        await prisma.emailMessage.update({
          where: { id },
          data: { flags: newFlags },
        });
        void updateEmailFlags({

          accountEmail: row.accountEmail,
          mailboxPath: row.mailboxPath,
          externalId: row.externalId,
          flags: newFlags,
        }).catch((err) => {
          logger.warn({ err, id }, "email file store batch soft delete failed");
        });
        // 逻辑：移动到 Trash 邮箱。
        const cacheKey = row.accountEmail.trim().toLowerCase();
        if (!trashPathCache.has(cacheKey)) {
          trashPathCache.set(
            cacheKey,
            await findTrashMailboxPath(prisma, row.accountEmail),
          );
        }
        const trashPath = trashPathCache.get(cacheKey);
        if (trashPath) {
          try {
            await moveMessageToTrash({
              prisma,

              row: {
                id: row.id,
                accountEmail: row.accountEmail,
                mailboxPath: row.mailboxPath,
                externalId: row.externalId,
              },
              trashPath,
            });
          } catch (err) {
            logger.warn({ err, id }, "batch move to trash failed");
          }
        }
      }
      return { ok: true };
    }),

  batchMove: shieldedProcedure
    .input(emailSchemas.batchMove.input)
    .output(emailSchemas.batchMove.output)
    .mutation(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      for (const id of input.ids) {
        const row = await prisma.emailMessage.findUnique({ where: { id } });
        if (!row) continue;
        const config = readEmailConfigFile();
        const account = config.emailAccounts.find(
          (a) => a.emailAddress.trim().toLowerCase() === row.accountEmail.trim().toLowerCase(),
        );
        if (!account) continue;
        const transport = createTransport(
          { emailAddress: account.emailAddress, auth: account.auth, imap: account.imap, smtp: account.smtp },
          { password: account.auth.type === "password" ? getEmailEnvValue(account.auth.envKey) : undefined },
        );
        try {
          if (transport.moveMessage) {
            await transport.moveMessage(row.mailboxPath, input.toMailbox, row.externalId);
          }
          await prisma.emailMessage.update({
            where: { id },
            data: { mailboxPath: input.toMailbox },
          });
          // 逻辑：双写文件系统移动。
          void moveEmailMessageFile({

            accountEmail: row.accountEmail,
            fromMailboxPath: row.mailboxPath,
            toMailboxPath: input.toMailbox,
            externalId: row.externalId,
          }).catch((err) => {
            logger.warn({ err, id }, "email file store batch move failed");
          });
        } finally {
          await transport.dispose();
        }
      }
      return { ok: true };
    }),

  searchMessages: shieldedProcedure
    .input(emailSchemas.searchMessages.input)
    .output(emailSchemas.searchMessages.output)
    .query(async ({ input, ctx }) => {
      const prisma = ctx.prisma as PrismaClient;
      const pageSize = resolveMessagePageSize(input.pageSize);
      const privateSenders = buildPrivateSenderSet();
      // 逻辑：服务端搜索先查本地数据库（subject/snippet 模糊匹配）。
      const { rows, nextCursor } = await fetchMessageRowsPage({
        prisma,
        where: {

          accountEmail: input.accountEmail,
          OR: [
            { subject: { contains: input.query } },
            { snippet: { contains: input.query } },
          ],
        },
        pageSize,
        cursor: input.cursor,
      });
      return {
        items: rows.map((row) =>
          toMessageSummary({
            id: row.id,
            accountEmail: row.accountEmail,
            mailboxPath: row.mailboxPath,
            from: row.from,
            subject: row.subject,
            snippet: row.snippet,
            date: row.date,
            flags: row.flags,
            attachments: row.attachments,
            privateSenders,
          }),
        ),
        nextCursor,
      };
    }),
};
