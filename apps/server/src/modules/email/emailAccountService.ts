import { z } from "zod";

import { readEmailConfigFile, writeEmailConfigFile } from "./emailConfigStore";
import type { EmailConfigFile } from "./emailConfigStore";
import { removeEmailEnvValue, setEmailEnvValue } from "./emailEnvStore";

const emailAccountInputSchema = z.object({
  workspaceId: z.string().min(1),
  emailAddress: z.string().min(1),
  label: z.string().optional(),
  imap: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1),
    tls: z.boolean(),
  }),
  smtp: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1),
    tls: z.boolean(),
  }),
  password: z.string().min(1),
});

const oauthAccountInputSchema = z.object({
  workspaceId: z.string().min(1),
  emailAddress: z.string().min(1),
  label: z.string().optional(),
  authType: z.enum(["oauth2-graph", "oauth2-gmail"]),
});

export type EmailAccountInput = z.infer<typeof emailAccountInputSchema>;
export type OAuthAccountInput = z.infer<typeof oauthAccountInputSchema>;

/** Normalize email address for storage and comparison. */
function normalizeEmailAddress(emailAddress: string): string {
  return emailAddress.trim().toLowerCase();
}

/** Convert email address into slug for env key. */
export function toEmailSlug(emailAddress: string): string {
  return normalizeEmailAddress(emailAddress)
    .replace(/[^a-z0-9]/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Build env key for email password. */
export function buildEmailPasswordEnvKey(workspaceId: string, emailAddress: string): string {
  const slug = toEmailSlug(emailAddress);
  return `EMAIL_PASSWORD__${workspaceId}__${slug}`;
}

/** Build env keys for OAuth tokens. */
export function buildOAuthEnvKeys(workspaceId: string, emailAddress: string) {
  const slug = toEmailSlug(emailAddress);
  return {
    refreshTokenEnvKey: `EMAIL_OAUTH_REFRESH__${workspaceId}__${slug}`,
    accessTokenEnvKey: `EMAIL_OAUTH_ACCESS__${workspaceId}__${slug}`,
    expiresAtEnvKey: `EMAIL_OAUTH_EXPIRES__${workspaceId}__${slug}`,
  };
}

/** Add a new email account to email.json and .env. */
export function addEmailAccount(input: EmailAccountInput) {
  const parsed = emailAccountInputSchema.parse(input);
  const normalizedEmail = normalizeEmailAddress(parsed.emailAddress);
  const envKey = buildEmailPasswordEnvKey(parsed.workspaceId, normalizedEmail);

  const config = readEmailConfigFile(parsed.workspaceId);
  const exists = config.emailAccounts.some(
    (account) => normalizeEmailAddress(account.emailAddress) === normalizedEmail,
  );
  if (exists) {
    throw new Error("邮箱账号已存在。");
  }

  const nextAccount: EmailConfigFile["emailAccounts"][number] = {
    emailAddress: normalizedEmail,
    label: parsed.label,
    imap: parsed.imap,
    smtp: parsed.smtp,
    auth: {
      type: "password",
      envKey,
    },
    sync: {
      mailboxes: {},
    },
    status: {
      lastError: null,
    },
  };

  // 逻辑：先写入密码，确保配置落地时 env 可用。
  setEmailEnvValue(envKey, parsed.password);

  const nextConfig = {
    ...config,
    emailAccounts: [...config.emailAccounts, nextAccount],
    privateSenders: config.privateSenders ?? [],
  };
  writeEmailConfigFile(nextConfig, parsed.workspaceId);

  return nextAccount;
}

/** Add a new OAuth email account to email.json. */
export function addOAuthEmailAccount(input: OAuthAccountInput) {
  const parsed = oauthAccountInputSchema.parse(input);
  const normalizedEmail = normalizeEmailAddress(parsed.emailAddress);
  const envKeys = buildOAuthEnvKeys(parsed.workspaceId, normalizedEmail);

  const config = readEmailConfigFile(parsed.workspaceId);
  const exists = config.emailAccounts.some(
    (account) => normalizeEmailAddress(account.emailAddress) === normalizedEmail,
  );
  if (exists) {
    throw new Error("邮箱账号已存在。");
  }

  const nextAccount: EmailConfigFile["emailAccounts"][number] = {
    emailAddress: normalizedEmail,
    label: parsed.label,
    auth: {
      type: parsed.authType,
      ...envKeys,
    },
    sync: {
      mailboxes: {},
    },
    status: {
      lastError: null,
    },
  };

  const nextConfig = {
    ...config,
    emailAccounts: [...config.emailAccounts, nextAccount],
    privateSenders: config.privateSenders ?? [],
  };
  writeEmailConfigFile(nextConfig, parsed.workspaceId);

  return nextAccount;
}

/** Remove an email account from email.json and clean up its env entries. */
export function removeEmailAccount(input: {
  workspaceId: string;
  emailAddress: string;
}): void {
  const normalizedEmail = normalizeEmailAddress(input.emailAddress);
  const config = readEmailConfigFile(input.workspaceId);
  const account = config.emailAccounts.find(
    (item) => normalizeEmailAddress(item.emailAddress) === normalizedEmail,
  );
  if (!account) {
    throw new Error("邮箱账号不存在。");
  }

  const nextConfig = {
    ...config,
    emailAccounts: config.emailAccounts.filter(
      (item) => normalizeEmailAddress(item.emailAddress) !== normalizedEmail,
    ),
  };
  writeEmailConfigFile(nextConfig, input.workspaceId);

  // 逻辑：清理 .env 中的凭据条目。
  if (account.auth.type === "password") {
    removeEmailEnvValue(account.auth.envKey);
  } else {
    removeEmailEnvValue(account.auth.refreshTokenEnvKey);
    removeEmailEnvValue(account.auth.accessTokenEnvKey);
    removeEmailEnvValue(account.auth.expiresAtEnvKey);
  }
}
