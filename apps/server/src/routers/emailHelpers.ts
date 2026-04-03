/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { PrismaClient } from "@openloaf/db";
import {
  normalizeEmailFlags,
  hasSeenFlag,
} from "@/modules/email/emailFlags";
import { listPrivateSenders, readEmailConfigFile } from "@/modules/email/emailConfigStore";
import { getEmailEnvValue } from "@/modules/email/emailEnvStore";
import { createTransport } from "@/modules/email/transport/factory";
import {
  moveEmailMessage as moveEmailMessageFile,
  updateEmailFlags,
} from "@/modules/email/emailFileStore";
import { logger } from "@/common/logger";

export type EmailAccountView = {
  emailAddress: string;
  label?: string;
  status: {
    lastSyncAt?: string;
    lastError?: string | null;
  };
};

/** Build account view payload for UI. */
export function toEmailAccountView(input: {
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
export function formatAddressEntry(entry: unknown): string | null {
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
export function normalizeAddressList(value: unknown): string[] {
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
export function extractSenderEmail(value: unknown): string | null {
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

/** Build private sender set. */
export function buildPrivateSenderSet(): Set<string> {
  const senders = listPrivateSenders();
  return new Set(senders);
}

/** Normalize string array values. */
export function normalizeStringArray(value: unknown): string[] {
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
export function normalizeMailboxAttributes(value: unknown): string[] {
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
export function isInboxMailbox(input: { path: string; attributes: unknown }): boolean {
  const attributes = normalizeMailboxAttributes(input.attributes);
  return attributes.includes("\\INBOX") || input.path.toUpperCase() === "INBOX";
}

/** Check if mailbox is drafts. */
export function isDraftsMailbox(input: { path: string; attributes: unknown }): boolean {
  const attributes = normalizeMailboxAttributes(input.attributes);
  const path = input.path.toLowerCase();
  return attributes.includes("\\DRAFTS") || path.includes("draft");
}

/** Check if mailbox is sent. */
export function isSentMailbox(input: { path: string; attributes: unknown }): boolean {
  const attributes = normalizeMailboxAttributes(input.attributes);
  const path = input.path.toLowerCase();
  return attributes.includes("\\SENT") || path.includes("sent");
}

/** Normalize attachment metadata list. */
export type AttachmentMeta = {
  filename?: string;
  contentType?: string;
  size?: number;
};

export function normalizeAttachments(value: unknown): AttachmentMeta[] {
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

/** Build message summary payload. */
export function toMessageSummary(input: {
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
export function encodeMessageCursor(input: { createdAt: Date; id: string }): string {
  return `${input.createdAt.toISOString()}::${input.id}`;
}

/** Decode cursor for message pagination. */
export function decodeMessageCursor(cursor?: string | null): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [rawTime, id] = cursor.split("::");
  if (!rawTime || !id) return null;
  const createdAt = new Date(rawTime);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

/** Resolve message page size. */
export function resolveMessagePageSize(input?: number | null): number {
  const fallback = 20;
  if (!input) return fallback;
  return Math.min(Math.max(input, 1), 200);
}

/** Fetch message rows with cursor pagination. */
export async function fetchMessageRowsPage(input: {
  prisma: PrismaClient;
  where: Record<string, unknown>;
  pageSize: number;
  cursor?: string | null;
}) {
  const cursor = decodeMessageCursor(input.cursor);
  const where = cursor
    ? {
        AND: [
          input.where,
          {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          },
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

/** 查找账号的 Trash 邮箱路径。 */
export async function findTrashMailboxPath(
  prisma: PrismaClient,
  accountEmail: string,
): Promise<string | null> {
  const mailboxes = await prisma.emailMailbox.findMany({
    where: { accountEmail },
    select: { path: true, attributes: true },
  });
  // 逻辑：优先匹配 \\Trash 属性，其次匹配路径名。
  for (const mb of mailboxes) {
    const attrs = Array.isArray(mb.attributes) ? mb.attributes : [];
    const normalized = attrs.map((a: unknown) =>
      typeof a === "string" ? a.trim().toUpperCase() : "",
    );
    if (normalized.includes("\\TRASH") || normalized.includes("\\\\TRASH")) {
      return mb.path;
    }
  }
  for (const mb of mailboxes) {
    const lower = mb.path.toLowerCase();
    if (lower === "trash" || lower.includes("deleted") || lower.includes("trash")) {
      return mb.path;
    }
  }
  return null;
}

/** 将邮件移动到 Trash 邮箱（IMAP + DB + 文件系统）。 */
export async function moveMessageToTrash(input: {
  prisma: PrismaClient;
  row: { id: string; accountEmail: string; mailboxPath: string; externalId: string };
  trashPath: string;
}) {
  const { prisma, row, trashPath } = input;
  if (row.mailboxPath === trashPath) return; // 已在 Trash 中
  const config = readEmailConfigFile();
  const account = config.emailAccounts.find(
    (a) =>
      a.emailAddress.trim().toLowerCase() ===
      row.accountEmail.trim().toLowerCase(),
  );
  if (!account) return;
  const transport = createTransport(
    {
      emailAddress: account.emailAddress,
      auth: account.auth,
      imap: account.imap,
      smtp: account.smtp,
    },
    {
      password:
        account.auth.type === "password"
          ? getEmailEnvValue(account.auth.envKey)
          : undefined,
    },
  );
  try {
    if (transport.moveMessage) {
      await transport.moveMessage(row.mailboxPath, trashPath, row.externalId);
    }
    await prisma.emailMessage.update({
      where: { id: row.id },
      data: { mailboxPath: trashPath },
    });
    void moveEmailMessageFile({
      accountEmail: row.accountEmail,
      fromMailboxPath: row.mailboxPath,
      toMailboxPath: trashPath,
      externalId: row.externalId,
    }).catch((err) => {
      logger.warn({ err, id: row.id }, "move to trash file store failed");
    });
  } finally {
    await transport.dispose();
  }
}

/** Get active account emails from config for defensive filtering. */
export function getActiveAccountEmails(): Set<string> {
  const config = readEmailConfigFile();
  return new Set(
    config.emailAccounts.map((a) => a.emailAddress.trim().toLowerCase()),
  );
}
