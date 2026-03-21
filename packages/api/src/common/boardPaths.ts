/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * 集中管理画布存储路径的解析逻辑。所有涉及画布磁盘路径的代码应导入此模块。
 *
 * 路径规则：
 * - 项目画布：{projectRoot}/.openloaf/boards/{boardId}/...
 * - 临时画布：{tempDir}/boards/{boardId}/...（不加 .openloaf 中间层）
 * - 全局画布（兼容）：~/.openloaf/boards/{boardId}/...
 */
import path from "node:path";
import { resolveScopedOpenLoafPath } from "@openloaf/config";
import { prisma } from "@openloaf/db";
import { getResolvedTempStorageDir } from "../services/appConfigService";
import { getProjectRootPath, resolveScopedRootPath } from "../services/vfsService";

/** Board folder name prefix. */
export const BOARD_FOLDER_PREFIX = "board_";
/** Legacy board folder name prefix. */
export const BOARD_FOLDER_PREFIX_LEGACY = "tnboard_";
/** Board asset sub-directory name. */
export const BOARD_ASSET_DIR = "asset";
/** Board chat-history sub-directory name. */
export const BOARD_CHAT_HISTORY_DIR = "chat-history";

/**
 * Resolve the scoped root for board storage.
 * - With projectId: project root path
 * - Without projectId: temp storage dir
 */
export function resolveBoardScopedRoot(projectId?: string): string {
  if (projectId?.trim()) {
    return resolveScopedRootPath({ projectId });
  }
  return getResolvedTempStorageDir();
}

/** Check whether a root path is the dedicated temp storage directory. */
export function isTempStorageRoot(rootPath: string): boolean {
  return path.resolve(rootPath) === path.resolve(getResolvedTempStorageDir());
}

/**
 * Resolve a board-scoped absolute path.
 * - 临时画布：{tempDir}/boards/{...segments}
 * - 项目/全局画布：{root}/.openloaf/boards/{...segments}
 */
export function resolveBoardDir(rootPath: string, ...segments: string[]): string {
  if (isTempStorageRoot(rootPath)) {
    return path.join(rootPath, "boards", ...segments);
  }
  return resolveScopedOpenLoafPath(rootPath, "boards", ...segments);
}

/** Resolve the boards base directory for a project or temp storage. */
export function resolveBoardsBaseDir(projectId?: string): string {
  const rootPath = resolveBoardScopedRoot(projectId);
  return resolveBoardDir(rootPath);
}

/** Resolve the asset directory for a board. */
export function resolveBoardAssetDir(rootPath: string, boardId: string): string {
  return resolveBoardDir(rootPath, boardId, BOARD_ASSET_DIR);
}

/** Resolve the chat-history directory for a board. */
export function resolveBoardChatHistoryDir(rootPath: string, boardId: string): string {
  return resolveBoardDir(rootPath, boardId, BOARD_CHAT_HISTORY_DIR);
}

/**
 * Build the relative board asset path (for saveDir / media storage).
 * Returns a path relative to the scoped root.
 */
export function buildBoardAssetRelativePath(rootPath: string, boardId: string): string {
  const absDir = resolveBoardAssetDir(rootPath, boardId);
  return path.relative(rootPath, absDir);
}

/**
 * Build the relative board path (for folderUri stored in DB).
 * Returns e.g. "boards/{boardId}/" for temp, ".openloaf/boards/{boardId}/" for project.
 */
export function buildBoardFolderUri(rootPath: string, boardId: string): string {
  const absDir = resolveBoardDir(rootPath, boardId);
  const rel = path.relative(rootPath, absDir).split(path.sep).join("/");
  return `${rel}/`;
}

/**
 * Resolve the absolute path for a board from its DB folderUri.
 * folderUri 来自数据库（如 "boards/{boardId}/" 或 ".openloaf/boards/{boardId}/"），
 * 直接与根路径拼接即可得到正确的绝对路径，无需猜测格式。
 */
export function resolveBoardAbsPath(
  rootPath: string,
  folderUri: string,
  ...subpath: string[]
): string {
  const normalized = folderUri.replace(/\/+$/u, "");
  return path.join(rootPath, normalized, ...subpath);
}

/**
 * 从数据库查询画布的 folderUri 和 projectId。
 * READ 操作必须使用此函数获取真实路径，不可用 boardId 猜测。
 */
export async function lookupBoardRecord(boardId: string): Promise<{
  folderUri: string;
  projectId: string | null;
} | null> {
  const board = await prisma.board.findFirst({
    where: { id: boardId },
    select: { folderUri: true, projectId: true },
  });
  return board;
}

/**
 * 从数据库查询画布并解析其绝对路径。
 * 适用于所有 READ 操作（读取已有画布文件）。
 * 返回 { absDir, rootPath } 或 null（画布不存在时）。
 */
export async function resolveBoardDirFromDb(
  boardId: string,
  ...subpath: string[]
): Promise<{ absDir: string; rootPath: string } | null> {
  const board = await lookupBoardRecord(boardId);
  if (!board) return null;
  const rootPath = resolveBoardScopedRoot(board.projectId ?? undefined);
  const absDir = resolveBoardAbsPath(rootPath, board.folderUri, ...subpath);
  return { absDir, rootPath };
}

/** Extract the physical folder name (last segment) from a folderUri. */
export function resolveBoardFolderName(folderUri: string): string {
  return folderUri.replace(/\/+$/u, "").split("/").filter(Boolean).pop() ?? "";
}

/** Extract the board entity id from a folderUri (same as folder name). */
export function resolveBoardEntityId(folderUri: string): string {
  return resolveBoardFolderName(folderUri);
}
