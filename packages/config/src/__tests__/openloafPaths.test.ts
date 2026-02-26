import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getOpenLoafRootDir,
  getDefaultWorkspaceRootDir,
  migrateLegacyServerData,
  resolveOpenLoafDbPath,
  resolveOpenLoafPath,
  setDefaultWorkspaceRootOverride,
  setOpenLoafRootOverride,
} from "../openloaf-paths";

const tempRoot = mkdtempSync(path.join(tmpdir(), "openloaf-config-test-"));
setOpenLoafRootOverride(tempRoot);

const root = getOpenLoafRootDir();
assert.equal(root, tempRoot);
assert.ok(existsSync(root));

const workspaceRoot = mkdtempSync(path.join(tmpdir(), "OpenLoafWorkspace-root-"));
setDefaultWorkspaceRootOverride(workspaceRoot);
assert.equal(getDefaultWorkspaceRootDir(), workspaceRoot);
assert.ok(existsSync(workspaceRoot));

assert.equal(resolveOpenLoafDbPath(), path.join(tempRoot, "openloaf.db"));
assert.equal(resolveOpenLoafPath("settings.json"), path.join(tempRoot, "settings.json"));

const legacyRoot = mkdtempSync(path.join(tmpdir(), "openloaf-legacy-test-"));
const legacyWorkspace = path.join(legacyRoot, "workspace");
mkdirSync(legacyWorkspace, { recursive: true });

const legacyFiles = ["settings.json", "providers.json", "auth.json", "workspaces.json", "local.db"];
for (const file of legacyFiles) {
  writeFileSync(path.join(legacyRoot, file), `legacy-${file}`, "utf-8");
}
writeFileSync(path.join(legacyWorkspace, "project.txt"), "legacy-workspace", "utf-8");

const existingTarget = path.join(tempRoot, "providers.json");
writeFileSync(existingTarget, "current-providers", "utf-8");

const result = migrateLegacyServerData({
  legacyRoot,
  targetRoot: tempRoot,
  workspaceRoot,
});

assert.ok(result.moved.includes("settings.json"));
assert.ok(result.moved.includes("auth.json"));
assert.ok(result.moved.includes("workspaces.json"));
assert.ok(result.moved.includes("openloaf.db"));
assert.ok(result.moved.includes("workspace"));
assert.ok(result.skipped.includes("providers.json"));

assert.equal(readFileSync(path.join(tempRoot, "settings.json"), "utf-8"), "legacy-settings.json");
assert.equal(readFileSync(path.join(tempRoot, "providers.json"), "utf-8"), "current-providers");
assert.equal(readFileSync(path.join(tempRoot, "openloaf.db"), "utf-8"), "legacy-local.db");
assert.equal(readFileSync(path.join(workspaceRoot, "project.txt"), "utf-8"), "legacy-workspace");

assert.ok(!existsSync(path.join(legacyRoot, "settings.json")));
assert.ok(!existsSync(path.join(legacyRoot, "workspace")));

setDefaultWorkspaceRootOverride(null);
setOpenLoafRootOverride(null);

console.log("openloaf path tests passed.");
