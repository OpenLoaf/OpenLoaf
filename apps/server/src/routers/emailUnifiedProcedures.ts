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
import {
  hasDeletedFlag,
  hasFlag,
  hasSeenFlag,
  normalizeEmailFlags,
} from "@/modules/email/emailFlags";
import {
  buildPrivateSenderSet,
  encodeMessageCursor,
  fetchMessageRowsPage,
  getActiveAccountEmails,
  isDraftsMailbox,
  isInboxMailbox,
  isSentMailbox,
  resolveMessagePageSize,
  toMessageSummary,
} from "./emailHelpers";

export const unifiedProcedures = {
  listUnifiedMessages: shieldedProcedure
    .input(emailSchemas.listUnifiedMessages.input)
    .output(emailSchemas.listUnifiedMessages.output)
    .query(async ({ input, ctx }) => {
      const scope = input.scope;
      const pageSize = resolveMessagePageSize(input.pageSize);
      const privateSenders = buildPrivateSenderSet();
      if (scope === "mailbox") {
        if (!input.accountEmail || !input.mailbox) {
          throw new Error("Mailbox scope requires accountEmail and mailbox.");
        }
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
      }

      const activeEmails = getActiveAccountEmails();

      const mailboxes = await ctx.prisma.emailMailbox.findMany({
        where: {

          accountEmail: { in: [...activeEmails] },
        },
        select: { accountEmail: true, path: true, attributes: true },
      });

      if (scope === "flagged") {
        const targetCount = pageSize + 1;
        const collected: Array<{
          id: string;
          accountEmail: string;
          mailboxPath: string;
          from: unknown;
          subject: string | null;
          snippet: string | null;
          date: Date | null;
          flags: unknown;
          attachments?: unknown;
          createdAt: Date;
        }> = [];
        let cursor = input.cursor ?? null;
        let iterations = 0;
        const batchSize = Math.min(pageSize * 4, 200);
        while (collected.length < targetCount && iterations < 8) {
          const { rows, nextCursor, hasMore } = await fetchMessageRowsPage({
            prisma: ctx.prisma,
            where: {

              accountEmail: { in: [...activeEmails] },
            },
            pageSize: batchSize,
            cursor,
          });
          if (!rows.length) {
            cursor = null;
            break;
          }
          const flagged = rows.filter((row) =>
            hasFlag(normalizeEmailFlags(row.flags), "FLAGGED"),
          );
          collected.push(...flagged);
          cursor = nextCursor;
          if (!hasMore) break;
          iterations += 1;
        }
        const hasMore = collected.length > pageSize;
        const pageRows = hasMore ? collected.slice(0, pageSize) : collected;
        const nextCursor = hasMore
          ? encodeMessageCursor(pageRows[pageRows.length - 1]!)
          : null;
        return {
          items: pageRows.map((row) =>
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
      }

      // 逻辑："已删除"虚拟文件夹 — 跨邮箱过滤 \\Deleted 标记的邮件。
      if (scope === "deleted") {
        const targetCount = pageSize + 1;
        const collected: Array<{
          id: string;
          accountEmail: string;
          mailboxPath: string;
          from: unknown;
          subject: string | null;
          snippet: string | null;
          date: Date | null;
          flags: unknown;
          attachments?: unknown;
          createdAt: Date;
        }> = [];
        let cursor = input.cursor ?? null;
        let iterations = 0;
        const batchSize = Math.min(pageSize * 4, 200);
        while (collected.length < targetCount && iterations < 8) {
          const { rows, nextCursor, hasMore } = await fetchMessageRowsPage({
            prisma: ctx.prisma,
            where: {

              accountEmail: { in: [...activeEmails] },
            },
            pageSize: batchSize,
            cursor,
          });
          if (!rows.length) {
            cursor = null;
            break;
          }
          const deleted = rows.filter((row) =>
            hasDeletedFlag(normalizeEmailFlags(row.flags)),
          );
          collected.push(...deleted);
          cursor = nextCursor;
          if (!hasMore) break;
          iterations += 1;
        }
        const hasMore = collected.length > pageSize;
        const pageRows = hasMore ? collected.slice(0, pageSize) : collected;
        const nextCursor = hasMore
          ? encodeMessageCursor(pageRows[pageRows.length - 1]!)
          : null;
        return {
          items: pageRows.map((row) =>
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
      }

      const mailboxTargets = mailboxes
        .filter((mailbox) => {
          if (scope === "all-inboxes") return isInboxMailbox(mailbox);
          if (scope === "drafts") return isDraftsMailbox(mailbox);
          if (scope === "sent") return isSentMailbox(mailbox);
          return false;
        })
        .map((mailbox) => ({
          accountEmail: mailbox.accountEmail,
          mailboxPath: mailbox.path,
        }));

      if (!mailboxTargets.length) {
        return { items: [], nextCursor: null };
      }

      const { rows, nextCursor } = await fetchMessageRowsPage({
        prisma: ctx.prisma,
        where: {

          OR: mailboxTargets.map((item) => ({
            accountEmail: item.accountEmail,
            mailboxPath: item.mailboxPath,
          })),
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

  listUnifiedUnreadStats: shieldedProcedure
    .input(emailSchemas.listUnifiedUnreadStats.input)
    .output(emailSchemas.listUnifiedUnreadStats.output)
    .query(async ({ input, ctx }) => {
      const activeEmails = getActiveAccountEmails();
      const mailboxes = await ctx.prisma.emailMailbox.findMany({
        where: {

          accountEmail: { in: [...activeEmails] },
        },
        select: { accountEmail: true, path: true, attributes: true },
      });

      const inboxTargets = mailboxes
        .filter((mailbox) => isInboxMailbox(mailbox))
        .map((mailbox) => ({
          accountEmail: mailbox.accountEmail,
          mailboxPath: mailbox.path,
        }));
      const draftTargets = mailboxes
        .filter((mailbox) => isDraftsMailbox(mailbox))
        .map((mailbox) => ({
          accountEmail: mailbox.accountEmail,
          mailboxPath: mailbox.path,
        }));
      const sentTargets = mailboxes
        .filter((mailbox) => isSentMailbox(mailbox))
        .map((mailbox) => ({
          accountEmail: mailbox.accountEmail,
          mailboxPath: mailbox.path,
        }));

      /** Count unread messages in target mailboxes. */
      const countUnreadByTargets = async (
        targets: Array<{ accountEmail: string; mailboxPath: string }>,
      ) => {
        if (!targets.length) return 0;
        const rows = await ctx.prisma.emailMessage.findMany({
          where: {

            OR: targets.map((item) => ({
              accountEmail: item.accountEmail,
              mailboxPath: item.mailboxPath,
            })),
          },
          select: { flags: true },
        });
        // 逻辑：排除已读标记后统计未读数量。
        return rows.reduce((total, row) => {
          const flags = normalizeEmailFlags(row.flags);
          return hasSeenFlag(flags) ? total : total + 1;
        }, 0);
      };

      const [allInboxes, drafts, sent] = await Promise.all([
        countUnreadByTargets(inboxTargets),
        countUnreadByTargets(draftTargets),
        countUnreadByTargets(sentTargets),
      ]);

      const flaggedRows = await ctx.prisma.emailMessage.findMany({
        where: {

          accountEmail: { in: [...activeEmails] },
        },
        select: { flags: true },
      });
      const flagged = flaggedRows.reduce((total, row) => {
        const flags = normalizeEmailFlags(row.flags);
        if (!hasFlag(flags, "FLAGGED")) return total;
        return hasSeenFlag(flags) ? total : total + 1;
      }, 0);

      return { allInboxes, flagged, drafts, sent };
    }),
};
