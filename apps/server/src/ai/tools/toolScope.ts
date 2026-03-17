/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";
import {
  getProjectId,
  getRequestContext,
  getSessionId,
  getUiWriter,
} from "@/ai/shared/context/requestContext";
import {
  getProjectRootPath,
  resolveScopedPath,
} from "@openloaf/api/services/vfsService";
import { getOpenLoafRootDir } from "@openloaf/config";
import { createTempProject } from "@openloaf/api/services/tempProjectService";
import { migrateSessionDirToProject } from "@/ai/services/chat/repositories/chatFileStore";

type ToolRoots = {
  /** Global root path (~/.openloaf/). */
  globalRoot: string;
  /** Project root path if available. */
  projectRoot?: string;
};

/** Resolve global/project roots for current request context. */
export function resolveToolRoots(): ToolRoots {
  const globalRoot = getOpenLoafRootDir();
  const projectId = getProjectId();
  const projectRoot = projectId ? getProjectRootPath(projectId) ?? undefined : undefined;
  return {
    globalRoot: path.resolve(globalRoot),
    projectRoot: projectRoot ? path.resolve(projectRoot) : undefined,
  };
}

/** Check whether a target path stays inside a root path. */
function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Resolve a tool path (always allows outside scope; caller handles approval). */
export function resolveToolPath(input: {
  target: string;
}): { absPath: string; rootLabel: "project" | "external" } {
  const projectId = getProjectId();
  const { projectRoot } = resolveToolRoots();
  const absPath = path.resolve(
    resolveScopedPath({ projectId, target: input.target }),
  );
  const insideProject = projectRoot ? isPathInside(projectRoot, absPath) : false;
  const rootLabel = insideProject ? "project" : "external";
  return { absPath, rootLabel };
}

/** Check whether a path target is outside project scope (no-throw, for approval gates). */
export function isTargetOutsideScope(target: string): boolean {
  try {
    const projectId = getProjectId();
    const { projectRoot } = resolveToolRoots();
    const absPath = path.resolve(resolveScopedPath({ projectId, target }));
    const insideProject = projectRoot ? isPathInside(projectRoot, absPath) : false;
    return !insideProject;
  } catch {
    return false;
  }
}

/** Resolve a working directory (always allows outside scope; caller handles approval). */
export function resolveToolWorkdir(input: {
  workdir?: string;
}): { cwd: string; rootLabel: "project" | "external" } {
  if (input.workdir) {
    const resolved = resolveToolPath({ target: input.workdir });
    return { cwd: resolved.absPath, rootLabel: resolved.rootLabel };
  }
  const { globalRoot, projectRoot } = resolveToolRoots();
  const cwd = projectRoot ?? globalRoot;
  return {
    cwd,
    rootLabel: projectRoot ? "project" : "external",
  };
}

/**
 * Ensure a writable project scope exists.
 * If no projectId in context, lazily create a temp project and bind it to the session.
 */
export async function ensureTempProject(): Promise<{
  projectId: string;
  projectRoot: string;
}> {
  const existingProjectId = getProjectId();
  if (existingProjectId) {
    const root = getProjectRootPath(existingProjectId);
    if (root) {
      return { projectId: existingProjectId, projectRoot: path.resolve(root) };
    }
  }

  const sessionId = getSessionId();
  const temp = await createTempProject({ sessionId });

  // Update RequestContext so sub-agents inherit the new project scope.
  const ctx = getRequestContext();
  if (ctx) {
    ctx.projectId = temp.projectId;
  }

  // Migrate existing JSONL files from global path to the new project path,
  // so messages written before temp project creation are not orphaned.
  if (sessionId) {
    await migrateSessionDirToProject(sessionId, temp.projectId);
  }

  // Notify frontend about the temp project creation
  const writer = getUiWriter();
  if (writer) {
    writer.write({
      type: 'data-temp-project',
      data: {
        projectId: temp.projectId,
        projectRoot: path.resolve(temp.rootPath),
        isTemp: true,
      },
    } as any);
  }

  return {
    projectId: temp.projectId,
    projectRoot: path.resolve(temp.rootPath),
  };
}
