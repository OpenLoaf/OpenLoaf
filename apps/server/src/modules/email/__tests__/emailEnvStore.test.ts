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
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempRoot = mkdtempSync(path.join(tmpdir(), "openloaf-email-env-"));
const envPath = path.join(tempRoot, ".env");
process.env.OPENLOAF_SERVER_ENV_PATH = envPath;

let emailEnvStore: typeof import("../emailEnvStore");
try {
  emailEnvStore = await import("../emailEnvStore");
} catch {
  assert.fail("emailEnvStore module should exist.");
}

const {
  getEmailEnvPath,
  readEmailEnvFile,
  setEmailEnvValue,
  getEmailEnvValue,
} = emailEnvStore;

assert.equal(getEmailEnvPath(), envPath);
assert.equal(readEmailEnvFile(), "");

setEmailEnvValue("EMAIL_PASSWORD__workspace__user_example_com", "secret");
const content = readFileSync(envPath, "utf-8");
assert.ok(content.includes("EMAIL_PASSWORD__workspace__user_example_com=secret"));
assert.equal(getEmailEnvValue("EMAIL_PASSWORD__workspace__user_example_com"), "secret");

writeFileSync(envPath, "FOO=bar\nEMAIL_PASSWORD__workspace__user_example_com=old\n", "utf-8");
setEmailEnvValue("EMAIL_PASSWORD__workspace__user_example_com", "new");
const updated = readFileSync(envPath, "utf-8");
assert.ok(updated.includes("FOO=bar"));
assert.ok(updated.includes("EMAIL_PASSWORD__workspace__user_example_com=new"));
assert.equal(getEmailEnvValue("EMAIL_PASSWORD__workspace__user_example_com"), "new");

console.log("email env store tests passed.");
