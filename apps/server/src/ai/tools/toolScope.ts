/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport path from "node:path";
import { getProjectId, getWorkspaceId } from "@/ai/shared/context/requestContext";
import {
  getProjectRootPath,
  getWorkspaceRootPathById,
  resolveScopedPath,
} from "@openloaf/api/services/vfsService";

type ToolRoots = {
  /** Workspace root path. */
  workspaceRoot: string;
  /** Project root path if available. */
  projectRoot?: string;
};

/** Resolve workspace/project roots for current request context. */
function resolveToolRoots(): ToolRoots {
  const workspaceId = getWorkspaceId();
  if (!workspaceId) throw new Error("workspaceId is required.");
  const workspaceRoot = getWorkspaceRootPathById(workspaceId);
  if (!workspaceRoot) throw new Error("Workspace not found.");
  const projectId = getProjectId();
  const projectRoot = projectId ? getProjectRootPath(projectId, workspaceId) ?? undefined : undefined;
  return {
    workspaceRoot: path.resolve(workspaceRoot),
    projectRoot: projectRoot ? path.resolve(projectRoot) : undefined,
  };
}

/** Check whether a target path stays inside a root path. */
function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Resolve a tool path with scope enforcement. */
export function resolveToolPath(input: {
  target: string;
  allowOutside: boolean;
}): { absPath: string; rootLabel: "workspace" | "project" | "external" } {
  const workspaceId = getWorkspaceId();
  if (!workspaceId) throw new Error("workspaceId is required.");
  const projectId = getProjectId();
  const { workspaceRoot, projectRoot } = resolveToolRoots();
  const absPath = path.resolve(
    resolveScopedPath({ workspaceId, projectId, target: input.target }),
  );
  const insideProject = projectRoot ? isPathInside(projectRoot, absPath) : false;
  const insideWorkspace = isPathInside(workspaceRoot, absPath);
  // 中文注释：默认只允许在 workspace/project 根目录内访问。
  if (!input.allowOutside && !insideProject && !insideWorkspace) {
    throw new Error("Path is outside the workspace/project scope.");
  }
  const rootLabel = insideProject ? "project" : insideWorkspace ? "workspace" : "external";
  return { absPath, rootLabel };
}

/** Resolve a working directory with scope enforcement. */
export function resolveToolWorkdir(input: {
  workdir?: string;
  allowOutside: boolean;
}): { cwd: string; rootLabel: "workspace" | "project" | "external" } {
  if (input.workdir) {
    const resolved = resolveToolPath({ target: input.workdir, allowOutside: input.allowOutside });
    return { cwd: resolved.absPath, rootLabel: resolved.rootLabel };
  }
  const { workspaceRoot, projectRoot } = resolveToolRoots();
  const cwd = projectRoot ?? workspaceRoot;
  return {
    cwd,
    rootLabel: projectRoot ? "project" : "workspace",
  };
}
