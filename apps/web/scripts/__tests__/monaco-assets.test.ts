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
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(
  process.cwd(),
  "apps/web/src/lib/monaco/monaco-loader.ts"
);
const workerPath = resolve(
  process.cwd(),
  "apps/web/public/monaco/vs/base/worker/workerMain.js"
);

assert.equal(existsSync(configPath), true, `Expected Monaco config at ${configPath}`);
assert.equal(existsSync(workerPath), true, `Expected Monaco worker at ${workerPath}`);

console.log("Monaco assets are present.");
