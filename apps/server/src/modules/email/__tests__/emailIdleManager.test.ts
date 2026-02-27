/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setWorkspaces } from "@openloaf/api/services/workspaceConfig";
import type { Workspace } from "@openloaf/api/types/workspace";
import { setOpenLoafRootOverride } from "@openloaf/config";
import { setEmailEnvValue } from "../emailEnvStore";
import { writeEmailConfigFile, type EmailConfigFile } from "../emailConfigStore";
import {
  getEmailIdleManagerSnapshot,
  startEmailIdleManager,
  stopEmailIdleManager,
} from "../emailIdleManager";

const tempRoot = mkdtempSync(path.join(tmpdir(), "openloaf-email-idle-"));
process.env.OPENLOAF_SERVER_ENV_PATH = path.join(tempRoot, ".env");
process.env.EMAIL_IDLE_ENABLED = "1";
process.env.EMAIL_IMAP_SKIP = "1";
setOpenLoafRootOverride(tempRoot);

const workspaceRoot = path.join(tempRoot, "workspace");
const workspaceId = "workspace-idle-test";

const workspace: Workspace = {
  id: workspaceId,
  name: "Idle Workspace",
  type: "local",
  isActive: true,
  rootUri: pathToFileURL(workspaceRoot).href,
  projects: {},
  ignoreSkills: [],
};

setWorkspaces([workspace]);

const emailConfigPayload: EmailConfigFile = {
  emailAccounts: [
    {
      emailAddress: "idle@example.com",
      label: "Idle",
      imap: { host: "imap.example.com", port: 993, tls: true },
      smtp: { host: "smtp.example.com", port: 465, tls: true },
      auth: { type: "password", envKey: "EMAIL_IDLE_SECRET" },
      sync: { mailboxes: {} },
      status: {},
    },
  ],
  privateSenders: [],
};

writeEmailConfigFile(emailConfigPayload, workspaceId);

setEmailEnvValue("EMAIL_IDLE_SECRET", "secret");

await startEmailIdleManager();

const snapshot = getEmailIdleManagerSnapshot();
assert.equal(snapshot.enabled, true);
assert.equal(snapshot.workerCount, 1);
assert.equal(snapshot.workers[0]?.status, "skipped");

await stopEmailIdleManager();

setOpenLoafRootOverride(null);

console.log("email idle manager tests passed.");
