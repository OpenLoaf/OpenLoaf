import assert from "node:assert/strict";

import { getMonacoLanguageId } from "../CodeViewer";

assert.equal(getMonacoLanguageId("sql"), "sql");
assert.equal(getMonacoLanguageId("txt"), "shell");
assert.equal(getMonacoLanguageId("unknown"), "shell");

console.log("CodeViewer language mapping tests passed.");
