import Imap from "imap";

import type { PrismaClient } from "@tenas-ai/db";
import { logger } from "@/common/logger";
import { readEmailConfigFile, writeEmailConfigFile } from "./emailConfigStore";
import { getEmailEnvValue } from "./emailEnvStore";

/** Env key for skipping IMAP operations. */
const SKIP_IMAP_ENV_KEY = "EMAIL_IMAP_SKIP";

type EmailMailboxEntry = {
  path: string;
  name: string;
  parentPath: string | null;
  delimiter?: string;
  attributes: string[];
};

/** Normalize mailbox attributes for matching. */
function normalizeMailboxAttributes(attributes: string[]): string[] {
  return attributes.map((attr) => attr.trim().toUpperCase());
}

/** Resolve mailbox sort weight. */
function resolveMailboxSort(entry: EmailMailboxEntry): number {
  const attributes = normalizeMailboxAttributes(entry.attributes);
  const path = entry.path.toLowerCase();
  if (attributes.includes("\\INBOX") || entry.path.toUpperCase() === "INBOX") return 0;
  if (attributes.includes("\\DRAFTS") || path.includes("draft")) return 10;
  if (attributes.includes("\\SENT") || path.includes("sent")) return 20;
  if (attributes.includes("\\JUNK") || attributes.includes("\\SPAM") || path.includes("junk") || path.includes("spam")) return 30;
  if (attributes.includes("\\TRASH") || path.includes("trash") || path.includes("deleted")) return 40;
  return 100;
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

/** Update mailbox sync status for an account. */
function updateMailboxSyncStatus(input: {
  workspaceId: string;
  accountEmail: string;
  lastMailboxSyncAt?: string;
  lastMailboxSyncError?: string | null;
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
    ...(input.lastMailboxSyncAt
      ? { lastMailboxSyncAt: input.lastMailboxSyncAt }
      : null),
    ...(input.lastMailboxSyncError !== undefined
      ? { lastMailboxSyncError: input.lastMailboxSyncError }
      : null),
  };
  const nextAccount = {
    ...target,
    status: nextStatus,
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

/** Fetch mailbox tree. */
async function fetchImapMailboxes(imap: Imap): Promise<Imap.MailBoxes> {
  return new Promise((resolve, reject) => {
    imap.getBoxes((error, boxes) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(boxes);
    });
  });
}

/** Flatten mailbox tree into entries. */
function flattenMailboxes(
  boxes: Imap.MailBoxes,
  parentPath: string | null = null,
): EmailMailboxEntry[] {
  const entries: EmailMailboxEntry[] = [];
  Object.entries(boxes).forEach(([name, box]) => {
    const delimiter = typeof box.delimiter === "string" ? box.delimiter : "/";
    const path = parentPath ? `${parentPath}${delimiter}${name}` : name;
    const attributes = Array.isArray(box.attribs) ? box.attribs.map(String) : [];
    entries.push({
      path,
      name,
      parentPath,
      delimiter,
      attributes,
    });
    if (box.children) {
      entries.push(...flattenMailboxes(box.children, path));
    }
  });
  return entries;
}

/** Sync mailbox list from IMAP into database. */
export async function syncEmailMailboxes(input: {
  prisma: PrismaClient;
  workspaceId: string;
  accountEmail: string;
}): Promise<EmailMailboxEntry[]> {
  const startedAt = Date.now();
  let imap: Imap | null = null;
  try {
    const { account, password, normalizedEmail } = resolveEmailAccountCredential(
      input.workspaceId,
      input.accountEmail,
    );
    if (shouldSkipImapOperations()) {
      logger.warn(
        { accountEmail: normalizedEmail },
        "email imap mailbox sync skipped",
      );
      updateMailboxSyncStatus({
        workspaceId: input.workspaceId,
        accountEmail: normalizedEmail,
        lastMailboxSyncAt: new Date().toISOString(),
        lastMailboxSyncError: null,
      });
      return [];
    }
    imap = new Imap({
      user: account.emailAddress,
      password,
      host: account.imap!.host,
      port: account.imap!.port,
      tls: account.imap!.tls,
    });
    imap.on("error", (error) => {
      logger.error({ err: error, accountEmail: normalizedEmail }, "email imap error");
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
    logger.debug({ accountEmail: normalizedEmail }, "email imap ready");
    const boxes = await fetchImapMailboxes(imap);
    const entries = flattenMailboxes(boxes).sort((a, b) => {
      const sortDiff = resolveMailboxSort(a) - resolveMailboxSort(b);
      if (sortDiff !== 0) return sortDiff;
      return a.path.localeCompare(b.path);
    });
    for (const entry of entries) {
      const sort = resolveMailboxSort(entry);
      await input.prisma.emailMailbox.upsert({
        where: {
          workspaceId_accountEmail_path: {
            workspaceId: input.workspaceId,
            accountEmail: normalizedEmail,
            path: entry.path,
          },
        },
        create: {
          id: `${input.workspaceId}-${normalizedEmail}-${entry.path}`,
          workspaceId: input.workspaceId,
          accountEmail: normalizedEmail,
          path: entry.path,
          name: entry.name,
          parentPath: entry.parentPath,
          delimiter: entry.delimiter ?? null,
          attributes: entry.attributes,
          sort,
        },
        update: {
          name: entry.name,
          parentPath: entry.parentPath,
          delimiter: entry.delimiter ?? null,
          attributes: entry.attributes,
        },
      });
    }
    updateMailboxSyncStatus({
      workspaceId: input.workspaceId,
      accountEmail: normalizedEmail,
      lastMailboxSyncAt: new Date().toISOString(),
      lastMailboxSyncError: null,
    });
    logger.info(
      {
        accountEmail: normalizedEmail,
        total: entries.length,
        durationMs: Date.now() - startedAt,
      },
      "email mailbox sync completed",
    );
    return entries;
  } catch (error) {
    logger.error(
      { err: error, accountEmail: input.accountEmail },
      "email mailbox sync failed",
    );
    updateMailboxSyncStatus({
      workspaceId: input.workspaceId,
      accountEmail: input.accountEmail,
      lastMailboxSyncError: error instanceof Error ? error.message : "同步失败",
    });
    throw error;
  } finally {
    if (imap) {
      logger.debug({ accountEmail: input.accountEmail }, "email imap closing");
      // 逻辑：确保连接关闭，避免资源泄漏；超时则强制结束等待。
      let settled = false;
      const finish = (reason: "end" | "close" | "timeout") => {
        if (settled) return;
        settled = true;
        logger.debug(
          { accountEmail: input.accountEmail, reason },
          "email imap closed (finalize)",
        );
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        logger.warn({ accountEmail: input.accountEmail }, "email imap end timeout");
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
            { accountEmail: input.accountEmail, reason },
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
