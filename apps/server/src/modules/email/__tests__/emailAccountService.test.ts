import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setWorkspaces } from "@tenas-ai/api/services/workspaceConfig";
import type { Workspace } from "@tenas-ai/api";

const tempRoot = mkdtempSync(path.join(tmpdir(), "tenas-email-account-"));
process.env.TENAS_CONF_PATH = path.join(tempRoot, "config.json");
process.env.TENAS_SERVER_ENV_PATH = path.join(tempRoot, ".env");

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

let emailAccountService: typeof import("../emailAccountService");
try {
  emailAccountService = await import("../emailAccountService");
} catch {
  assert.fail("emailAccountService module should exist.");
}

const { addEmailAccount } = emailAccountService;

const emailAddress = "User+Test@example.com";
const password = "app-password";

const account = addEmailAccount({
  workspaceId,
  emailAddress,
  label: "Work",
  imap: { host: "imap.example.com", port: 993, tls: true },
  smtp: { host: "smtp.example.com", port: 465, tls: true },
  password,
});

const expectedSlug = emailAddress
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "_")
  .replace(/^_+|_+$/g, "");
const expectedEnvKey = `EMAIL_PASSWORD__${workspaceId}__${expectedSlug}`;

assert.equal(account.auth.envKey, expectedEnvKey);

const envContent = readFileSync(process.env.TENAS_SERVER_ENV_PATH!, "utf-8");
assert.ok(envContent.includes(`${expectedEnvKey}=${password}`));

let duplicateError: unknown = null;
try {
  addEmailAccount({
    workspaceId,
    emailAddress,
    imap: { host: "imap.example.com", port: 993, tls: true },
    smtp: { host: "smtp.example.com", port: 465, tls: true },
    password: "another",
  });
} catch (err) {
  duplicateError = err;
}

assert.ok(duplicateError instanceof Error);

console.log("email account service tests passed.");
