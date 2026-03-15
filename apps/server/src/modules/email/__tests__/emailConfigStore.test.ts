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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { setOpenLoafRootOverride } from "@openloaf/config";
import {
  getEmailConfigPath,
  readEmailConfigFile,
  writeEmailConfigFile,
  type EmailConfigFile,
} from "../emailConfigStore";

const configRoot = mkdtempSync(path.join(tmpdir(), "openloaf-email-config-"));
setOpenLoafRootOverride(configRoot);

const configPath = getEmailConfigPath();
const initial = readEmailConfigFile();
assert.deepEqual(initial.emailAccounts, []);
assert.ok(existsSync(configPath));

const payload: EmailConfigFile = {
  emailAccounts: [
    {
      emailAddress: "user@example.com",
      label: "Work",
      imap: { host: "imap.example.com", port: 993, tls: true },
      smtp: { host: "smtp.example.com", port: 465, tls: true },
      auth: {
        type: "password",
        envKey: "EMAIL_PASSWORD__default__user_example_com",
      },
      sync: {
        mailboxes: {
          INBOX: { uidValidity: 123, highestUid: 456 },
        },
      },
      status: { lastSyncAt: "2026-01-30T12:00:00Z", lastError: null },
    },
  ],
  privateSenders: [],
};

writeEmailConfigFile(payload);
const persisted = readEmailConfigFile();
assert.equal(persisted.emailAccounts.length, 1);
assert.equal(persisted.emailAccounts[0]?.emailAddress, "user@example.com");

writeFileSync(configPath, "{not-json}", "utf-8");
const fallback = readEmailConfigFile();
assert.equal(fallback.emailAccounts.length, 1);

const raw = readFileSync(configPath, "utf-8");
assert.ok(raw.includes("emailAccounts"));

setOpenLoafRootOverride(null);

console.log("email config store tests passed.");
