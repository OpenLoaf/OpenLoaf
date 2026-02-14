import Imap from "imap";
import { simpleParser } from "mailparser";

import { Prisma, type PrismaClient } from "@tenas-ai/db";
import { logger } from "@/common/logger";
import { sanitizeEmailHtml } from "./emailSanitize";
import {
  ensureFlaggedFlag,
  ensureSeenFlag,
  hasFlag,
  hasSeenFlag,
  normalizeEmailFlags,
  removeFlaggedFlag,
} from "./emailFlags";
import { readEmailConfigFile, writeEmailConfigFile } from "./emailConfigStore";
import { getEmailEnvValue } from "./emailEnvStore";
import { writeEmailMessage } from "./emailFileStore";
import { updateEmailFlags as updateEmailFlagsFile } from "./emailFileStore";

/** Env key for disabling auto sync on add. */
const AUTO_SYNC_ENV_KEY = "EMAIL_SYNC_ON_ADD";
/** Env key for skipping IMAP operations (tests only). */
const SKIP_IMAP_ENV_KEY = "EMAIL_IMAP_SKIP";
/** Default count for initial sync. */
export const DEFAULT_INITIAL_SYNC_LIMIT = 50;
/** IMAP close timeout in ms. */
const CLOSE_TIMEOUT_MS = 5000;

/** Normalize nullable JSON payload for Prisma. */
function toNullableJsonValue(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === undefined || value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

/** Extract address value array from mailparser AddressObject or similar. */
function extractAddressValues(
  value: unknown,
): Array<{ address: string; name: string }> | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return value as any
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.value)) return record.value as any
  }
  return undefined
}

/** Check if auto sync on add is enabled. */
export function shouldAutoSyncOnAdd(): boolean {
  const raw = process.env[AUTO_SYNC_ENV_KEY];
  if (!raw) return true;
  const normalized = raw.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

/** Check if IMAP operations should be skipped. */
function shouldSkipImapOperations(): boolean {
  const raw = process.env[SKIP_IMAP_ENV_KEY];
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "on", "yes"].includes(normalized);
}

/** Normalize email address for lookups. */
function normalizeEmailAddress(emailAddress: string): string {
  return emailAddress.trim().toLowerCase();
}

/** Resolve email account and password from configuration. */
function resolveEmailAccountCredential(workspaceId: string, accountEmail: string) {
  const normalizedEmail = normalizeEmailAddress(accountEmail);
  const config = readEmailConfigFile(workspaceId);
  const account = config.emailAccounts.find(
    (item) => normalizeEmailAddress(item.emailAddress) === normalizedEmail,
  );
  if (!account) {
    throw new Error("邮箱账号不存在。");
  }
  if (account.auth.type !== "password") {
    throw new Error("此账号不使用密码认证。");
  }
  const password = getEmailEnvValue(account.auth.envKey);
  if (!password) {
    throw new Error("邮箱密码未配置。");
  }
  return { account, password, normalizedEmail };
}

/** Update email account status and mailbox sync state. */
function updateEmailAccountSyncStatus(input: {
  workspaceId: string;
  accountEmail: string;
  mailboxPath: string;
  uidValidity?: number;
  highestUid?: number;
  lastSyncAt?: string;
  lastError?: string | null;
}) {
  const config = readEmailConfigFile(input.workspaceId);
  const normalizedEmail = normalizeEmailAddress(input.accountEmail);
  const index = config.emailAccounts.findIndex(
    (item) => normalizeEmailAddress(item.emailAddress) === normalizedEmail,
  );
  if (index < 0) return;
  const target = config.emailAccounts[index]!;
  const nextStatus = {
    ...target.status,
    ...(input.lastSyncAt ? { lastSyncAt: input.lastSyncAt } : null),
    ...(input.lastError !== undefined ? { lastError: input.lastError } : null),
  };
  const nextMailboxes = {
    ...(target.sync?.mailboxes ?? {}),
    [input.mailboxPath]: {
      uidValidity: input.uidValidity,
      highestUid: input.highestUid,
    },
  };
  const nextAccount = {
    ...target,
    status: nextStatus,
    sync: {
      ...(target.sync ?? { mailboxes: {} }),
      mailboxes: nextMailboxes,
    },
  };
  const nextConfig = {
    ...config,
    emailAccounts: config.emailAccounts.map((account, idx) =>
      idx === index ? nextAccount : account,
    ),
  };
  writeEmailConfigFile(nextConfig, input.workspaceId);
}

/** Connect to IMAP server and wait until ready. */
async function connectImap(imap: Imap): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    imap.once("ready", resolve);
    imap.once("error", reject);
    imap.connect();
  });
}

/** Open IMAP mailbox. */
async function openMailbox(
  imap: Imap,
  mailboxPath: string,
  readOnly = true,
): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox(mailboxPath, readOnly, (error, box) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(box);
    });
  });
}

/** Search all message UIDs in mailbox. */
async function searchAllUids(imap: Imap): Promise<number[]> {
  return new Promise((resolve, reject) => {
    imap.search(["ALL"], (error, results) => {
      if (error) {
        reject(error);
        return;
      }
      resolve((results ?? []).map((uid) => Number(uid)).filter((uid) => uid > 0));
    });
  });
}

/** Read a stream to buffer. */
async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once("end", () => resolve(Buffer.concat(chunks)));
    stream.once("error", reject);
  });
}

/** Parse messages for a UID list. */
async function parseMessages(imap: Imap, uids: number[]) {
  const tasks: Array<Promise<{
    uid: number;
    flags: string[];
    size?: number;
    messageId?: string;
    subject?: string;
    from?: unknown;
    to?: unknown;
    cc?: unknown;
    bcc?: unknown;
    date?: Date;
    snippet?: string;
    bodyHtml?: string;
    bodyHtmlRaw?: string;
    bodyText?: string;
    attachments?: Array<{
      filename?: string;
      contentType?: string;
      size?: number;
      cid?: string;
    }>;
    raw?: string;
  }>> = [];
  const fetcher = imap.fetch(uids, { bodies: "", struct: true });

  fetcher.on("message", (msg) => {
    let uid = 0;
    let size: number | undefined;
    let flags: string[] = [];
    let rawPromise: Promise<Buffer> | null = null;
    msg.on("body", (stream) => {
      rawPromise = readStream(stream);
    });
    msg.once("attributes", (attrs) => {
      uid = Number(attrs.uid ?? 0);
      flags = Array.isArray(attrs.flags) ? attrs.flags.map(String) : [];
      size = typeof attrs.size === "number" ? attrs.size : undefined;
    });
    const task = new Promise<{
      uid: number;
      flags: string[];
      size?: number;
      messageId?: string;
      subject?: string;
      from?: unknown;
      to?: unknown;
      cc?: unknown;
      bcc?: unknown;
      date?: Date;
      snippet?: string;
      bodyHtml?: string;
      bodyHtmlRaw?: string;
      bodyText?: string;
      attachments?: Array<{
        filename?: string;
        contentType?: string;
        size?: number;
        cid?: string;
      }>;
      raw?: string;
    }>((resolve, reject) => {
      msg.once("end", async () => {
        try {
          const raw = rawPromise ? await rawPromise : Buffer.alloc(0);
          const parsed = await simpleParser(raw);
          const text = parsed.text?.replace(/\s+/g, " ").trim() ?? "";
          // 逻辑：正文摘要优先取纯文本前 200 字符。
          const snippet = text ? text.slice(0, 200) : undefined;
          const rawHtml = parsed.html ? String(parsed.html) : undefined;
          const bodyHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : undefined;
          const bodyHtmlRaw = rawHtml && rawHtml !== bodyHtml ? rawHtml : undefined;
          const attachments = parsed.attachments?.map(
            (attachment: {
              filename?: string;
              contentType?: string;
              size?: number;
              cid?: string;
            }) => ({
            filename: attachment.filename ?? undefined,
            contentType: attachment.contentType ?? undefined,
            size: typeof attachment.size === "number" ? attachment.size : undefined,
            cid: attachment.cid ?? undefined,
          }),
          );
          resolve({
            uid,
            flags,
            size,
            messageId: parsed.messageId ?? undefined,
            subject: parsed.subject ?? undefined,
            from: parsed.from ?? undefined,
            to: parsed.to ?? undefined,
            cc: parsed.cc ?? undefined,
            bcc: parsed.bcc ?? undefined,
            date: parsed.date ?? undefined,
            snippet,
            bodyHtml,
            bodyHtmlRaw,
            bodyText: parsed.text ?? undefined,
            attachments: attachments?.length ? attachments : undefined,
            raw: raw.length ? raw.toString("utf-8") : undefined,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    tasks.push(task);
  });

  await new Promise<void>((resolve, reject) => {
    fetcher.once("error", reject);
    fetcher.once("end", resolve);
  });

  return Promise.all(tasks);
}

/** Add flags to IMAP message. */
async function addImapFlags(imap: Imap, uid: number, flags: string[]) {
  await new Promise<void>((resolve, reject) => {
    imap.addFlags(uid, flags, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** Remove flags from IMAP message. */
async function removeImapFlags(imap: Imap, uid: number, flags: string[]) {
  await new Promise<void>((resolve, reject) => {
    imap.delFlags(uid, flags, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** Format error message for status store. */
function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "同步失败";
}

/** Sync recent messages from mailbox into database. */
export async function syncRecentMailboxMessages(input: {
  prisma: PrismaClient;
  workspaceId: string;
  accountEmail: string;
  mailboxPath: string;
  limit?: number;
}): Promise<void> {
  const limit = Math.max(input.limit ?? DEFAULT_INITIAL_SYNC_LIMIT, 1);
  const startedAt = Date.now();
  let imap: Imap | null = null;
  try {
    logger.info(
      {
        workspaceId: input.workspaceId,
        accountEmail: input.accountEmail,
        mailboxPath: input.mailboxPath,
        limit,
      },
      "email sync start",
    );
    const { account, password, normalizedEmail } = resolveEmailAccountCredential(
      input.workspaceId,
      input.accountEmail,
    );
    imap = new Imap({
      user: account.emailAddress,
      password,
      host: account.imap!.host,
      port: account.imap!.port,
      tls: account.imap!.tls,
    });

    imap.on("error", (error) => {
      logger.error(
        { err: error, accountEmail: normalizedEmail, mailboxPath: input.mailboxPath },
        "email imap error",
      );
    });
    imap.on("close", (hadError) => {
      logger.info(
        { accountEmail: normalizedEmail, mailboxPath: input.mailboxPath, hadError },
        "email imap closed",
      );
    });
    imap.on("end", () => {
      logger.info(
        { accountEmail: normalizedEmail, mailboxPath: input.mailboxPath },
        "email imap ended",
      );
    });

    logger.debug(
      {
        host: account.imap!.host,
        port: account.imap!.port,
        tls: account.imap!.tls,
        accountEmail: normalizedEmail,
      },
      "email imap connecting",
    );
    await connectImap(imap);
    logger.debug(
      { accountEmail: normalizedEmail, mailboxPath: input.mailboxPath },
      "email imap ready",
    );
    const box = await openMailbox(imap, input.mailboxPath);
    logger.debug(
      {
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        uidValidity: box.uidvalidity,
        total: box.messages.total,
      },
      "email mailbox opened",
    );

    const uids = await searchAllUids(imap);
    const mailboxHighestUid = uids.length ? Math.max(...uids) : 0;
    logger.debug(
      {
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        totalUids: uids.length,
      },
      "email mailbox uids fetched",
    );
    if (!uids.length) {
      // 逻辑：无邮件时也写入同步时间，清空错误状态。
      updateEmailAccountSyncStatus({
        workspaceId: input.workspaceId,
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        uidValidity: box.uidvalidity,
        highestUid: mailboxHighestUid,
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      });
      logger.info(
        {
          accountEmail: normalizedEmail,
          mailboxPath: input.mailboxPath,
          durationMs: Date.now() - startedAt,
        },
        "email sync completed (empty mailbox)",
      );
      return;
    }

    const recentUids = uids.slice(-limit);
    logger.debug(
      {
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        recentCount: recentUids.length,
        recentFirst: recentUids[0],
        recentLast: recentUids[recentUids.length - 1],
      },
      "email mailbox recent uids selected",
    );
    // 逻辑：过滤已同步的 UID，避免重复拉取。
    const existingRows = await input.prisma.emailMessage.findMany({
      where: {
        workspaceId: input.workspaceId,
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        externalId: { in: recentUids.map(String) },
      },
      select: { externalId: true },
    });
    const existingIdSet = new Set(existingRows.map((row) => row.externalId));
    const pendingUids = recentUids.filter((uid) => !existingIdSet.has(String(uid)));
    logger.debug(
      {
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        pendingCount: pendingUids.length,
        skippedCount: recentUids.length - pendingUids.length,
      },
      "email mailbox uids filtered",
    );
    if (!pendingUids.length) {
      // 逻辑：无新增邮件时仍更新同步时间与最高 UID。
      updateEmailAccountSyncStatus({
        workspaceId: input.workspaceId,
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        uidValidity: box.uidvalidity,
        highestUid: mailboxHighestUid,
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      });
      logger.info(
        {
          accountEmail: normalizedEmail,
          mailboxPath: input.mailboxPath,
          highestUid: mailboxHighestUid,
          durationMs: Date.now() - startedAt,
        },
        "email sync completed (no new messages)",
      );
      return;
    }
    const parsedMessages = await parseMessages(imap, pendingUids);
    logger.debug(
      {
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        parsedCount: parsedMessages.length,
      },
      "email messages parsed",
    );
    let highestUid = mailboxHighestUid;

    for (const message of parsedMessages) {
      if (!message.uid) continue;
      const externalId = String(message.uid);
      logger.debug(
        {
          accountEmail: normalizedEmail,
          mailboxPath: input.mailboxPath,
          externalId,
          subject: message.subject,
        },
        "email message upsert",
      );
      highestUid = Math.max(highestUid, message.uid);
      await input.prisma.emailMessage.upsert({
        where: {
          workspaceId_accountEmail_mailboxPath_externalId: {
            workspaceId: input.workspaceId,
            accountEmail: normalizedEmail,
            mailboxPath: input.mailboxPath,
            externalId,
          },
        },
        create: {
          id: `${input.workspaceId}-${normalizedEmail}-${input.mailboxPath}-${externalId}`,
          workspaceId: input.workspaceId,
          accountEmail: normalizedEmail,
          mailboxPath: input.mailboxPath,
          externalId,
          messageId: message.messageId ?? null,
          subject: message.subject ?? null,
          from: (extractAddressValues(message.from) ?? []) as Prisma.InputJsonValue,
          to: (extractAddressValues(message.to) ?? []) as Prisma.InputJsonValue,
          cc: toNullableJsonValue(extractAddressValues(message.cc)),
          bcc: toNullableJsonValue(extractAddressValues(message.bcc)),
          date: message.date ?? null,
          flags: message.flags ?? [],
          snippet: message.snippet ?? null,
          attachments: toNullableJsonValue(message.attachments),
          size: message.size ?? null,
        },
        update: {
          messageId: message.messageId ?? null,
          subject: message.subject ?? null,
          from: (extractAddressValues(message.from) ?? []) as Prisma.InputJsonValue,
          to: (extractAddressValues(message.to) ?? []) as Prisma.InputJsonValue,
          cc: toNullableJsonValue(extractAddressValues(message.cc)),
          bcc: toNullableJsonValue(extractAddressValues(message.bcc)),
          date: message.date ?? null,
          flags: message.flags ?? [],
          snippet: message.snippet ?? null,
          attachments: toNullableJsonValue(message.attachments),
          size: message.size ?? null,
        },
      });

      // 逻辑：双写文件系统。
      void writeEmailMessage({
        workspaceId: input.workspaceId,
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        id: `${input.workspaceId}-${normalizedEmail}-${input.mailboxPath}-${externalId}`,
        externalId,
        messageId: message.messageId,
        subject: message.subject,
        from: extractAddressValues(message.from),
        to: extractAddressValues(message.to),
        cc: extractAddressValues(message.cc),
        bcc: extractAddressValues(message.bcc),
        date: message.date?.toISOString(),
        flags: message.flags ?? [],
        snippet: message.snippet,
        attachments: message.attachments,
        size: message.size,
        bodyHtml: message.bodyHtml,
        bodyText: message.bodyText,
        rawRfc822: message.raw,
      }).catch((err) => {
        logger.warn({ err, externalId }, "email file store write failed");
      });
    }

    updateEmailAccountSyncStatus({
      workspaceId: input.workspaceId,
      accountEmail: normalizedEmail,
      mailboxPath: input.mailboxPath,
      uidValidity: box.uidvalidity,
      highestUid,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    });
    logger.info(
      {
        accountEmail: normalizedEmail,
        mailboxPath: input.mailboxPath,
        highestUid,
        durationMs: Date.now() - startedAt,
      },
      "email sync completed",
    );
  } catch (error) {
    logger.error(
      {
        err: error,
        accountEmail: input.accountEmail,
        mailboxPath: input.mailboxPath,
      },
      "email sync failed",
    );
    updateEmailAccountSyncStatus({
      workspaceId: input.workspaceId,
      accountEmail: input.accountEmail,
      mailboxPath: input.mailboxPath,
      lastError: formatErrorMessage(error),
    });
    throw error;
  } finally {
    if (imap) {
      logger.debug(
        { accountEmail: input.accountEmail, mailboxPath: input.mailboxPath },
        "email imap closing",
      );
      // 逻辑：确保连接关闭，避免资源泄漏；超时则强制结束等待。
      let settled = false;
      const finish = (reason: "end" | "close" | "timeout") => {
        if (settled) return;
        settled = true;
        logger.debug(
          { accountEmail: input.accountEmail, mailboxPath: input.mailboxPath, reason },
          "email imap closed (finalize)",
        );
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        logger.warn(
          { accountEmail: input.accountEmail, mailboxPath: input.mailboxPath },
          "email imap end timeout",
        );
        try {
          imap?.destroy();
        } catch {
          // 逻辑：忽略 destroy 失败，避免影响主流程。
        }
        finish("timeout");
      }, 5000);
      const endPromise = new Promise<void>((resolve) => {
        const done = (reason: "end" | "close") => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          logger.debug(
            { accountEmail: input.accountEmail, mailboxPath: input.mailboxPath, reason },
            "email imap closed (signal)",
          );
          resolve();
        };
        imap?.once("end", () => done("end"));
        imap?.once("close", () => done("close"));
      });
      imap.end();
      await endPromise;
    }
  }
}

/** Mark a single message as read in IMAP and database. */
export async function markEmailMessageRead(input: {
  prisma: PrismaClient;
  workspaceId: string;
  id: string;
}): Promise<void> {
  const startedAt = Date.now();
  let imap: Imap | null = null;
  let closeContext: { accountEmail?: string; mailboxPath?: string; externalId?: string } = {};
  try {
    const row = await input.prisma.emailMessage.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    });
    if (!row) {
      throw new Error("邮件不存在。");
    }
    closeContext = {
      accountEmail: row.accountEmail,
      mailboxPath: row.mailboxPath,
      externalId: row.externalId,
    };
    const existingFlags = normalizeEmailFlags(row.flags);
    if (hasSeenFlag(existingFlags)) {
      return;
    }
    const { account, password, normalizedEmail } = resolveEmailAccountCredential(
      input.workspaceId,
      row.accountEmail,
    );
    if (shouldSkipImapOperations()) {
      logger.warn(
        { accountEmail: normalizedEmail, mailboxPath: row.mailboxPath },
        "email imap mark read skipped",
      );
    } else {
      imap = new Imap({
        user: account.emailAddress,
        password,
        host: account.imap!.host,
        port: account.imap!.port,
        tls: account.imap!.tls,
      });
      imap.on("error", (error) => {
        logger.error(
          { err: error, accountEmail: normalizedEmail, mailboxPath: row.mailboxPath },
          "email imap error",
        );
      });
      logger.debug(
        {
          host: account.imap!.host,
          port: account.imap!.port,
          tls: account.imap!.tls,
          accountEmail: normalizedEmail,
        },
        "email imap connecting",
      );
      await connectImap(imap);
      logger.debug(
        { accountEmail: normalizedEmail, mailboxPath: row.mailboxPath },
        "email imap ready",
      );
      await openMailbox(imap, row.mailboxPath, false);
      const imapUid = Number.parseInt(row.externalId, 10);
      await addImapFlags(imap, imapUid, ["\\Seen"]);
      logger.debug(
        {
          accountEmail: normalizedEmail,
          mailboxPath: row.mailboxPath,
          externalId: row.externalId,
        },
        "email message marked read",
      );
    }
    await input.prisma.emailMessage.update({
      where: { id: row.id },
      data: { flags: ensureSeenFlag(existingFlags) },
    });
    // 逻辑：双写文件系统 flags。
    void updateEmailFlagsFile({
      workspaceId: input.workspaceId,
      accountEmail: row.accountEmail,
      mailboxPath: row.mailboxPath,
      externalId: row.externalId,
      flags: ensureSeenFlag(existingFlags),
    }).catch((err) => {
      logger.warn({ err, id: row.id }, "email file store flags update failed");
    });
    logger.info(
      {
        accountEmail: row.accountEmail,
        mailboxPath: row.mailboxPath,
        externalId: row.externalId,
        durationMs: Date.now() - startedAt,
      },
      "email mark read completed",
    );
  } catch (error) {
    logger.error(
      { err: error, messageId: input.id, workspaceId: input.workspaceId },
      "email mark read failed",
    );
    throw error;
  } finally {
    if (imap) {
      logger.debug(
        { ...closeContext },
        "email imap closing",
      );
      // 逻辑：确保连接关闭，避免资源泄漏；超时则强制结束等待。
      let settled = false;
      const finish = (reason: "end" | "close" | "timeout") => {
        if (settled) return;
        settled = true;
        logger.debug(
          { ...closeContext, reason },
          "email imap closed (finalize)",
        );
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        logger.warn(
          { ...closeContext },
          "email imap end timeout",
        );
        try {
          imap?.destroy();
        } catch {
          // 逻辑：忽略 destroy 失败，避免影响主流程。
        }
        finish("timeout");
      }, 5000);
      const endPromise = new Promise<void>((resolve) => {
        const done = (reason: "end" | "close") => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          logger.debug(
            { ...closeContext, reason },
            "email imap closed (signal)",
          );
          resolve();
        };
        imap?.once("end", () => done("end"));
        imap?.once("close", () => done("close"));
      });
      imap.end();
      await endPromise;
    }
  }
}

/** Set flagged state for a single message in IMAP and database. */
export async function setEmailMessageFlagged(input: {
  prisma: PrismaClient;
  workspaceId: string;
  id: string;
  flagged: boolean;
}): Promise<void> {
  const startedAt = Date.now();
  let imap: Imap | null = null;
  let closeContext: { accountEmail?: string; mailboxPath?: string; externalId?: string } = {};
  try {
    const row = await input.prisma.emailMessage.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    });
    if (!row) {
      throw new Error("邮件不存在。");
    }
    closeContext = {
      accountEmail: row.accountEmail,
      mailboxPath: row.mailboxPath,
      externalId: row.externalId,
    };
    const existingFlags = normalizeEmailFlags(row.flags);
    const hasFlagged = hasFlag(existingFlags, "FLAGGED");
    if (hasFlagged === input.flagged) {
      return;
    }
    const { account, password, normalizedEmail } = resolveEmailAccountCredential(
      input.workspaceId,
      row.accountEmail,
    );
    if (shouldSkipImapOperations()) {
      logger.warn(
        { accountEmail: normalizedEmail, mailboxPath: row.mailboxPath },
        "email imap set flagged skipped",
      );
    } else {
      imap = new Imap({
        user: account.emailAddress,
        password,
        host: account.imap!.host,
        port: account.imap!.port,
        tls: account.imap!.tls,
      });
      imap.on("error", (error) => {
        logger.error(
          { err: error, accountEmail: normalizedEmail, mailboxPath: row.mailboxPath },
          "email imap error",
        );
      });
      logger.debug(
        {
          host: account.imap!.host,
          port: account.imap!.port,
          tls: account.imap!.tls,
          accountEmail: normalizedEmail,
        },
        "email imap connecting",
      );
      await connectImap(imap);
      logger.debug(
        { accountEmail: normalizedEmail, mailboxPath: row.mailboxPath },
        "email imap ready",
      );
      await openMailbox(imap, row.mailboxPath, false);
      const imapUid = Number.parseInt(row.externalId, 10);
      // 逻辑：根据目标状态添加或移除星标。
      if (input.flagged) {
        await addImapFlags(imap, imapUid, ["\\Flagged"]);
      } else {
        await removeImapFlags(imap, imapUid, ["\\Flagged"]);
      }
      logger.debug(
        {
          accountEmail: normalizedEmail,
          mailboxPath: row.mailboxPath,
          externalId: row.externalId,
          flagged: input.flagged,
        },
        "email message flagged updated",
      );
    }
    await input.prisma.emailMessage.update({
      where: { id: row.id },
      data: {
        flags: input.flagged
          ? ensureFlaggedFlag(existingFlags)
          : removeFlaggedFlag(existingFlags),
      },
    });
    // 逻辑：双写文件系统 flags。
    const updatedFlags = input.flagged
      ? ensureFlaggedFlag(existingFlags)
      : removeFlaggedFlag(existingFlags);
    void updateEmailFlagsFile({
      workspaceId: input.workspaceId,
      accountEmail: row.accountEmail,
      mailboxPath: row.mailboxPath,
      externalId: row.externalId,
      flags: updatedFlags,
    }).catch((err) => {
      logger.warn({ err, id: row.id }, "email file store flags update failed");
    });
    logger.info(
      {
        accountEmail: row.accountEmail,
        mailboxPath: row.mailboxPath,
        externalId: row.externalId,
        flagged: input.flagged,
        durationMs: Date.now() - startedAt,
      },
      "email set flagged completed",
    );
  } catch (error) {
    logger.error(
      { err: error, messageId: input.id, workspaceId: input.workspaceId },
      "email set flagged failed",
    );
    throw error;
  } finally {
    if (imap) {
      logger.debug(
        { ...closeContext },
        "email imap closing",
      );
      // 逻辑：确保连接关闭，避免资源泄漏；超时则强制结束等待。
      let settled = false;
      const finish = (reason: "end" | "close" | "timeout") => {
        if (settled) return;
        settled = true;
        logger.debug(
          { ...closeContext, reason },
          "email imap closed (finalize)",
        );
      };
      const timeout = setTimeout(() => {
        finish("timeout");
      }, CLOSE_TIMEOUT_MS);
      try {
        await new Promise<void>((resolve) => {
          imap?.once("end", () => {
            finish("end");
            resolve();
          });
          imap?.once("close", () => {
            finish("close");
            resolve();
          });
          imap?.end();
        });
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
