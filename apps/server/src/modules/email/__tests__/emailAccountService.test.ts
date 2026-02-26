/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setWorkspaces } from "@openloaf/api/services/workspaceConfig";
import type { Workspace } from "@openloaf/api";
import { setOpenLoafRootOverride } from "@openloaf/config";

const tempRoot = mkdtempSync(path.join(tmpdir(), "openloaf-email-account-"));
process.env.OPENLOAF_SERVER_ENV_PATH = path.join(tempRoot, ".env");
setOpenLoafRootOverride(tempRoot);

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

assert.equal(account.auth.type, "password");
if (account.auth.type === "password") {
  assert.equal(account.auth.envKey, expectedEnvKey);
}

const envContent = readFileSync(process.env.OPENLOAF_SERVER_ENV_PATH!, "utf-8");
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

setOpenLoafRootOverride(null);

console.log("email account service tests passed.");
