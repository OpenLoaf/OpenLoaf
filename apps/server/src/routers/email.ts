import {
  t,
  shieldedProcedure,
  BaseEmailRouter,
  emailSchemas,
} from "@tenas-ai/api";
import { addEmailAccount } from "@/modules/email/emailAccountService";
import { readEmailConfigFile } from "@/modules/email/emailConfigStore";
import { syncEmailMailboxes } from "@/modules/email/emailMailboxService";
import {
  DEFAULT_INITIAL_SYNC_LIMIT,
  markEmailMessageRead,
  shouldAutoSyncOnAdd,
  syncRecentMailboxMessages,
} from "@/modules/email/emailSyncService";
import { hasSeenFlag, normalizeEmailFlags } from "@/modules/email/emailFlags";
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

/** Normalize attachment metadata list. */
function normalizeAttachments(value: unknown): Array<{
  filename?: string;
  contentType?: string;
  size?: number;
}> {
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
      return { filename, contentType, size };
    })
    .filter(
      (item): item is { filename?: string; contentType?: string; size?: number } =>
        Boolean(item),
    );
}

export class EmailRouterImpl extends BaseEmailRouter {
  /** Define email router implementation. */
  public static createRouter() {
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
          const created = addEmailAccount(input);
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

      listMessages: shieldedProcedure
        .input(emailSchemas.listMessages.input)
        .output(emailSchemas.listMessages.output)
        .query(async ({ input, ctx }) => {
          const rows = await ctx.prisma.emailMessage.findMany({
            where: {
              workspaceId: input.workspaceId,
              accountEmail: input.accountEmail,
              mailboxPath: input.mailbox,
            },
            orderBy: { date: "desc" },
            take: 200,
          });
          return rows.map((row) => {
            const fromList = normalizeAddressList(row.from);
            const flags = normalizeStringArray(row.flags);
            const seen = flags.some((flag) => flag.toUpperCase() === "\\SEEN");
            return {
              id: row.id,
              accountEmail: row.accountEmail,
              mailbox: row.mailboxPath,
              from: fromList[0] ?? "",
              subject: row.subject ?? "",
              preview: row.snippet ?? "",
              time: row.date ? row.date.toISOString() : undefined,
              unread: !seen,
            };
          });
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
            orderBy: { path: "asc" },
          });
          return rows.map((row) => ({
            path: row.path,
            name: row.name,
            parentPath: row.parentPath ?? null,
            delimiter: row.delimiter ?? undefined,
            attributes: normalizeStringArray(row.attributes),
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
          const rows = await ctx.prisma.emailMessage.findMany({
            where: { workspaceId: input.workspaceId },
            select: { flags: true },
          });
          // 逻辑：以 \\Seen 为已读标记，未包含则视为未读。
          const count = rows.reduce((total, row) => {
            const flags = normalizeEmailFlags(row.flags);
            return hasSeenFlag(flags) ? total : total + 1;
          }, 0);
          return { count };
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
          };
        }),
    });
  }
}

export const emailRouterImplementation = EmailRouterImpl.createRouter();
