import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getTenasRootDir,
  migrateLegacyServerData,
  resolveTenasDbPath,
  resolveTenasPath,
  setTenasRootOverride,
} from "../tenasPaths";

const tempRoot = mkdtempSync(path.join(tmpdir(), "tenas-config-test-"));
setTenasRootOverride(tempRoot);

const root = getTenasRootDir();
assert.equal(root, tempRoot);
assert.ok(existsSync(root));

assert.equal(resolveTenasDbPath(), path.join(tempRoot, "tenas.db"));
assert.equal(resolveTenasPath("settings.json"), path.join(tempRoot, "settings.json"));

const legacyRoot = mkdtempSync(path.join(tmpdir(), "tenas-legacy-test-"));
const legacyWorkspace = path.join(legacyRoot, "workspace");
mkdirSync(legacyWorkspace, { recursive: true });

const legacyFiles = ["settings.json", "providers.json", "auth.json", "workspaces.json", "local.db"];
for (const file of legacyFiles) {
  writeFileSync(path.join(legacyRoot, file), `legacy-${file}`, "utf-8");
}
writeFileSync(path.join(legacyWorkspace, "project.txt"), "legacy-workspace", "utf-8");

const existingTarget = path.join(tempRoot, "providers.json");
writeFileSync(existingTarget, "current-providers", "utf-8");

const result = migrateLegacyServerData({ legacyRoot, targetRoot: tempRoot });

assert.ok(result.moved.includes("settings.json"));
assert.ok(result.moved.includes("auth.json"));
assert.ok(result.moved.includes("workspaces.json"));
assert.ok(result.moved.includes("local.db"));
assert.ok(result.moved.includes("workspace"));
assert.ok(result.skipped.includes("providers.json"));

assert.equal(readFileSync(path.join(tempRoot, "settings.json"), "utf-8"), "legacy-settings.json");
assert.equal(readFileSync(path.join(tempRoot, "providers.json"), "utf-8"), "current-providers");
assert.equal(readFileSync(path.join(tempRoot, "workspace", "project.txt"), "utf-8"), "legacy-workspace");

assert.ok(!existsSync(path.join(legacyRoot, "settings.json")));
assert.ok(!existsSync(path.join(legacyRoot, "workspace")));

setTenasRootOverride(null);

console.log("tenas path tests passed.");
