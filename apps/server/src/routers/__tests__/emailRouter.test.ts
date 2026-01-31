import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setWorkspaces } from "@tenas-ai/api/services/workspaceConfig";
import type { Workspace } from "@tenas-ai/api";

const tempRoot = mkdtempSync(path.join(tmpdir(), "tenas-email-router-"));
process.env.TENAS_CONF_PATH = path.join(tempRoot, "config.json");
process.env.TENAS_SERVER_ENV_PATH = path.join(tempRoot, ".env");
process.env.DATABASE_URL = `file:${path.join(tempRoot, "email.db")}`;
process.env.EMAIL_SYNC_ON_ADD = "0";
process.env.EMAIL_IMAP_SKIP = "1";

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
    "uid" INTEGER NOT NULL,
    "messageId" TEXT,
    "subject" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "bcc" TEXT,
    "date" DATETIME,
    "flags" TEXT,
    "snippet" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "attachments" TEXT,
    "rawRfc822" TEXT,
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
    uid: 1,
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
    bodyHtml: "<p>Hi</p>",
  },
});

const messages = await caller.listMessages({
  workspaceId,
  accountEmail: "user@example.com",
  mailbox: "INBOX",
});
assert.equal(messages.length, 1);
assert.equal(messages[0]?.subject, "Hello");
assert.equal(messages[0]?.unread, true);

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
assert.equal(afterMark[0]?.unread, false);

const detail = await caller.getMessage({ workspaceId, id: "msg-1" });
assert.equal(detail.subject, "Hello");
assert.equal(detail.bodyHtml, "<p>Hi</p>");
assert.ok(detail.from.some((entry: string) => entry.includes("alice@example.com")));
assert.ok(detail.flags.some((flag: string) => flag.toUpperCase() === "\\SEEN"));

await prisma.$disconnect();

console.log("email router tests passed.");
