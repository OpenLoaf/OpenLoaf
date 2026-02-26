/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { BoardFileContext } from "./BoardProvider";
import {
  buildChildUri,
  formatScopedProjectPath,
  getRelativePathFromUri,
  isProjectAbsolutePath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";

export type BoardFolderScope = {
  /** Project id for resolving absolute file urls. */
  projectId: string;
  /** Relative folder path under the project root. */
  relativeFolderPath: string;
};

/** Scheme matcher for absolute URIs. */
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
/** Board asset folder prefix (preferred). */
const BOARD_ASSET_PREFIX = "asset";
/** Legacy board asset folder prefix. */
const LEGACY_ASSET_PREFIX = ".asset";
/** Older board asset folder prefix. */
const LEGACY_ASSET_PREFIX_V2 = "assets";

/** Normalize a relative path string. */
export function normalizeRelativePath(value: string): string {
  return value.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

/** Return true when the relative path attempts to traverse parents. */
export function hasParentTraversal(value: string): boolean {
  return value.split("/").some((segment) => segment === "..");
}

/** Return true when a path is board-relative. */
export function isBoardRelativePath(value: string): boolean {
  if (!value) return false;
  if (SCHEME_REGEX.test(value)) return false;
  if (isProjectAbsolutePath(value)) return false;
  const normalized = normalizeRelativePath(value);
  if (!normalized) return false;
  return (
    normalized === BOARD_ASSET_PREFIX ||
    normalized.startsWith(`${BOARD_ASSET_PREFIX}/`) ||
    normalized === LEGACY_ASSET_PREFIX ||
    normalized.startsWith(`${LEGACY_ASSET_PREFIX}/`) ||
    normalized === LEGACY_ASSET_PREFIX_V2 ||
    normalized.startsWith(`${LEGACY_ASSET_PREFIX_V2}/`)
  );
}

/** Resolve the board folder scope from file context. */
export function resolveBoardFolderScope(
  fileContext?: BoardFileContext
): BoardFolderScope | null {
  if (!fileContext?.boardFolderUri) return null;
  if (!fileContext.projectId || !fileContext.rootUri) return null;
  const relativeFolderPath = getRelativePathFromUri(
    fileContext.rootUri,
    fileContext.boardFolderUri
  );
  if (!relativeFolderPath) return null;
  return { projectId: fileContext.projectId, relativeFolderPath };
}

/** Resolve a board-relative path into an absolute URI. */
export function resolveBoardRelativeUri(
  value: string,
  boardFolderUri?: string
): string {
  if (!boardFolderUri) return value;
  if (!isBoardRelativePath(value)) return value;
  const normalized = normalizeRelativePath(value);
  if (!normalized || hasParentTraversal(normalized)) return value;
  return buildChildUri(boardFolderUri, normalized);
}

/** Convert an absolute URI into a board-relative path when possible. */
export function toBoardRelativePath(
  value: string,
  boardFolderScope: BoardFolderScope | null,
  boardFolderUri?: string
): string {
  if (!value) return value;
  const hasScheme = SCHEME_REGEX.test(value);
  if (!hasScheme) return value;
  if (boardFolderUri) {
    const relativePath = normalizeRelativePath(
      getRelativePathFromUri(boardFolderUri, value)
    );
    if (!relativePath || hasParentTraversal(relativePath)) return value;
    return relativePath;
  }
  return value;
}

/** Resolve a board-relative path into a project-relative path. */
export function resolveBoardRelativeProjectPath(
  value: string,
  boardFolderScope: BoardFolderScope | null
): string {
  if (!value || !boardFolderScope) return "";
  if (!isBoardRelativePath(value)) return "";
  const normalized = normalizeRelativePath(value);
  // 逻辑：禁止相对路径包含父级跳转。
  if (!normalized || hasParentTraversal(normalized)) return "";
  return normalizeProjectRelativePath(
    `${boardFolderScope.relativeFolderPath}/${normalized}`
  );
}

/** Resolve a board-scoped uri into a project-relative path when possible. */
export function resolveProjectPathFromBoardUri(input: {
  /** Raw uri to resolve. */
  uri: string;
  /** Board folder scope for board-relative resolution. */
  boardFolderScope: BoardFolderScope | null;
  /** Current project id for scoped path normalization. */
  currentProjectId?: string;
  /** Project root uri for file:// fallback. */
  rootUri?: string;
}): string {
  const trimmed = input.uri.trim();
  if (!trimmed) return "";
  if (SCHEME_REGEX.test(trimmed)) {
    if (trimmed.startsWith("file://") && input.rootUri) {
      const relativePath = getRelativePathFromUri(input.rootUri, trimmed);
      return relativePath ? normalizeProjectRelativePath(relativePath) : "";
    }
    return "";
  }
  if (isBoardRelativePath(trimmed)) {
    return resolveBoardRelativeProjectPath(trimmed, input.boardFolderScope);
  }
  const parsed = parseScopedProjectPath(trimmed);
  if (!parsed) return "";
  return formatScopedProjectPath({
    projectId: parsed.projectId,
    currentProjectId: input.currentProjectId,
    relativePath: parsed.relativePath,
    includeAt: true,
  });
}
