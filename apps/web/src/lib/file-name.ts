/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** File extension for board documents. */
export const BOARD_FILE_EXT = "tnboard";
/** Folder prefix for board containers. */
export const BOARD_FOLDER_PREFIX = "tnboard_";
/** Board snapshot file name stored inside board folders. */
export const BOARD_INDEX_FILE_NAME = `index.${BOARD_FILE_EXT}`;
/** Board json file name stored inside board folders. */
export const BOARD_JSON_FILE_NAME = `index.${BOARD_FILE_EXT}.json`;
/** Board metadata file name stored inside board folders. */
export const BOARD_META_FILE_NAME = `index.${BOARD_FILE_EXT}.meta.json`;
/** Assets directory name inside board folders. */
export const BOARD_ASSETS_DIR_NAME = "asset";

/** Return true when the extension is a board file. */
export function isBoardFileExt(ext?: string): boolean {
  return (ext ?? "").toLowerCase() === BOARD_FILE_EXT;
}

/** Return a display name for a file, hiding board extensions. */
export function getDisplayFileName(name: string, ext?: string): string {
  if (!isBoardFileExt(ext)) return name;
  const suffix = `.${BOARD_FILE_EXT}`;
  if (!name.toLowerCase().endsWith(suffix)) return name;
  // 中文注释：仅隐藏固定后缀，保留原始主文件名。
  return name.slice(0, -suffix.length);
}

/** Ensure a filename keeps the board extension. */
export function ensureBoardFileName(baseName: string): string {
  const trimmed = baseName.trim();
  const suffix = `.${BOARD_FILE_EXT}`;
  const normalized = trimmed.toLowerCase().endsWith(suffix)
    ? trimmed.slice(0, -suffix.length)
    : trimmed;
  // 中文注释：强制固定后缀，避免用户通过重命名修改类型。
  return `${normalized}.${BOARD_FILE_EXT}`;
}

/** Return true when the folder name follows the board prefix. */
export function isBoardFolderName(name: string): boolean {
  return name.toLowerCase().startsWith(BOARD_FOLDER_PREFIX.toLowerCase());
}

/** Return a display name for a board folder by removing the prefix. */
export function getBoardDisplayName(name: string): string {
  if (!isBoardFolderName(name)) return name;
  return name.slice(BOARD_FOLDER_PREFIX.length) || name;
}

/** Ensure a folder name follows the board prefix convention. */
export function ensureBoardFolderName(baseName: string): string {
  const trimmed = baseName.trim();
  const normalized = isBoardFolderName(trimmed)
    ? trimmed.slice(BOARD_FOLDER_PREFIX.length)
    : trimmed;
  const safeName = normalized || "board";
  // 中文注释：统一在前缀后拼接名称，避免用户手动删除前缀。
  return `${BOARD_FOLDER_PREFIX}${safeName}`;
}

/** File extension for document files. */
export const DOC_FILE_EXT = "mdx";
/** Folder prefix for document containers. */
export const DOC_FOLDER_PREFIX = "tndoc_";
/** Document index file name stored inside document folders. */
export const DOC_INDEX_FILE_NAME = `index.${DOC_FILE_EXT}`;
/** Assets directory name inside document folders. */
export const DOC_ASSETS_DIR_NAME = "assets";

/** Return true when the folder name follows the document prefix. */
export function isDocFolderName(name: string): boolean {
  return name.toLowerCase().startsWith(DOC_FOLDER_PREFIX.toLowerCase());
}

/** Return a display name for a document folder by removing the prefix. */
export function getDocDisplayName(name: string): string {
  if (!isDocFolderName(name)) return name;
  return name.slice(DOC_FOLDER_PREFIX.length) || name;
}

/** Ensure a folder name follows the document prefix convention. */
export function ensureDocFolderName(baseName: string): string {
  const trimmed = baseName.trim();
  const normalized = isDocFolderName(trimmed)
    ? trimmed.slice(DOC_FOLDER_PREFIX.length)
    : trimmed;
  const safeName = normalized || "doc";
  return `${DOC_FOLDER_PREFIX}${safeName}`;
}
