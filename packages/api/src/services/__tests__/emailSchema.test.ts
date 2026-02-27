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
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../../../..");
const schemaDir = path.join(repoRoot, "packages/db/prisma/schema");
const files = readdirSync(schemaDir).filter((file) => file.endsWith(".prisma"));
const schema = files
  .map((file) => readFileSync(path.join(schemaDir, file), "utf-8"))
  .join("\n");

assert.ok(schema.includes("model EmailMessage"), "EmailMessage model should exist.");

const requiredFields = [
  "workspaceId",
  "accountEmail",
  "mailboxPath",
  "uid",
  "bodyHtml",
  "bodyText",
  "attachments",
];

for (const field of requiredFields) {
  assert.ok(
    new RegExp(`\\b${field}\\b`).test(schema),
    `EmailMessage should include field: ${field}.`
  );
}

assert.ok(
  schema.includes("@@unique([workspaceId, accountEmail, mailboxPath, uid])"),
  "EmailMessage should define a unique index for mailbox UID."
);

console.log("email schema tests passed.");
