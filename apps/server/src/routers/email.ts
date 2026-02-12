import {
  t,
  shieldedProcedure,
  BaseEmailRouter,
  emailSchemas,
} from "@tenas-ai/api";
import type { PrismaClient } from "@tenas-ai/db";
import {
  addEmailAccount,
  addOAuthEmailAccount,
  removeEmailAccount,
} from "@/modules/email/emailAccountService";
import { sendEmail } from "@/modules/email/emailSendService";
import {
  addPrivateSender,
  listPrivateSenders,
  readEmailConfigFile,
  removePrivateSender,
} from "@/modules/email/emailConfigStore";
import { syncEmailMailboxes } from "@/modules/email/emailMailboxService";
import {
  DEFAULT_INITIAL_SYNC_LIMIT,
  markEmailMessageRead,
  setEmailMessageFlagged,
  shouldAutoSyncOnAdd,
  syncRecentMailboxMessages,
} from "@/modules/email/emailSyncService";
import { hasFlag, hasSeenFlag, normalizeEmailFlags } from "@/modules/email/emailFlags";
import { getEmailEnvValue } from "@/modules/email/emailEnvStore";
import { createTransport } from "@/modules/email/transport/factory";
import { logger } from "@/common/logger";

type EmailAccountView = {
  emailAddress: string;
  label?: string;
  status: {
    lastSyncAt?: string;
    lastError?: string | null;
  };
};

/** Build account view payload for UI. */
function toEmailAccountView(input: {
  emailAddress: string;
  label?: string;
  status?: { lastSyncAt?: string; lastError?: string | null };
}): EmailAccountView {
  return {
    emailAddress: input.emailAddress,
    label: input.label,
    status: {
      lastSyncAt: input.status?.lastSyncAt,
      lastError: input.status?.lastError ?? null,
    },
  };
}

/** Normalize single address entry to display label. */
function formatAddressEntry(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null;
  const address =
    typeof (entry as any).address === "string" ? (entry as any).address.trim() : "";
  const name =
    typeof (entry as any).name === "string" ? (entry as any).name.trim() : "";
  if (name && address) return `${name} <${address}>`;
  if (address) return address;
  if (name) return name;
  return null;
}

/** Normalize address list payload into display strings. */
function normalizeAddressList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        return formatAddressEntry(item);
      })
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === "object") {
    const record = value as any;
    if (Array.isArray(record.value)) {
      return record.value
        .map((item: unknown) => formatAddressEntry(item))
        .filter((item: string | null): item is string => Boolean(item));
    }
    if (typeof record.text === "string") {
      const trimmed = record.text.trim();
      return trimmed ? [trimmed] : [];
    }
  }
  return [];
}

/** Extract sender email address from payload. */
function extractSenderEmail(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/<([^>]+)>/);
    if (match?.[1]) return match[1].trim().toLowerCase();
    const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return emailMatch?.[0]?.trim().toLowerCase() ?? null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        const found = extractSenderEmail(item);
        if (found) return found;
      } else if (item && typeof item === "object") {
        const address =
          typeof (item as any).address === "string" ? (item as any).address.trim() : "";
        if (address) return address.toLowerCase();
      }
    }
  }
  if (typeof value === "object") {
    const record = value as any;
    if (Array.isArray(record.value)) {
      for (const entry of record.value) {
        if (entry && typeof entry === "object") {
          const address =
            typeof entry.address === "string" ? entry.address.trim() : "";
          if (address) return address.toLowerCase();
        }
      }
    }
    if (typeof record.text === "string") {
      return extractSenderEmail(record.text);
    }
  }
  return null;
}

/** Build private sender set for workspace. */
function buildPrivateSenderSet(workspaceId: string): Set<string> {
  const senders = listPrivateSenders(workspaceId);
  return new Set(senders);
}

/** Normalize string array values. */
function normalizeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : null))
      .filter((item): item is string => Boolean(item));
  }
  return [];
}

/** Normalize mailbox attributes. */
function normalizeMailboxAttributes(value: unknown): string[] {
  // 逻辑：兼容 JSON 数组、字符串序列化与空值场景。
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim().toUpperCase())
          .filter(Boolean);
      }
    } catch {
      // 逻辑：忽略 JSON 解析失败，按普通字符串处理。
    }
    return [trimmed.toUpperCase()];
  }
  return [];
}

/** Check if mailbox is inbox. */
function isInboxMailbox(input: { path: string; attributes: unknown }): boolean {
  const attributes = normalizeMailboxAttributes(input.attributes);
  return attributes.includes("\\INBOX") || input.path.toUpperCase() === "INBOX";
}

/** Check if mailbox is drafts. */
function isDraftsMailbox(input: { path: string; attributes: unknown }): boolean {
  const attributes = normalizeMailboxAttributes(input.attributes);
  const path = input.path.toLowerCase();
  return attributes.includes("\\DRAFTS") || path.includes("draft");
}

/** Check if mailbox is sent. */
function isSentMailbox(input: { path: string; attributes: unknown }): boolean {
  const attributes = normalizeMailboxAttributes(input.attributes);
  const path = input.path.toLowerCase();
  return attributes.includes("\\SENT") || path.includes("sent");
}

/** Build message summary payload. */
function toMessageSummary(input: {
  id: string;
  accountEmail: string;
  mailboxPath: string;
  from: unknown;
  subject: string | null;
  snippet: string | null;
  date: Date | null;
  flags: unknown;
  attachments?: unknown;
  privateSenders?: Set<string>;
}) {
  const fromList = normalizeAddressList(input.from);
  const flags = normalizeEmailFlags(input.flags);
  const seen = hasSeenFlag(flags);
  const attachmentCount = normalizeAttachments(input.attachments).length;
  const senderEmail = extractSenderEmail(input.from);
  const isPrivate =
    senderEmail && input.privateSenders ? input.privateSenders.has(senderEmail) : false;
  return {
    id: input.id,
    accountEmail: input.accountEmail,
    mailbox: input.mailboxPath,
    from: fromList[0] ?? "",
    subject: input.subject ?? "",
    preview: input.snippet ?? "",
    time: input.date ? input.date.toISOString() : undefined,
    unread: !seen,
    hasAttachments: attachmentCount > 0,
    isPrivate,
  };
}

/** Encode cursor for message pagination. */
function encodeMessageCursor(input: { createdAt: Date; id: string }): string {
  return `${input.createdAt.toISOString()}::${input.id}`;
}

/** Decode cursor for message pagination. */
function decodeMessageCursor(cursor?: string | null): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [rawTime, id] = cursor.split("::");
  if (!rawTime || !id) return null;
  const createdAt = new Date(rawTime);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

/** Resolve message page size. */
function resolveMessagePageSize(input?: number | null): number {
  const fallback = 20;
  if (!input) return fallback;
  return Math.min(Math.max(input, 1), 200);
}

/** Fetch message rows with cursor pagination. */
async function fetchMessageRowsPage(input: {
  prisma: PrismaClient;
  where: Record<string, unknown>;
  pageSize: number;
  cursor?: string | null;
}) {
  const cursor = decodeMessageCursor(input.cursor);
  const where = cursor
    ? {
        ...input.where,
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : input.where;
  const rows = await input.prisma.emailMessage.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.pageSize + 1,
  });
  const hasMore = rows.length > input.pageSize;
  const items = hasMore ? rows.slice(0, input.pageSize) : rows;
  const nextCursor = hasMore ? encodeMessageCursor(items[items.length - 1]!) : null;
  return { rows: items, nextCursor, hasMore };
}

/** Normalize attachment metadata list. */
type AttachmentMeta = {
  filename?: string;
  contentType?: string;
  size?: number;
};

function normalizeAttachments(value: unknown): AttachmentMeta[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const filename =
        typeof (item as any).filename === "string" ? (item as any).filename : undefined;
      const contentType =
        typeof (item as any).contentType === "string"
          ? (item as any).contentType
          : undefined;
      const size =
        typeof (item as any).size === "number" && Number.isFinite((item as any).size)
          ? (item as any).size
          : undefined;
      const next: AttachmentMeta = { filename, contentType, size };
      return next;
    })
    .filter((item): item is AttachmentMeta => item !== null);
}

export class EmailRouterImpl extends BaseEmailRouter {
  /** Define email router implementation. */
  public static createRouter() {
    /** Get active account emails from config for defensive filtering. */
    function getActiveAccountEmails(workspaceId: string): Set<string> {
      const config = readEmailConfigFile(workspaceId);
      return new Set(
        config.emailAccounts.map((a) => a.emailAddress.trim().toLowerCase()),
      );
    }

    return t.router({
      listAccounts: shieldedProcedure
        .input(emailSchemas.listAccounts.input)
        .output(emailSchemas.listAccounts.output)
        .query(async ({ input }) => {
          const config = readEmailConfigFile(input.workspaceId);
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
              workspaceId: input.workspaceId,
              emailAddress: input.emailAddress,
              label: input.label,
              authType: input.authType,
            });
          } else {
            const pwInput = input as { workspaceId: string; emailAddress: string; label?: string; imap: { host: string; port: number; tls: boolean }; smtp: { host: string; port: number; tls: boolean }; password: string };
            created = addEmailAccount({
              workspaceId: pwInput.workspaceId,
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
              workspaceId: input.workspaceId,
              accountEmail: created.emailAddress,
              mailboxPath: "INBOX",
              limit: DEFAULT_INITIAL_SYNC_LIMIT,
            }).catch((error) => {
              console.warn("email initial sync failed", error);
            });
            void syncEmailMailboxes({
              prisma: ctx.prisma,
              workspaceId: input.workspaceId,
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
            workspaceId: input.workspaceId,
            emailAddress: input.emailAddress,
          });
          const normalizedEmail = input.emailAddress.trim().toLowerCase();
          // 逻辑：清理数据库中该账号的邮件和邮箱文件夹记录。
          await ctx.prisma.emailMessage.deleteMany({
            where: {
              workspaceId: input.workspaceId,
              accountEmail: normalizedEmail,
            },
          });
          await ctx.prisma.emailMailbox.deleteMany({
            where: {
              workspaceId: input.workspaceId,
              accountEmail: normalizedEmail,
            },
          });
          return { ok: true };
        }),

      listMessages: shieldedProcedure
        .input(emailSchemas.listMessages.input)
        .output(emailSchemas.listMessages.output)
        .query(async ({ input, ctx }) => {
          const privateSenders = buildPrivateSenderSet(input.workspaceId);
          const pageSize = resolveMessagePageSize(input.pageSize);
          const { rows, nextCursor } = await fetchMessageRowsPage({
            prisma: ctx.prisma,
            where: {
              workspaceId: input.workspaceId,
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

      listMailboxes: shieldedProcedure
        .input(emailSchemas.listMailboxes.input)
        .output(emailSchemas.listMailboxes.output)
        .query(async ({ input, ctx }) => {
          const rows = await ctx.prisma.emailMailbox.findMany({
            where: {
              workspaceId: input.workspaceId,
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

      markMessageRead: shieldedProcedure
        .input(emailSchemas.markMessageRead.input)
        .output(emailSchemas.markMessageRead.output)
        .mutation(async ({ input, ctx }) => {
          await markEmailMessageRead({
            prisma: ctx.prisma,
            workspaceId: input.workspaceId,
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
            workspaceId: input.workspaceId,
            id: input.id,
            flagged: input.flagged,
          });
          return { ok: true };
        }),

      listMailboxStats: shieldedProcedure
        .input(emailSchemas.listMailboxStats.input)
        .output(emailSchemas.listMailboxStats.output)
        .query(async ({ input, ctx }) => {
          const rows = await ctx.prisma.emailMessage.groupBy({
            by: ["mailboxPath"],
            where: {
              workspaceId: input.workspaceId,
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
          const activeEmails = getActiveAccountEmails(input.workspaceId);
          const rows = await ctx.prisma.emailMessage.findMany({
            where: {
              workspaceId: input.workspaceId,
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
          const activeEmails = getActiveAccountEmails(input.workspaceId);
          const rows = await ctx.prisma.emailMessage.findMany({
            where: {
              workspaceId: input.workspaceId,
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

      listUnifiedMessages: shieldedProcedure
        .input(emailSchemas.listUnifiedMessages.input)
        .output(emailSchemas.listUnifiedMessages.output)
        .query(async ({ input, ctx }) => {
          const scope = input.scope;
          const pageSize = resolveMessagePageSize(input.pageSize);
          const privateSenders = buildPrivateSenderSet(input.workspaceId);
          if (scope === "mailbox") {
            if (!input.accountEmail || !input.mailbox) {
              throw new Error("Mailbox scope requires accountEmail and mailbox.");
            }
            const { rows, nextCursor } = await fetchMessageRowsPage({
              prisma: ctx.prisma,
              where: {
                workspaceId: input.workspaceId,
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

          const activeEmails = getActiveAccountEmails(input.workspaceId);

          const mailboxes = await ctx.prisma.emailMailbox.findMany({
            where: {
              workspaceId: input.workspaceId,
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
                  workspaceId: input.workspaceId,
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
              workspaceId: input.workspaceId,
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
          const activeEmails = getActiveAccountEmails(input.workspaceId);
          const mailboxes = await ctx.prisma.emailMailbox.findMany({
            where: {
              workspaceId: input.workspaceId,
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
                workspaceId: input.workspaceId,
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
              workspaceId: input.workspaceId,
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

      updateMailboxSorts: shieldedProcedure
        .input(emailSchemas.updateMailboxSorts.input)
        .output(emailSchemas.updateMailboxSorts.output)
        .mutation(async ({ input, ctx }) => {
          // 逻辑：仅允许更新同账号下的排序值。
          await ctx.prisma.$transaction(
            input.sorts.map((entry) =>
              ctx.prisma.emailMailbox.update({
                where: {
                  workspaceId_accountEmail_path: {
                    workspaceId: input.workspaceId,
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
              workspaceId: input.workspaceId,
              accountEmail: input.accountEmail,
              mailbox: input.mailbox,
              limit: input.limit ?? DEFAULT_INITIAL_SYNC_LIMIT,
            },
            "email sync mailbox request",
          );
          await syncRecentMailboxMessages({
            prisma: ctx.prisma,
            workspaceId: input.workspaceId,
            accountEmail: input.accountEmail,
            mailboxPath: input.mailbox,
            limit: input.limit ?? DEFAULT_INITIAL_SYNC_LIMIT,
          });
          logger.info(
            {
              workspaceId: input.workspaceId,
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
            { workspaceId: input.workspaceId, accountEmail: input.accountEmail },
            "email sync mailboxes request",
          );
          await syncEmailMailboxes({
            prisma: ctx.prisma,
            workspaceId: input.workspaceId,
            accountEmail: input.accountEmail,
          });
          logger.info(
            { workspaceId: input.workspaceId, accountEmail: input.accountEmail },
            "email sync mailboxes completed",
          );
          return { ok: true };
        }),

      getMessage: shieldedProcedure
        .input(emailSchemas.getMessage.input)
        .output(emailSchemas.getMessage.output)
        .query(async ({ input, ctx }) => {
          const row = await ctx.prisma.emailMessage.findFirst({
            where: { id: input.id, workspaceId: input.workspaceId },
          });
          if (!row) {
            throw new Error("邮件不存在。");
          }
          const privateSenders = buildPrivateSenderSet(input.workspaceId);
          const fromAddress = extractSenderEmail(row.from ?? row.rawRfc822 ?? "");
          const isPrivate = fromAddress ? privateSenders.has(fromAddress) : false;
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
            bodyHtml: row.bodyHtml ?? undefined,
            bodyText: row.bodyText ?? undefined,
            attachments: normalizeAttachments(row.attachments),
            flags: normalizeStringArray(row.flags),
            fromAddress: fromAddress ?? undefined,
            isPrivate,
          };
        }),
      setPrivateSender: shieldedProcedure
        .input(emailSchemas.setPrivateSender.input)
        .output(emailSchemas.setPrivateSender.output)
        .mutation(async ({ input }) => {
          addPrivateSender({ workspaceId: input.workspaceId, senderEmail: input.senderEmail });
          return { ok: true };
        }),
      removePrivateSender: shieldedProcedure
        .input(emailSchemas.removePrivateSender.input)
        .output(emailSchemas.removePrivateSender.output)
        .mutation(async ({ input }) => {
          removePrivateSender({
            workspaceId: input.workspaceId,
            senderEmail: input.senderEmail,
          });
          return { ok: true };
        }),
      sendMessage: shieldedProcedure
        .input(emailSchemas.sendMessage.input)
        .output(emailSchemas.sendMessage.output)
        .mutation(async ({ input }) => {
          const result = await sendEmail({
            workspaceId: input.workspaceId,
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
            },
          });
          return { ok: result.ok, messageId: result.messageId };
        }),
      testConnection: shieldedProcedure
        .input(emailSchemas.testConnection.input)
        .output(emailSchemas.testConnection.output)
        .mutation(async ({ input }) => {
          const config = readEmailConfigFile(input.workspaceId);
          const account = config.emailAccounts.find(
            (a) =>
              a.emailAddress.trim().toLowerCase() ===
              input.accountEmail.trim().toLowerCase(),
          );
          if (!account) {
            return { ok: false, error: "账号未找到。" };
          }
          const transport = createTransport(
            {
              emailAddress: account.emailAddress,
              auth: account.auth,
              imap: account.imap,
              smtp: account.smtp,
            },
            {
              workspaceId: input.workspaceId,
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
      deleteMessage: shieldedProcedure
        .input(emailSchemas.deleteMessage.input)
        .output(emailSchemas.deleteMessage.output)
        .mutation(async ({ input, ctx }) => {
          const prisma = ctx.prisma as PrismaClient;
          const row = await prisma.emailMessage.findUnique({
            where: { id: input.id },
          });
          if (!row) throw new Error("邮件未找到。");
          const config = readEmailConfigFile(input.workspaceId);
          const account = config.emailAccounts.find(
            (a) =>
              a.emailAddress.trim().toLowerCase() ===
              row.accountEmail.trim().toLowerCase(),
          );
          if (!account) throw new Error("账号未找到。");
          const transport = createTransport(
            {
              emailAddress: account.emailAddress,
              auth: account.auth,
              imap: account.imap,
              smtp: account.smtp,
            },
            {
              workspaceId: input.workspaceId,
              password: account.auth.type === "password"
                ? getEmailEnvValue(account.auth.envKey)
                : undefined,
            },
          );
          try {
            if (!transport.deleteMessage) {
              throw new Error("当前适配器不支持删除邮件。");
            }
            await transport.deleteMessage(row.mailboxPath, row.externalId);
            await prisma.emailMessage.delete({ where: { id: input.id } });
            return { ok: true };
          } finally {
            await transport.dispose();
          }
        }),
      moveMessage: shieldedProcedure
        .input(emailSchemas.moveMessage.input)
        .output(emailSchemas.moveMessage.output)
        .mutation(async ({ input, ctx }) => {
          const prisma = ctx.prisma as PrismaClient;
          const row = await prisma.emailMessage.findUnique({
            where: { id: input.id },
          });
          if (!row) throw new Error("邮件未找到。");
          const config = readEmailConfigFile(input.workspaceId);
          const account = config.emailAccounts.find(
            (a) =>
              a.emailAddress.trim().toLowerCase() ===
              row.accountEmail.trim().toLowerCase(),
          );
          if (!account) throw new Error("账号未找到。");
          const transport = createTransport(
            {
              emailAddress: account.emailAddress,
              auth: account.auth,
              imap: account.imap,
              smtp: account.smtp,
            },
            {
              workspaceId: input.workspaceId,
              password: account.auth.type === "password"
                ? getEmailEnvValue(account.auth.envKey)
                : undefined,
            },
          );
          try {
            if (!transport.moveMessage) {
              throw new Error("当前适配器不支持移动邮件。");
            }
            await transport.moveMessage(row.mailboxPath, input.toMailbox, row.externalId);
            await prisma.emailMessage.update({
              where: { id: input.id },
              data: { mailboxPath: input.toMailbox },
            });
            return { ok: true };
          } finally {
            await transport.dispose();
          }
        }),
      saveDraft: shieldedProcedure
        .input(emailSchemas.saveDraft.input)
        .output(emailSchemas.saveDraft.output)
        .mutation(async ({ input, ctx }) => {
          const prisma = ctx.prisma as PrismaClient;
          const id = input.id || crypto.randomUUID();
          const row = await (prisma as any).emailDraft.upsert({
            where: { id },
            create: {
              id,
              workspaceId: input.workspaceId,
              accountEmail: input.accountEmail,
              mode: input.mode,
              to: input.to,
              cc: input.cc,
              bcc: input.bcc,
              subject: input.subject,
              body: input.body,
              inReplyTo: input.inReplyTo ?? null,
              references: input.references ?? null,
            },
            update: {
              accountEmail: input.accountEmail,
              mode: input.mode,
              to: input.to,
              cc: input.cc,
              bcc: input.bcc,
              subject: input.subject,
              body: input.body,
              inReplyTo: input.inReplyTo ?? null,
              references: input.references ?? null,
            },
          });
          return {
            id: row.id,
            accountEmail: row.accountEmail,
            mode: row.mode,
            to: row.to,
            cc: row.cc,
            bcc: row.bcc,
            subject: row.subject,
            body: row.body,
            inReplyTo: row.inReplyTo ?? undefined,
            references: row.references ? normalizeStringArray(row.references) : undefined,
            updatedAt: row.updatedAt.toISOString(),
          };
        }),
      listDrafts: shieldedProcedure
        .input(emailSchemas.listDrafts.input)
        .output(emailSchemas.listDrafts.output)
        .query(async ({ input, ctx }) => {
          const prisma = ctx.prisma as PrismaClient;
          const rows = await (prisma as any).emailDraft.findMany({
            where: { workspaceId: input.workspaceId },
            orderBy: { updatedAt: "desc" },
          });
          return rows.map((row: any) => ({
            id: row.id,
            accountEmail: row.accountEmail,
            mode: row.mode,
            to: row.to,
            cc: row.cc,
            bcc: row.bcc,
            subject: row.subject,
            body: row.body,
            inReplyTo: row.inReplyTo ?? undefined,
            references: row.references ? normalizeStringArray(row.references) : undefined,
            updatedAt: row.updatedAt.toISOString(),
          }));
        }),
      getDraft: shieldedProcedure
        .input(emailSchemas.getDraft.input)
        .output(emailSchemas.getDraft.output)
        .query(async ({ input, ctx }) => {
          const prisma = ctx.prisma as PrismaClient;
          const row = await (prisma as any).emailDraft.findUnique({
            where: { id: input.id },
          });
          if (!row) throw new Error("草稿未找到。");
          return {
            id: row.id,
            accountEmail: row.accountEmail,
            mode: row.mode,
            to: row.to,
            cc: row.cc,
            bcc: row.bcc,
            subject: row.subject,
            body: row.body,
            inReplyTo: row.inReplyTo ?? undefined,
            references: row.references ? normalizeStringArray(row.references) : undefined,
            updatedAt: row.updatedAt.toISOString(),
          };
        }),
      deleteDraft: shieldedProcedure
        .input(emailSchemas.deleteDraft.input)
        .output(emailSchemas.deleteDraft.output)
        .mutation(async ({ input, ctx }) => {
          const prisma = ctx.prisma as PrismaClient;
          await (prisma as any).emailDraft.delete({
            where: { id: input.id },
          });
          return { ok: true };
        }),
      batchMarkRead: shieldedProcedure
        .input(emailSchemas.batchMarkRead.input)
        .output(emailSchemas.batchMarkRead.output)
        .mutation(async ({ input, ctx }) => {
          for (const id of input.ids) {
            await markEmailMessageRead({
              prisma: ctx.prisma as PrismaClient,
              workspaceId: input.workspaceId,
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
          for (const id of input.ids) {
            const row = await prisma.emailMessage.findUnique({ where: { id } });
            if (!row) continue;
            const config = readEmailConfigFile(input.workspaceId);
            const account = config.emailAccounts.find(
              (a) => a.emailAddress.trim().toLowerCase() === row.accountEmail.trim().toLowerCase(),
            );
            if (!account) continue;
            const transport = createTransport(
              { emailAddress: account.emailAddress, auth: account.auth, imap: account.imap, smtp: account.smtp },
              { workspaceId: input.workspaceId, password: account.auth.type === "password" ? getEmailEnvValue(account.auth.envKey) : undefined },
            );
            try {
              if (transport.deleteMessage) {
                await transport.deleteMessage(row.mailboxPath, row.externalId);
              }
              await prisma.emailMessage.delete({ where: { id } });
            } finally {
              await transport.dispose();
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
            const config = readEmailConfigFile(input.workspaceId);
            const account = config.emailAccounts.find(
              (a) => a.emailAddress.trim().toLowerCase() === row.accountEmail.trim().toLowerCase(),
            );
            if (!account) continue;
            const transport = createTransport(
              { emailAddress: account.emailAddress, auth: account.auth, imap: account.imap, smtp: account.smtp },
              { workspaceId: input.workspaceId, password: account.auth.type === "password" ? getEmailEnvValue(account.auth.envKey) : undefined },
            );
            try {
              if (transport.moveMessage) {
                await transport.moveMessage(row.mailboxPath, input.toMailbox, row.externalId);
              }
              await prisma.emailMessage.update({
                where: { id },
                data: { mailboxPath: input.toMailbox },
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
          const pageSize = input.pageSize ?? 20;
          const privateSenders = buildPrivateSenderSet(input.workspaceId);
          // 逻辑：服务端搜索先查本地数据库（subject/snippet 模糊匹配）。
          const rows = await prisma.emailMessage.findMany({
            where: {
              workspaceId: input.workspaceId,
              accountEmail: input.accountEmail,
              OR: [
                { subject: { contains: input.query } },
                { snippet: { contains: input.query } },
              ],
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: pageSize + 1,
          });
          const hasMore = rows.length > pageSize;
          const items = rows.slice(0, pageSize);
          const nextCursor = hasMore && items.length
            ? encodeMessageCursor({ createdAt: items[items.length - 1]!.createdAt, id: items[items.length - 1]!.id })
            : null;
          return {
            items: items.map((row) =>
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
    });
  }
}

export const emailRouterImplementation = EmailRouterImpl.createRouter();
