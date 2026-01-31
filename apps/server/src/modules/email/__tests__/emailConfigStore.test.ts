import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setWorkspaces } from "@tenas-ai/api/services/workspaceConfig";
import type { Workspace } from "@tenas-ai/api";

let emailConfig: typeof import("../emailConfigStore");
try {
  emailConfig = await import("../emailConfigStore");
} catch {
  assert.fail("emailConfigStore module should exist.");
}

const { getEmailConfigPath, readEmailConfigFile, writeEmailConfigFile } = emailConfig;

const configRoot = mkdtempSync(path.join(tmpdir(), "tenas-email-config-"));
process.env.TENAS_CONF_PATH = path.join(configRoot, "config.json");

const workspaceRoot = path.join(configRoot, "workspace-root");
const workspace: Workspace = {
  id: "workspace-test",
  name: "Test Workspace",
  type: "local",
  isActive: true,
  rootUri: pathToFileURL(workspaceRoot).href,
  projects: {},
  ignoreSkills: [],
};

setWorkspaces([workspace]);

const configPath = getEmailConfigPath(workspace.id);
const initial = readEmailConfigFile(workspace.id);
assert.deepEqual(initial.emailAccounts, []);
assert.ok(existsSync(configPath));

const payload = {
  emailAccounts: [
    {
      emailAddress: "user@example.com",
      label: "Work",
      imap: { host: "imap.example.com", port: 993, tls: true },
      smtp: { host: "smtp.example.com", port: 465, tls: true },
      auth: {
        type: "password",
        envKey: "EMAIL_PASSWORD__workspace-test__user_example_com",
      },
      sync: {
        mailboxes: {
          INBOX: { uidValidity: 123, highestUid: 456 },
        },
      },
      status: { lastSyncAt: "2026-01-30T12:00:00Z", lastError: null },
    },
  ],
};

writeEmailConfigFile(payload, workspace.id);
const persisted = readEmailConfigFile(workspace.id);
assert.equal(persisted.emailAccounts.length, 1);
assert.equal(persisted.emailAccounts[0]?.emailAddress, "user@example.com");

writeFileSync(configPath, "{not-json}", "utf-8");
const fallback = readEmailConfigFile(workspace.id);
assert.equal(fallback.emailAccounts.length, 1);

const raw = readFileSync(configPath, "utf-8");
assert.ok(raw.includes("emailAccounts"));

console.log("email config store tests passed.");
