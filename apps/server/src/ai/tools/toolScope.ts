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
import {
  computeChatSessionDirByConvention,
  resolveSessionAssetDir,
} from "@/ai/services/chat/repositories/chatSessionPathResolver";
import { resolveMemoryDir, resolveUserMemoryDir } from "@/ai/shared/memoryLoader";

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
  const boardId = getBoardId();
  const sessionId = getSessionId();

  // 所有类型的 chat 统一走 computeChatSessionDirByConvention，保证这里和
  // expandPathTemplateVars / resolveSessionDir 三处路径规则一致。
  // 画布右侧面板 chat 的 asset 目录是 board 目录下独立的 chat-history/<sessionId>/asset/，
  // 与 board 自身资源 (boards/<boardId>/asset/) 物理隔离。
  let chatAssetRoot: string | undefined;
  if (sessionId) {
    const sessionDir = computeChatSessionDirByConvention({ sessionId, projectId, boardId });
    chatAssetRoot = path.join(sessionDir, "asset");
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

/**
 * Template variable expansion for tool inputs (paths, bash commands, etc.).
 *
 * Supported variables:
 *   - ${CURRENT_PROJECT_ROOT}  → absolute project root (if bound)
 *   - ${CURRENT_CHAT_DIR}      → absolute chat asset directory (session sandbox)
 *   - ${CURRENT_BOARD_DIR}     → absolute board asset directory (canvas sandbox)
 *   - ${USER_MEMORY_DIR}       → <tempStorage>/memory (global memory root)
 *   - ${PROJECT_MEMORY_DIR}    → <projectRoot>/.openloaf/memory (project sessions only)
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
  // 画布自身的资源目录，与 chat 会话目录是兄弟关系，不再等价。
  let boardAssetDir: string | undefined;
  if (boardId) {
    const boardRoot = resolveBoardScopedRoot(projectId);
    boardAssetDir = resolveBoardAssetDir(boardRoot, boardId);
  }

  // Chat session asset dir：<sessionDir>/asset/
  // 画布右侧面板 chat 与画布内 board 资源物理隔离：
  //   - CURRENT_CHAT_DIR → <boardRoot>/boards/<boardId>/chat-history/<sessionId>/asset/
  //   - CURRENT_BOARD_DIR → <boardRoot>/boards/<boardId>/asset/
  // 同步使用 computeChatSessionDirByConvention，和 chatSessionPathResolver 共享规则。
  let chatAssetDir: string | undefined;
  if (sessionId) {
    const sessionDir = computeChatSessionDirByConvention({ sessionId, projectId, boardId });
    chatAssetDir = path.join(sessionDir, "asset");
    // 提前创建目录，避免 Glob/Grep 首次使用 ${CURRENT_CHAT_DIR} 时 ENOENT
    fsSync.mkdirSync(chatAssetDir, { recursive: true });
  }

  const home = process.env.HOME || process.env.USERPROFILE;
  const userMemoryDir = resolveUserMemoryDir();
  const projectMemoryDir = projectRoot ? resolveMemoryDir(projectRoot) : undefined;
  return input.replace(
    /\$\{(CURRENT_PROJECT_ROOT|CURRENT_CHAT_DIR|CURRENT_BOARD_DIR|USER_MEMORY_DIR|PROJECT_MEMORY_DIR|HOME)\}/g,
    (token, name) => {
      switch (name) {
        case "CURRENT_PROJECT_ROOT":
          return projectRoot ? path.resolve(projectRoot) : token;
        case "CURRENT_CHAT_DIR":
          return chatAssetDir ? path.resolve(chatAssetDir) : token;
        case "CURRENT_BOARD_DIR":
          return boardAssetDir ? path.resolve(boardAssetDir) : token;
        case "USER_MEMORY_DIR":
          return path.resolve(userMemoryDir);
        case "PROJECT_MEMORY_DIR":
          return projectMemoryDir ? path.resolve(projectMemoryDir) : token;
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

  // Template variables (${CURRENT_CHAT_DIR}, ${CURRENT_PROJECT_ROOT}, etc.)
  // are expanded up-front so downstream layers see plain absolute paths.
  const expanded = expandPathTemplateVars(input.target);
  const raw = expanded.trim();
  // Strip @[...] user-mention wrapper (emitted by ChatInput drop handler).
  const stripped = raw.startsWith("@[") && raw.endsWith("]") ? raw.slice(2, -1) : raw;

  let absPath: string;
  if (!projectId && getSessionId()) {
    // 临时会话（无 projectId 有 sessionId）：相对路径解析基于 tempDir
    if (!path.isAbsolute(stripped) && !stripped.startsWith("~") && !stripped.startsWith("file:")) {
      absPath = path.resolve(getResolvedTempStorageDir(), stripped);
    } else {
      absPath = path.resolve(resolveScopedPath({ projectId, target: stripped }));
    }
  } else {
    absPath = path.resolve(resolveScopedPath({ projectId, target: stripped }));
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
