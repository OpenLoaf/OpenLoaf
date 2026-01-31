import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { Workspace } from "@tenas-ai/api";
import {
  getActiveWorkspaceConfig,
  getWorkspaceByIdConfig,
  resolveWorkspaceRootPath,
} from "@tenas-ai/api/services/workspaceConfig";

/** Schema for email account sync state. */
const EmailMailboxSyncSchema = z.object({
  uidValidity: z.number().int().optional().describe("IMAP UIDVALIDITY value."),
  highestUid: z.number().int().optional().describe("Highest synced UID."),
});

/** Schema for email account sync info. */
const EmailAccountSyncSchema = z
  .object({
    mailboxes: z
      .record(z.string(), EmailMailboxSyncSchema)
      .default({})
      .describe("Mailbox sync states keyed by mailbox path."),
  })
  .default({ mailboxes: {} });

/** Schema for email account status. */
const EmailAccountStatusSchema = z
  .object({
    lastSyncAt: z.string().datetime().optional().describe("Last sync time ISO string."),
    lastError: z.string().nullable().optional().describe("Last sync error message."),
    lastMailboxSyncAt: z
      .string()
      .datetime()
      .optional()
      .describe("Last mailbox sync time ISO string."),
    lastMailboxSyncError: z
      .string()
      .nullable()
      .optional()
      .describe("Last mailbox sync error message."),
  })
  .default({});

/** Schema for email account auth. */
const EmailAccountAuthSchema = z.object({
  type: z.enum(["password"]).describe("Auth type for email account."),
  envKey: z.string().min(1).describe("Env key storing the password."),
});

/** Schema for IMAP configuration. */
const EmailAccountImapSchema = z.object({
  host: z.string().min(1).describe("IMAP host."),
  port: z.number().int().min(1).describe("IMAP port."),
  tls: z.boolean().describe("Whether IMAP uses TLS."),
});

/** Schema for SMTP configuration. */
const EmailAccountSmtpSchema = z.object({
  host: z.string().min(1).describe("SMTP host."),
  port: z.number().int().min(1).describe("SMTP port."),
  tls: z.boolean().describe("Whether SMTP uses TLS."),
});

/** Schema for email account. */
const EmailAccountSchema = z.object({
  emailAddress: z.string().min(1).describe("Email address."),
  label: z.string().optional().describe("Account label."),
  imap: EmailAccountImapSchema,
  smtp: EmailAccountSmtpSchema,
  auth: EmailAccountAuthSchema,
  sync: EmailAccountSyncSchema.optional().default({ mailboxes: {} }),
  status: EmailAccountStatusSchema.optional().default({}),
});

/** Schema for email.json file. */
const EmailConfigFileSchema = z.object({
  emailAccounts: z.array(EmailAccountSchema).default([]).describe("Email account list."),
  privateSenders: z.array(z.string()).default([]).describe("Private sender emails."),
});

export type EmailConfigFile = z.infer<typeof EmailConfigFileSchema>;

/** Cache for last valid email config per workspace path. */
const cachedEmailConfigByPath = new Map<string, EmailConfigFile>();

/** Resolve workspace config by id or active workspace. */
function resolveWorkspaceConfig(workspaceId?: string): Workspace {
  const workspace = workspaceId
    ? getWorkspaceByIdConfig(workspaceId)
    : getActiveWorkspaceConfig();
  if (!workspace) {
    throw new Error("Workspace not found.");
  }
  return workspace;
}

/** Normalize private sender email. */
function normalizePrivateSender(email: string): string {
  // 逻辑：统一大小写并去除首尾空格，确保匹配一致。
  return email.trim().toLowerCase();
}

/** Resolve email.json path for the workspace. */
export function getEmailConfigPath(workspaceId?: string): string {
  const workspace = resolveWorkspaceConfig(workspaceId);
  const rootPath = resolveWorkspaceRootPath(workspace.rootUri);
  return path.join(rootPath, "email.json");
}

/** Ensure email.json exists with default payload. */
function ensureDefaultEmailConfigFile(workspaceId?: string): EmailConfigFile {
  const payload: EmailConfigFile = { emailAccounts: [] };
  writeEmailConfigFile(payload, workspaceId);
  return payload;
}

/** Read email.json payload safely. */
export function readEmailConfigFile(workspaceId?: string): EmailConfigFile {
  const filePath = getEmailConfigPath(workspaceId);
  if (!existsSync(filePath)) {
    return ensureDefaultEmailConfigFile(workspaceId);
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    const parsed = EmailConfigFileSchema.parse(raw);
    cachedEmailConfigByPath.set(filePath, parsed);
    return parsed;
  } catch {
    const cached = cachedEmailConfigByPath.get(filePath);
    if (cached) {
      // 逻辑：解析失败时回退缓存，并修复文件内容。
      writeEmailConfigFile(cached, workspaceId);
      return cached;
    }
    // 逻辑：解析失败时回退为默认配置，避免运行中断。
    return ensureDefaultEmailConfigFile(workspaceId);
  }
}

/** Write email.json payload atomically. */
export function writeEmailConfigFile(payload: EmailConfigFile, workspaceId?: string): void {
  const filePath = getEmailConfigPath(workspaceId);
  const dirPath = path.dirname(filePath);
  // 逻辑：确保目录存在，避免写入失败。
  mkdirSync(dirPath, { recursive: true });
  const normalized = EmailConfigFileSchema.parse(payload);
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  // 逻辑：原子写入，避免读取时遇到半写入状态。
  writeFileSync(tmpPath, JSON.stringify(normalized, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
  cachedEmailConfigByPath.set(filePath, normalized);
}

/** List private senders stored in email.json. */
export function listPrivateSenders(workspaceId?: string): string[] {
  const config = readEmailConfigFile(workspaceId);
  return config.privateSenders?.map((sender) => normalizePrivateSender(sender)) ?? [];
}

/** Add a private sender to email.json. */
export function addPrivateSender(input: {
  workspaceId?: string;
  senderEmail: string;
}): EmailConfigFile {
  const normalized = normalizePrivateSender(input.senderEmail);
  if (!normalized) {
    throw new Error("发件人地址不能为空。");
  }
  const config = readEmailConfigFile(input.workspaceId);
  const existing = new Set(
    (config.privateSenders ?? []).map((sender) => normalizePrivateSender(sender)),
  );
  if (!existing.has(normalized)) {
    existing.add(normalized);
    const next = {
      ...config,
      privateSenders: Array.from(existing),
    };
    writeEmailConfigFile(next, input.workspaceId);
    return next;
  }
  return config;
}

/** Remove a private sender from email.json. */
export function removePrivateSender(input: {
  workspaceId?: string;
  senderEmail: string;
}): EmailConfigFile {
  const normalized = normalizePrivateSender(input.senderEmail);
  if (!normalized) {
    throw new Error("发件人地址不能为空。");
  }
  const config = readEmailConfigFile(input.workspaceId);
  const nextSenders = (config.privateSenders ?? []).filter(
    (sender) => normalizePrivateSender(sender) !== normalized,
  );
  if (nextSenders.length === (config.privateSenders ?? []).length) {
    return config;
  }
  const next = {
    ...config,
    privateSenders: nextSenders,
  };
  writeEmailConfigFile(next, input.workspaceId);
  return next;
}
