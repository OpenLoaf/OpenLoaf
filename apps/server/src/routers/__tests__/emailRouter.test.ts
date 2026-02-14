import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setWorkspaces } from "@tenas-ai/api/services/workspaceConfig";
import type { Workspace } from "@tenas-ai/api";
import { setTenasRootOverride } from "@tenas-ai/config";

const tempRoot = mkdtempSync(path.join(tmpdir(), "tenas-email-router-"));
process.env.TENAS_SERVER_ENV_PATH = path.join(tempRoot, ".env");
process.env.EMAIL_SYNC_ON_ADD = "0";
process.env.EMAIL_IMAP_SKIP = "1";
setTenasRootOverride(tempRoot);

const workspaceRoot = path.join(tempRoot, "workspace");
const workspaceId = "workspace-test";

const workspace: Workspace = {
  id: workspaceId,
  name: "Test Workspace",
  type: "local",
  isActive: true,
  rootUri: pathToFileURL(workspaceRoot).href,
  projects: {},
  ignoreSkills: [],
};

setWorkspaces([workspace]);

const { prisma } = await import("@tenas-ai/db");

let emailRouter: typeof import("../email");
try {
  emailRouter = await import("../email");
} catch {
  assert.fail("email router module should exist.");
}

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "EmailMessage" (
    "id" TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "mailboxPath" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "messageId" TEXT,
    "subject" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "bcc" TEXT,
    "date" DATETIME,
    "flags" TEXT,
    "snippet" TEXT,
    "attachments" TEXT,
    "size" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );
`);
await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "EmailMailbox" (
    "id" TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentPath" TEXT,
    "delimiter" TEXT,
    "attributes" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 999,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );
`);

const caller = (emailRouter as any).emailRouterImplementation.createCaller({
  prisma,
  session: null,
});

const empty = await caller.listAccounts({ workspaceId });
assert.equal(empty.length, 0);

const created = await caller.addAccount({
  authType: "password",
  workspaceId,
  emailAddress: "user@example.com",
  label: "Work",
  imap: { host: "imap.example.com", port: 993, tls: true },
  smtp: { host: "smtp.example.com", port: 465, tls: true },
  password: "secret",
});

assert.equal(created.emailAddress, "user@example.com");

const list = await caller.listAccounts({ workspaceId });
assert.equal(list.length, 1);
assert.equal(list[0]?.emailAddress, "user@example.com");

await prisma.emailMailbox.create({
  data: {
    id: "mailbox-1",
    workspaceId,
    accountEmail: "user@example.com",
    path: "INBOX",
    name: "收件箱",
    parentPath: null,
    delimiter: "/",
    attributes: ["\\Inbox"],
  },
});

const mailboxes = await caller.listMailboxes({
  workspaceId,
  accountEmail: "user@example.com",
});
assert.equal(mailboxes.length, 1);
assert.equal(mailboxes[0]?.path, "INBOX");

await prisma.emailMessage.create({
  data: {
    id: "msg-1",
    workspaceId,
    accountEmail: "user@example.com",
    mailboxPath: "INBOX",
    externalId: "1",
    subject: "Hello",
    from: {
      value: [{ address: "alice@example.com", name: "Alice" }],
      text: "Alice <alice@example.com>",
    },
    to: {
      value: [{ address: "user@example.com", name: "User" }],
      text: "User <user@example.com>",
    },
    date: new Date("2026-01-30T00:00:00Z"),
    flags: [],
    snippet: "Hi there",
  },
});

const messages = await caller.listMessages({
  workspaceId,
  accountEmail: "user@example.com",
  mailbox: "INBOX",
});
assert.equal(messages.items.length, 1);
assert.equal(messages.items[0]?.subject, "Hello");
assert.equal(messages.items[0]?.unread, true);

const markReadResult = await caller.markMessageRead({
  workspaceId,
  id: "msg-1",
});
assert.equal(markReadResult.ok, true);

const afterMark = await caller.listMessages({
  workspaceId,
  accountEmail: "user@example.com",
  mailbox: "INBOX",
});
assert.equal(afterMark.items[0]?.unread, false);

await caller.addAccount({
  workspaceId,
  emailAddress: "user2@example.com",
  label: "Personal",
  imap: { host: "imap.personal.com", port: 993, tls: true },
  smtp: { host: "smtp.personal.com", port: 465, tls: true },
  password: "secret",
});

await prisma.emailMailbox.create({
  data: {
    id: "mailbox-2",
    workspaceId,
    accountEmail: "user2@example.com",
    path: "INBOX",
    name: "收件箱",
    parentPath: null,
    delimiter: "/",
    attributes: ["\\Inbox"],
  },
});

await prisma.emailMailbox.create({
  data: {
    id: "mailbox-3",
    workspaceId,
    accountEmail: "user@example.com",
    path: "Drafts",
    name: "草稿箱",
    parentPath: null,
    delimiter: "/",
    attributes: ["\\Drafts"],
  },
});

await prisma.emailMailbox.create({
  data: {
    id: "mailbox-4",
    workspaceId,
    accountEmail: "user@example.com",
    path: "Sent",
    name: "已发送",
    parentPath: null,
    delimiter: "/",
    attributes: ["\\Sent"],
  },
});

await prisma.emailMessage.create({
  data: {
    id: "msg-2",
    workspaceId,
    accountEmail: "user@example.com",
    mailboxPath: "INBOX",
    externalId: "2",
    subject: "Unread 1",
    from: {
      value: [{ address: "bob@example.com", name: "Bob" }],
      text: "Bob <bob@example.com>",
    },
    to: {
      value: [{ address: "user@example.com", name: "User" }],
      text: "User <user@example.com>",
    },
    date: new Date("2026-01-30T01:00:00Z"),
    flags: [],
    snippet: "Unread message",
  },
});

await prisma.emailMessage.create({
  data: {
    id: "msg-3",
    workspaceId,
    accountEmail: "user2@example.com",
    mailboxPath: "INBOX",
    externalId: "1",
    subject: "Unread 2",
    from: {
      value: [{ address: "carol@example.com", name: "Carol" }],
      text: "Carol <carol@example.com>",
    },
    to: {
      value: [{ address: "user2@example.com", name: "User2" }],
      text: "User2 <user2@example.com>",
    },
    date: new Date("2026-01-30T02:00:00Z"),
    flags: [],
    snippet: "Unread message",
  },
});

await prisma.emailMessage.create({
  data: {
    id: "msg-4",
    workspaceId,
    accountEmail: "user2@example.com",
    mailboxPath: "INBOX",
    externalId: "2",
    subject: "Seen",
    from: {
      value: [{ address: "dan@example.com", name: "Dan" }],
      text: "Dan <dan@example.com>",
    },
    to: {
      value: [{ address: "user2@example.com", name: "User2" }],
      text: "User2 <user2@example.com>",
    },
    date: new Date("2026-01-30T03:00:00Z"),
    flags: ["\\Seen"],
    snippet: "Seen message",
  },
});

await prisma.emailMessage.create({
  data: {
    id: "msg-5",
    workspaceId,
    accountEmail: "user@example.com",
    mailboxPath: "Drafts",
    externalId: "3",
    subject: "Draft",
    from: {
      value: [{ address: "user@example.com", name: "User" }],
      text: "User <user@example.com>",
    },
    to: {
      value: [{ address: "eva@example.com", name: "Eva" }],
      text: "Eva <eva@example.com>",
    },
    date: new Date("2026-01-30T04:00:00Z"),
    flags: [],
    snippet: "Draft content",
  },
});

await prisma.emailMessage.create({
  data: {
    id: "msg-6",
    workspaceId,
    accountEmail: "user@example.com",
    mailboxPath: "Sent",
    externalId: "4",
    subject: "Sent",
    from: {
      value: [{ address: "user@example.com", name: "User" }],
      text: "User <user@example.com>",
    },
    to: {
      value: [{ address: "frank@example.com", name: "Frank" }],
      text: "Frank <frank@example.com>",
    },
    date: new Date("2026-01-30T05:00:00Z"),
    flags: ["\\Seen"],
    snippet: "Sent content",
  },
});

await prisma.emailMessage.create({
  data: {
    id: "msg-7",
    workspaceId,
    accountEmail: "user2@example.com",
    mailboxPath: "INBOX",
    externalId: "3",
    subject: "Flagged",
    from: {
      value: [{ address: "gina@example.com", name: "Gina" }],
      text: "Gina <gina@example.com>",
    },
    to: {
      value: [{ address: "user2@example.com", name: "User2" }],
      text: "User2 <user2@example.com>",
    },
    date: new Date("2026-01-30T06:00:00Z"),
    flags: ["\\Flagged"],
    snippet: "Flagged content",
  },
});

const unreadCount = await caller.listUnreadCount({ workspaceId });
assert.equal(unreadCount.count, 4);

const mailboxUnreadStats = await caller.listMailboxUnreadStats({ workspaceId });
const inboxStats = mailboxUnreadStats.find(
  (stat: { accountEmail: string; mailboxPath: string }) =>
    stat.accountEmail === "user@example.com" && stat.mailboxPath === "INBOX",
);
assert.equal(inboxStats?.unreadCount, 1);

const unifiedStats = await caller.listUnifiedUnreadStats({ workspaceId });
assert.equal(unifiedStats.allInboxes, 3);
assert.equal(unifiedStats.flagged, 1);
assert.equal(unifiedStats.drafts, 1);
assert.equal(unifiedStats.sent, 0);

const unifiedInboxes = await caller.listUnifiedMessages({
  workspaceId,
  scope: "all-inboxes",
});
assert.ok(unifiedInboxes.items.length >= 3);

const unifiedFlagged = await caller.listUnifiedMessages({
  workspaceId,
  scope: "flagged",
});
assert.ok(
  unifiedFlagged.items.some((item: { subject: string }) => item.subject === "Flagged"),
);

const detail = await caller.getMessage({ workspaceId, id: "msg-1" });
assert.equal(detail.subject, "Hello");
// 逻辑：bodyHtml 现在从文件系统读取，测试环境中未写入文件，所以为 undefined。
assert.ok(detail.from.some((entry: string) => entry.includes("alice@example.com")));
assert.ok(detail.flags.some((flag: string) => flag.toUpperCase() === "\\SEEN"));

await prisma.$disconnect();

console.log("email router tests passed.");

setTenasRootOverride(null);
