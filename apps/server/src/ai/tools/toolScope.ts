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
  getBoardId,
  getProjectId,
  getSessionId,
} from "@/ai/shared/context/requestContext";
import {
  getProjectRootPath,
  resolveScopedPath,
} from "@openloaf/api/services/vfsService";
import { getOpenLoafRootDir } from "@openloaf/config";
import { getResolvedTempStorageDir } from "@openloaf/api/services/appConfigService";
import {
  resolveBoardAssetDir,
  resolveBoardScopedRoot,
} from "@openloaf/api/common/boardPaths";
import { resolveSessionAssetDir } from "@/ai/services/chat/repositories/chatSessionPathResolver";

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

/** Session-scoped path regex: [chat_xxx]/subpath */
const SESSION_PATH_REGEX = /^\[(chat_[^\]]+)\]\/(.+)$/;

/**
 * Template variable expansion for tool inputs (paths, bash commands, etc.).
 *
 * Supported variables:
 *   - ${CURRENT_PROJECT_ROOT}  → absolute project root (if bound)
 *   - ${CURRENT_CHAT_DIR}      → absolute chat asset directory (session sandbox)
 *   - ${CURRENT_BOARD_DIR}     → absolute board asset directory (canvas sandbox)
 *   - ${HOME}                  → user home directory
 *
 * Variables that cannot resolve in the current context (e.g. CURRENT_PROJECT_ROOT
 * in a temp chat) are left untouched — the downstream tool will surface a clear
 * error rather than silently producing a garbage path.
 *
 * This function is safe to call on arbitrary strings (paths OR shell commands);
 * it only replaces exact `${NAME}` tokens and does not interfere with other
 * shell substitution syntax ($VAR, $(...), backticks, etc.).
 *
 * NOTE: paths are resolved by CONVENTION (no DB lookup), which is authoritative
 * for temp chats, project-bound chats, and standard boards. Legacy boards with
 * custom folderUri are extremely rare and fall back to the tool-level regex
 * resolver; those cases still work through the absolute-path escape hatch.
 */
export function expandPathTemplateVars(input: string): string {
  if (!input || input.indexOf("${") === -1) return input;
  const projectId = getProjectId();
  const projectRoot = projectId ? getProjectRootPath(projectId) : undefined;
  const sessionId = getSessionId();
  const boardId = getBoardId();

  // Board asset dir: {boardRoot}/boards/{boardId}/asset/
  // (boardRoot = projectRoot for project boards, tempDir for temp boards)
  let boardAssetDir: string | undefined;
  if (boardId) {
    const boardRoot = resolveBoardScopedRoot(projectId);
    boardAssetDir = resolveBoardAssetDir(boardRoot, boardId);
  }

  // Chat session asset dir. When chat is bound to a board the asset dir lives
  // under the board's directory; otherwise it's at the standard chat-history
  // location (project or temp).
  let chatAssetDir: string | undefined;
  if (sessionId) {
    if (boardAssetDir) {
      // Canvas-bound chats: sessionId typically equals boardId, so the chat
      // asset dir IS the board asset dir. (chatSessionPathResolver stores the
      // physical folder by the same convention.) This is deliberately the same
      // directory as CURRENT_BOARD_DIR — the two tokens are synonyms when a
      // chat is inside a canvas, letting AI pick whichever reads better.
      chatAssetDir = boardAssetDir;
    } else {
      const sessionDir = projectRoot
        ? path.join(projectRoot, ".openloaf", "chat-history", sessionId)
        : path.join(getResolvedTempStorageDir(), "chat-history", sessionId);
      chatAssetDir = path.join(sessionDir, "asset");
    }
  }

  const home = process.env.HOME || process.env.USERPROFILE;
  return input.replace(
    /\$\{(CURRENT_PROJECT_ROOT|CURRENT_CHAT_DIR|CURRENT_BOARD_DIR|HOME)\}/g,
    (token, name) => {
      switch (name) {
        case "CURRENT_PROJECT_ROOT":
          return projectRoot ? path.resolve(projectRoot) : token;
        case "CURRENT_CHAT_DIR":
          return chatAssetDir ? path.resolve(chatAssetDir) : token;
        case "CURRENT_BOARD_DIR":
          return boardAssetDir ? path.resolve(boardAssetDir) : token;
        case "HOME":
          return home ? path.resolve(home) : token;
        default:
          return token;
      }
    },
  );
}

/** Resolve a tool path (always allows outside scope; caller handles approval). */
export function resolveToolPath(input: {
  target: string;
}): { absPath: string; rootLabel: "project" | "external" } {
  const projectId = getProjectId();
  const { projectRoot } = resolveToolRoots();

  let absPath: string;

  // 先处理 [sessionId]/... 格式：解析为会话物理目录
  // Template variables (${CURRENT_CHAT_DIR}, etc.) are expanded up-front so
  // every downstream branch (session regex, project-scope resolution, absolute
  // path handling) sees a plain resolved path.
  const expanded = expandPathTemplateVars(input.target);
  const raw = expanded.trim();
  const stripped = raw.startsWith("@{") && raw.endsWith("}") ? raw.slice(2, -1) : raw;
  const sessionMatch = stripped.match(SESSION_PATH_REGEX);
  if (sessionMatch) {
    const targetSessionId = sessionMatch[1]!;
    const subPath = sessionMatch[2]!;
    const sessionDir = projectRoot
      ? path.join(projectRoot, ".openloaf", "chat-history", targetSessionId)
      : path.join(getResolvedTempStorageDir(), "chat-history", targetSessionId);
    absPath = path.resolve(sessionDir, subPath);
  } else if (!projectId && getSessionId()) {
    // 临时会话（无 projectId 有 sessionId）：相对路径解析基于 tempDir
    if (!path.isAbsolute(stripped) && !stripped.startsWith("~") && !stripped.startsWith("file:")) {
      absPath = path.resolve(getResolvedTempStorageDir(), stripped);
    } else {
      absPath = path.resolve(resolveScopedPath({ projectId, target: expanded }));
    }
  } else {
    absPath = path.resolve(resolveScopedPath({ projectId, target: expanded }));
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
    const absPath = path.resolve(
      resolveScopedPath({ projectId, target: expandPathTemplateVars(target) }),
    );
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
 * Ensure a writable root directory for tool output exists.
 * - If a project is bound to the session → use the project root.
 * - Otherwise (temp conversation) → use {chat-history}/{sessionId}/asset/.
 * No side effects: no project is created, no DB updates, no frontend events.
 */
export async function ensureWritableRoot(): Promise<{
  projectId: string | null;
  rootPath: string;
}> {
  const projectId = getProjectId();
  if (projectId) {
    const root = getProjectRootPath(projectId);
    if (root) {
      return { projectId, rootPath: path.resolve(root) };
    }
  }

  const sessionId = getSessionId();
  if (!sessionId) {
    throw new Error("sessionId is required to resolve a writable root.");
  }
  const assetDir = await resolveSessionAssetDir(sessionId);
  return { projectId: null, rootPath: path.resolve(assetDir) };
}
