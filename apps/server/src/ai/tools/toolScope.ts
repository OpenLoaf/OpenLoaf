/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import fsSync from "node:fs";
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
import { getResolvedTempStorageDir } from "@openloaf/api/services/appConfigService";
import { createTempProject } from "@openloaf/api/services/tempProjectService";
import { migrateSessionDirToProject } from "@/ai/services/chat/repositories/chatFileStore";
import { updateSessionProjectId } from "@/ai/services/chat/repositories/messageStore";

type ToolRoots = {
  /** Global root path (~/.openloaf/). */
  globalRoot: string;
  /** Project root path if available. */
  projectRoot?: string;
  /** Chat asset directory for global conversations (no projectId). User uploads and AI-generated files both go here. */
  chatAssetRoot?: string;
};

/** Resolve global/project roots for current request context. */
export function resolveToolRoots(): ToolRoots {
  const globalRoot = getOpenLoafRootDir();
  const projectId = getProjectId();
  const projectRoot = projectId ? getProjectRootPath(projectId) ?? undefined : undefined;

  // 临时会话（无 projectRoot）：通过 sessionId 计算正确的会话存储路径。
  // 文件存储在 {tempDir}/chat-history/{sessionId}/ 下，不是 ~/.openloaf/。
  let chatAssetRoot: string | undefined;
  if (!projectRoot) {
    const sessionId = getSessionId();
    if (sessionId) {
      const sessionDir = path.join(getResolvedTempStorageDir(), "chat-history", sessionId);
      chatAssetRoot = path.join(sessionDir, "asset");
    }
  }

  return {
    globalRoot: path.resolve(globalRoot),
    projectRoot: projectRoot ? path.resolve(projectRoot) : undefined,
    chatAssetRoot,
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

  let absPath: string;
  // 临时会话（无 projectId 有 sessionId）：相对路径解析基于 tempDir，
  // 不走 resolveScopedPath 的 globalRoot fallback（会错误地解析到 ~/.openloaf/）。
  if (!projectId && getSessionId()) {
    const raw = input.target.trim();
    const stripped = raw.startsWith("@{") && raw.endsWith("}") ? raw.slice(2, -1) : raw;
    if (!path.isAbsolute(stripped) && !stripped.startsWith("~") && !stripped.startsWith("file:")) {
      absPath = path.resolve(getResolvedTempStorageDir(), stripped);
    } else {
      absPath = path.resolve(resolveScopedPath({ projectId, target: input.target }));
    }
  } else {
    absPath = path.resolve(resolveScopedPath({ projectId, target: input.target }));
  }

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
    return true;
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
  const { globalRoot, projectRoot, chatAssetRoot } = resolveToolRoots();
  if (projectRoot) {
    return { cwd: projectRoot, rootLabel: "project" };
  }
  // 全局对话：使用 chat asset 目录作为默认 cwd
  if (chatAssetRoot) {
    if (!fsSync.existsSync(chatAssetRoot)) {
      fsSync.mkdirSync(chatAssetRoot, { recursive: true });
    }
    return { cwd: chatAssetRoot, rootLabel: "external" };
  }
  return { cwd: globalRoot, rootLabel: "external" };
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
    // Sync the new projectId to DB so ChatSession.projectId is no longer null.
    await updateSessionProjectId({ sessionId, projectId: temp.projectId });
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
