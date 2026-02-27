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

import { getMonacoLanguageId } from "../CodeViewer";

assert.equal(getMonacoLanguageId("sql"), "sql");
assert.equal(getMonacoLanguageId("txt"), "shell");
assert.equal(getMonacoLanguageId("unknown"), "shell");

console.log("CodeViewer language mapping tests passed.");
