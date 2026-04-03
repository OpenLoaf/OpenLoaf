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
  t,
  shieldedProcedure,
  BaseEmailRouter,
  emailSchemas,
} from "@openloaf/api";
import {
  addEmailAccount,
  addOAuthEmailAccount,
  removeEmailAccount,
} from "@/modules/email/emailAccountService";
import { sendEmail } from "@/modules/email/emailSendService";
import {
  addPrivateSender,
  readEmailConfigFile,
  removePrivateSender,
} from "@/modules/email/emailConfigStore";
import { syncEmailMailboxes } from "@/modules/email/emailMailboxService";
import {
  DEFAULT_INITIAL_SYNC_LIMIT,
  shouldAutoSyncOnAdd,
  syncRecentMailboxMessages,
} from "@/modules/email/emailSyncService";
import {
  hasSeenFlag,
  normalizeEmailFlags,
} from "@/modules/email/emailFlags";
import { getEmailEnvValue } from "@/modules/email/emailEnvStore";
import { createTransport } from "@/modules/email/transport/factory";
import {
  deleteAccountFiles,
} from "@/modules/email/emailFileStore";
import { logger } from "@/common/logger";
import { getErrorMessage } from "@/shared/errorMessages";
import {
  getActiveAccountEmails,
  normalizeStringArray,
  toEmailAccountView,
} from "./emailHelpers";
import { messageProcedures } from "./emailMessageProcedures";
import { unifiedProcedures } from "./emailUnifiedProcedures";
import { draftProcedures } from "./emailDraftProcedures";

class EmailRouterImpl extends BaseEmailRouter {
  /** Define email router implementation. */
  public static createRouter() {
    return t.router({
      ...messageProcedures,
      ...unifiedProcedures,
      ...draftProcedures,

      listAccounts: shieldedProcedure
        .input(emailSchemas.listAccounts.input)
        .output(emailSchemas.listAccounts.output)
        .query(async ({ input }) => {
          const config = readEmailConfigFile();
          return config.emailAccounts.map((account) =>
            toEmailAccountView({
              emailAddress: account.emailAddress,
              label: account.label,
              status: account.status,
            }),
          );
        }),

      addAccount: shieldedProcedure
        .input(emailSchemas.addAccount.input)
        .output(emailSchemas.addAccount.output)
        .mutation(async ({ input, ctx }) => {
          let created: { emailAddress: string; label?: string; status?: { lastSyncAt?: string; lastError?: string | null } };
          if (input.authType === "oauth2-graph" || input.authType === "oauth2-gmail") {
            created = addOAuthEmailAccount({

              emailAddress: input.emailAddress,
              label: input.label,
              authType: input.authType,
            });
          } else {
            const pwInput = input as { emailAddress: string; label?: string; imap: { host: string; port: number; tls: boolean }; smtp: { host: string; port: number; tls: boolean }; password: string };
            created = addEmailAccount({
              emailAddress: pwInput.emailAddress,
              label: pwInput.label,
              imap: pwInput.imap,
              smtp: pwInput.smtp,
              password: pwInput.password,
            });
          }
          if (shouldAutoSyncOnAdd()) {
            // 逻辑：异步触发首次同步，避免阻塞新增流程。
            void syncRecentMailboxMessages({
              prisma: ctx.prisma,

              accountEmail: created.emailAddress,
              mailboxPath: "INBOX",
              limit: DEFAULT_INITIAL_SYNC_LIMIT,
            }).catch((error) => {
              console.warn("email initial sync failed", error);
            });
            void syncEmailMailboxes({
              prisma: ctx.prisma,

              accountEmail: created.emailAddress,
            }).catch((error) => {
              console.warn("email mailbox sync failed", error);
            });
          }
          return toEmailAccountView({
            emailAddress: created.emailAddress,
            label: created.label,
            status: created.status,
          });
        }),

      removeAccount: shieldedProcedure
        .input(emailSchemas.removeAccount.input)
        .output(emailSchemas.removeAccount.output)
        .mutation(async ({ input, ctx }) => {
          removeEmailAccount({

            emailAddress: input.emailAddress,
          });
          const normalizedEmail = input.emailAddress.trim().toLowerCase();
          // 逻辑：清理数据库中该账号的邮件和邮箱文件夹记录。
          await ctx.prisma.emailMessage.deleteMany({
            where: {

              accountEmail: normalizedEmail,
            },
          });
          await ctx.prisma.emailMailbox.deleteMany({
            where: {

              accountEmail: normalizedEmail,
            },
          });
          // 逻辑：清理文件系统中该账号的所有文件。
          void deleteAccountFiles({

            accountEmail: normalizedEmail,
          }).catch((err) => {
            logger.warn({ err }, "email file store account cleanup failed");
          });
          return { ok: true };
        }),

      listMailboxes: shieldedProcedure
        .input(emailSchemas.listMailboxes.input)
        .output(emailSchemas.listMailboxes.output)
        .query(async ({ input, ctx }) => {
          const rows = await ctx.prisma.emailMailbox.findMany({
            where: {

              accountEmail: input.accountEmail,
            },
            orderBy: [{ sort: "asc" }, { path: "asc" }],
          });
          return rows.map((row) => ({
            path: row.path,
            name: row.name,
            parentPath: row.parentPath ?? null,
            delimiter: row.delimiter ?? undefined,
            attributes: normalizeStringArray(row.attributes),
            sort: row.sort ?? undefined,
          }));
        }),

      listMailboxStats: shieldedProcedure
        .input(emailSchemas.listMailboxStats.input)
        .output(emailSchemas.listMailboxStats.output)
        .query(async ({ input, ctx }) => {
          const rows = await ctx.prisma.emailMessage.groupBy({
            by: ["mailboxPath"],
            where: {

              accountEmail: input.accountEmail,
            },
            _count: { _all: true },
          });
          return rows.map((row) => ({
            mailbox: row.mailboxPath,
            count: row._count._all,
          }));
        }),

      listUnreadCount: shieldedProcedure
        .input(emailSchemas.listUnreadCount.input)
        .output(emailSchemas.listUnreadCount.output)
        .query(async ({ input, ctx }) => {
          const activeEmails = getActiveAccountEmails();
          const rows = await ctx.prisma.emailMessage.findMany({
            where: {

              accountEmail: { in: [...activeEmails] },
            },
            select: { flags: true },
          });
          // 逻辑：以 \\Seen 为已读标记，未包含则视为未读。
          const count = rows.reduce((total, row) => {
            const flags = normalizeEmailFlags(row.flags);
            return hasSeenFlag(flags) ? total : total + 1;
          }, 0);
          return { count };
        }),

      listMailboxUnreadStats: shieldedProcedure
        .input(emailSchemas.listMailboxUnreadStats.input)
        .output(emailSchemas.listMailboxUnreadStats.output)
        .query(async ({ input, ctx }) => {
          const activeEmails = getActiveAccountEmails();
          const rows = await ctx.prisma.emailMessage.findMany({
            where: {

              accountEmail: { in: [...activeEmails] },
            },
            select: { accountEmail: true, mailboxPath: true, flags: true },
          });
          const counts = new Map<string, { accountEmail: string; mailboxPath: string; unreadCount: number }>();
          rows.forEach((row) => {
            const flags = normalizeEmailFlags(row.flags);
            if (hasSeenFlag(flags)) return;
            const key = `${row.accountEmail}::${row.mailboxPath}`;
            const current =
              counts.get(key) ?? {
                accountEmail: row.accountEmail,
                mailboxPath: row.mailboxPath,
                unreadCount: 0,
              };
            current.unreadCount += 1;
            counts.set(key, current);
          });
          return Array.from(counts.values());
        }),

      updateMailboxSorts: shieldedProcedure
        .input(emailSchemas.updateMailboxSorts.input)
        .output(emailSchemas.updateMailboxSorts.output)
        .mutation(async ({ input, ctx }) => {
          // 逻辑：仅允许更新同账号下的排序值。
          await ctx.prisma.$transaction(
            input.sorts.map((entry) =>
              ctx.prisma.emailMailbox.update({
                where: {
                  accountEmail_path: {
                    accountEmail: input.accountEmail,
                    path: entry.mailboxPath,
                  },
                },
                data: { sort: entry.sort },
              }),
            ),
          );
          return { ok: true };
        }),

      syncMailbox: shieldedProcedure
        .input(emailSchemas.syncMailbox.input)
        .output(emailSchemas.syncMailbox.output)
        .mutation(async ({ input, ctx }) => {
          logger.info(
            {

              accountEmail: input.accountEmail,
              mailbox: input.mailbox,
              limit: input.limit ?? DEFAULT_INITIAL_SYNC_LIMIT,
            },
            "email sync mailbox request",
          );
          await syncRecentMailboxMessages({
            prisma: ctx.prisma,

            accountEmail: input.accountEmail,
            mailboxPath: input.mailbox,
            limit: input.limit ?? DEFAULT_INITIAL_SYNC_LIMIT,
          });
          logger.info(
            {

              accountEmail: input.accountEmail,
              mailbox: input.mailbox,
            },
            "email sync mailbox completed",
          );
          return { ok: true };
        }),

      syncMailboxes: shieldedProcedure
        .input(emailSchemas.syncMailboxes.input)
        .output(emailSchemas.syncMailboxes.output)
        .mutation(async ({ input, ctx }) => {
          logger.info(
            { accountEmail: input.accountEmail },
            "email sync mailboxes request",
          );
          await syncEmailMailboxes({
            prisma: ctx.prisma,

            accountEmail: input.accountEmail,
          });
          logger.info(
            { accountEmail: input.accountEmail },
            "email sync mailboxes completed",
          );
          return { ok: true };
        }),

      setPrivateSender: shieldedProcedure
        .input(emailSchemas.setPrivateSender.input)
        .output(emailSchemas.setPrivateSender.output)
        .mutation(async ({ input }) => {
          addPrivateSender({ senderEmail: input.senderEmail });
          return { ok: true };
        }),

      removePrivateSender: shieldedProcedure
        .input(emailSchemas.removePrivateSender.input)
        .output(emailSchemas.removePrivateSender.output)
        .mutation(async ({ input }) => {
          removePrivateSender({

            senderEmail: input.senderEmail,
          });
          return { ok: true };
        }),

      sendMessage: shieldedProcedure
        .input(emailSchemas.sendMessage.input)
        .output(emailSchemas.sendMessage.output)
        .mutation(async ({ input }) => {
          const result = await sendEmail({

            accountEmail: input.accountEmail,
            input: {
              to: input.to,
              cc: input.cc,
              bcc: input.bcc,
              subject: input.subject,
              bodyText: input.bodyText,
              bodyHtml: input.bodyHtml,
              inReplyTo: input.inReplyTo,
              references: input.references,
              attachments: input.attachments,
            },
          });
          return { ok: result.ok, messageId: result.messageId };
        }),

      testConnection: shieldedProcedure
        .input(emailSchemas.testConnection.input)
        .output(emailSchemas.testConnection.output)
        .mutation(async ({ input, ctx }) => {
          const config = readEmailConfigFile();
          const account = config.emailAccounts.find(
            (a) =>
              a.emailAddress.trim().toLowerCase() ===
              input.accountEmail.trim().toLowerCase(),
          );
          if (!account) {
            return { ok: false, error: getErrorMessage('ACCOUNT_NOT_FOUND', ctx.lang) };
          }
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
            if (transport.testConnection) {
              return await transport.testConnection();
            }
            // 逻辑：适配器未实现 testConnection 时尝试列出邮箱作为连通性测试。
            await transport.listMailboxes();
            return { ok: true };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: message };
          } finally {
            await transport.dispose();
          }
        }),

      testConnectionPreAdd: shieldedProcedure
        .input(emailSchemas.testConnectionPreAdd.input)
        .output(emailSchemas.testConnectionPreAdd.output)
        .mutation(async ({ input, ctx }) => {
          // 逻辑：使用原始凭据测试 IMAP + SMTP 连接，无需先保存账号。
          const { testSmtpConnection } = await import(
            "@/modules/email/transport/smtpSender"
          );
          const { ImapTransportAdapter } = await import(
            "@/modules/email/transport/imapAdapter"
          );
          const errors: string[] = [];
          // 测试 IMAP
          try {
            const imapAdapter = new ImapTransportAdapter({
              user: input.emailAddress,
              password: input.password,
              host: input.imap.host,
              port: input.imap.port,
              tls: input.imap.tls,
            });
            const imapResult = await imapAdapter.testConnection();
            await imapAdapter.dispose();
            if (!imapResult.ok) {
              errors.push(`IMAP: ${imapResult.error ?? getErrorMessage('CONNECTION_FAILED', ctx.lang)}`);
            }
          } catch (err) {
            errors.push(
              `IMAP: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          // 测试 SMTP
          try {
            const smtpResult = await testSmtpConnection({
              host: input.smtp.host,
              port: input.smtp.port,
              secure: input.smtp.tls,
              user: input.emailAddress,
              password: input.password,
            });
            if (!smtpResult.ok) {
              errors.push(`SMTP: ${smtpResult.error ?? getErrorMessage('CONNECTION_FAILED', ctx.lang)}`);
            }
          } catch (err) {
            errors.push(
              `SMTP: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          if (errors.length > 0) {
            return { ok: false, error: errors.join("; ") };
          }
          return { ok: true };
        }),

      onNewMail: shieldedProcedure
        .input(emailSchemas.onNewMail.input)
        .subscription(async function* ({ input }) {
          const { emailEventBus } = await import(
            "@/modules/email/emailEvents"
          );
          const queue: Array<{
            accountEmail: string;
            mailboxPath: string;
          }> = [];
          let resolve: (() => void) | null = null;
          const cleanup = emailEventBus.onNewMail((event) => {
            queue.push(event);
            resolve?.();
          });
          try {
            while (true) {
              if (queue.length === 0) {
                await new Promise<void>((r) => {
                  resolve = r;
                });
              }
              while (queue.length > 0) {
                yield queue.shift()!;
              }
            }
          } finally {
            cleanup();
          }
        }),
    });
  }
}

export const emailRouterImplementation = EmailRouterImpl.createRouter();
