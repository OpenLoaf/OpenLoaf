import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setWorkspaces, type Workspace } from "@tenas-ai/api/services/workspaceConfig";
import { setEmailEnvValue } from "../emailEnvStore";
import { writeEmailConfigFile } from "../emailConfigStore";
import {
  getEmailIdleManagerSnapshot,
  startEmailIdleManager,
  stopEmailIdleManager,
} from "../emailIdleManager";

const tempRoot = mkdtempSync(path.join(tmpdir(), "tenas-email-idle-"));
process.env.TENAS_CONF_PATH = path.join(tempRoot, "config.json");
process.env.TENAS_SERVER_ENV_PATH = path.join(tempRoot, ".env");
process.env.DATABASE_URL = `file:${path.join(tempRoot, "email.db")}`;
process.env.EMAIL_IDLE_ENABLED = "1";
process.env.EMAIL_IMAP_SKIP = "1";

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

writeEmailConfigFile(
  {
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
  },
  workspaceId,
);

setEmailEnvValue("EMAIL_IDLE_SECRET", "secret");

await startEmailIdleManager();

const snapshot = getEmailIdleManagerSnapshot();
assert.equal(snapshot.enabled, true);
assert.equal(snapshot.workerCount, 1);
assert.equal(snapshot.workers[0]?.status, "skipped");

await stopEmailIdleManager();

console.log("email idle manager tests passed.");
