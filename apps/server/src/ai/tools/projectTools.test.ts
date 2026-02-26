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
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { setDefaultWorkspaceRootOverride, setOpenLoafRootOverride } from "@openloaf/config";
import {
  readProjectConfig,
  readWorkspaceProjectTrees,
} from "@openloaf/api/services/projectTreeService";
import { resolveFilePathFromUri } from "@openloaf/api/services/vfsService";
import { setRequestContext } from "@/ai/shared/context/requestContext";
import {
  executeProjectMutate,
  executeProjectQuery,
} from "./projectTools";

/** Build an isolated workspace root for tests. */
async function setupWorkspace(): Promise<{ root: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "openloaf-project-tools-"));
  const configRoot = path.join(root, "config");
  const workspaceRoot = path.join(root, "workspace");
  setOpenLoafRootOverride(configRoot);
  setDefaultWorkspaceRootOverride(workspaceRoot);
  return { root };
}

/** Set a minimal request context for tool execution. */
function setToolContext(input: { projectId?: string }) {
  setRequestContext({
    sessionId: "test-session",
    cookies: {},
    projectId: input.projectId,
  });
}

const { root } = await setupWorkspace();

const parentResult = await executeProjectMutate({
  actionName: "create root project",
  action: "create",
  title: "Alpha",
});

assert.equal(parentResult.data.action, "create");
if (parentResult.data.action !== "create") {
  throw new Error("Expected create result.");
}
const parentProjectId = parentResult.data.project.projectId;
assert.ok(parentProjectId, "projectId should be returned");
assert.equal(parentResult.data.project.title, "Alpha");

const listResult = await executeProjectQuery({
  actionName: "list projects",
  mode: "list",
});
assert.equal(listResult.data.mode, "list");
assert.ok(listResult.data.projects.length >= 1);

setToolContext({ projectId: parentProjectId });
const childResult = await executeProjectMutate({
  actionName: "create child project",
  action: "create",
  title: "Beta",
  createAsChild: true,
});

if (childResult.data.action !== "create") {
  throw new Error("Expected create result.");
}
const childProjectId = childResult.data.project.projectId;
const childRootUri = childResult.data.project.rootUri;
assert.ok(childProjectId);
assert.ok(childRootUri);
const childGet = await executeProjectQuery({
  actionName: "get child project",
  mode: "get",
  projectId: childProjectId,
});
assert.equal(childGet.data.mode, "get");
assert.equal(childGet.data.project.title, "Beta");

setToolContext({ projectId: childProjectId });
await executeProjectMutate({
  actionName: "rename project",
  action: "update",
  title: "Beta-Renamed",
  icon: "icon-beta",
});

const childRootPath = resolveFilePathFromUri(childRootUri);
const updatedConfig = await readProjectConfig(childRootPath);
assert.equal(updatedConfig.title, "Beta-Renamed");
assert.equal(updatedConfig.icon, "icon-beta");

await executeProjectMutate({
  actionName: "move child to root",
  action: "move",
  projectId: childProjectId,
  targetParentProjectId: null,
});

const treesAfterMove = await readWorkspaceProjectTrees();
const rootTitles = treesAfterMove.map((node) => node.title);
assert.ok(rootTitles.includes("Alpha"));
assert.ok(rootTitles.includes("Beta-Renamed"));
assert.equal(
  treesAfterMove.find((node) => node.title === "Alpha")?.children?.length ?? 0,
  0,
);

await executeProjectMutate({
  actionName: "remove child project",
  action: "remove",
  projectId: childProjectId,
});

const treesAfterRemove = await readWorkspaceProjectTrees();
const removedTitles = treesAfterRemove.map((node) => node.title);
assert.ok(removedTitles.includes("Alpha"));
assert.ok(!removedTitles.includes("Beta-Renamed"));

try {
  await rm(root, { recursive: true, force: true });
} catch {
  // 清理失败时忽略（可能被 SQLite 打开锁定）。
}
setOpenLoafRootOverride(null);
setDefaultWorkspaceRootOverride(null);
console.log("project tools tests passed.");
