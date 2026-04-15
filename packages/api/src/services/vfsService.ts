/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getOpenLoafRootDir } from "@openloaf/config";
import { stripAttachmentTagWrapper } from "../common/attachmentTag";
import { resolveFilePathFromUri, toFileUri, toFileUriWithoutEncoding } from "./fileUri";
import {
  getGlobalRootPath,
  getDefaultProjectStoragePath,
  getDefaultProjectStorageRootUri,
} from "./appConfigService";
import {
  getProjectRegistryEntries,
  removeProjectRegistryEntry,
  setProjectRegistryEntries,
  upsertProjectRegistryEntry,
} from "./projectRegistryConfig";

const PROJECT_META_DIR = ".openloaf";
const PROJECT_META_FILE = "project.json";
/** Scoped project path matcher like [projectId]/path/to/file (inner path after stripping @[...] wrapper). */
const PROJECT_SCOPE_REGEX = /^@?\[([^\]]+)\]\/(.+)$/;
/** Global metadata prefix used by cross-scope relative paths. */
const GLOBAL_META_PREFIX = ".openloaf/";

/** Get the default project storage root URI. */
export function getProjectStorageRootUri(): string {
  return getDefaultProjectStorageRootUri();
}

/** Get the default project storage root path on disk and ensure it exists. */
export function getProjectStorageRootPath(): string {
  return getDefaultProjectStoragePath();
}

/** Get project root URI by project id. */
function readProjectConfigProjects(rootUri: string): {
  projectId?: string;
  projects?: Record<string, string>;
} | null {
  try {
    const rootPath = resolveFilePathFromUri(rootUri);
    const metaPath = path.join(rootPath, PROJECT_META_DIR, PROJECT_META_FILE);
    if (!existsSync(metaPath)) return null;
    const raw = JSON.parse(readFileSync(metaPath, "utf-8")) as {
      projectId?: string;
      projects?: Record<string, string>;
    };
    return raw;
  } catch {
    return null;
  }
}

export function getProjectRootUri(projectId: string): string | null {
  const entries = getProjectRegistryEntries();
  for (const [entryId, rootUri] of entries) {
    if (entryId === projectId) return rootUri;
  }

  const queue = entries.map((entry) => entry[1]);
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (visited.has(current)) continue;
    visited.add(current);
    const meta = readProjectConfigProjects(current);
    if (!meta) continue;
    if (meta.projectId === projectId) return current;
    const children = Object.values(meta.projects ?? {});
    for (const childUri of children) {
      if (!visited.has(childUri)) queue.push(childUri);
    }
  }
  return null;
}

/** Get project root path by project id. */
export function getProjectRootPath(projectId: string): string | null {
  const rootUri = getProjectRootUri(projectId);
  if (!rootUri) return null;
  return resolveFilePathFromUri(rootUri);
}

/** Get all project root paths (including sub-projects). */
export function getAllProjectRootPaths(): string[] {
  const entries = getProjectRegistryEntries();
  const paths: string[] = [];
  const visited = new Set<string>();

  // BFS through top-level projects and their sub-projects
  const queue = entries.map((entry) => entry[1]);
  while (queue.length > 0) {
    const rootUri = queue.shift();
    if (!rootUri || visited.has(rootUri)) continue;
    visited.add(rootUri);
    try {
      paths.push(resolveFilePathFromUri(rootUri));
    } catch {
      // skip invalid URIs
      continue;
    }
    // Traverse sub-projects
    const meta = readProjectConfigProjects(rootUri);
    if (meta?.projects) {
      for (const childUri of Object.values(meta.projects)) {
        if (!visited.has(childUri)) queue.push(childUri);
      }
    }
  }
  return paths;
}

/** Upsert a top-level project entry into the project registry. */
export function upsertTopLevelProject(projectId: string, rootUri: string): void {
  upsertProjectRegistryEntry(projectId, rootUri);
}

/** Remove a top-level project from the project registry. */
export function removeTopLevelProject(projectId: string): void {
  removeProjectRegistryEntry(projectId);
}

/** Replace top-level project registry entries with ordered entries. */
export function setTopLevelProjectEntries(
  entries: Array<[string, string]>,
): void {
  setProjectRegistryEntries(entries);
}

export { toFileUri, toFileUriWithoutEncoding, resolveFilePathFromUri, getProjectRegistryEntries };

/** Resolve a URI into an absolute local path. */
export function resolveLocalPathFromUri(uri: string): string {
  return path.resolve(resolveFilePathFromUri(uri));
}

/** Resolve the root path for scoped filesystem operations. */
export function resolveScopedRootPath(input: {
  projectId?: string;
}): string {
  const projectId = input.projectId?.trim();
  if (projectId) {
    const projectRootPath = getProjectRootPath(projectId);
    if (!projectRootPath) {
      throw new Error("Project not found.");
    }
    return projectRootPath;
  }
  return getGlobalRootPath();
}

/** Normalize a relative path to use POSIX separators. */
export function normalizeRelativePath(value: string): string {
  const normalized = value
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
  return normalized === "." ? "" : normalized;
}

/** Normalize a global-scoped relative path against the OpenLoaf root itself. */
function normalizeGlobalScopedPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized === ".openloaf") return "";
  if (normalized.startsWith(GLOBAL_META_PREFIX)) {
    return normalized.slice(GLOBAL_META_PREFIX.length);
  }
  // 防止路径穿越：检查 normalized 的各段是否包含 ".."
  const segments = normalized.split("/");
  if (segments.some((s) => s === "..")) {
    throw new Error("Path traversal is not allowed.");
  }
  return normalized;
}

/** Convert an absolute path to a normalized relative path. */
export function toRelativePath(rootPath: string, targetPath: string): string {
  const relative = path.relative(rootPath, targetPath);
  return normalizeRelativePath(relative);
}

/** Resolve an input path from file uri, absolute path, or project scope. */
export function resolveScopedPath(input: {
  projectId?: string;
  target: string;
}): string {
  let raw = input.target.trim();
  if (!raw) {
    throw new Error("Path is required.");
  }
  // Strip attachment-tag user-mention wrapper.
  raw = stripAttachmentTagWrapper(raw);
  // Expand tilde to home directory.
  if (raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")) {
    const home = os.homedir();
    raw = raw === "~" ? home : path.join(home, raw.slice(2));
  }
  if (raw.startsWith("file:")) {
    return resolveLocalPathFromUri(raw);
  }
  if (path.isAbsolute(raw)) {
    return path.resolve(raw);
  }
  if (raw.startsWith("@")) {
    if (raw.startsWith("@/") || raw.startsWith("@\\")) {
      throw new Error("Path alias '@/' is not allowed.");
    }
    const projectId = input.projectId?.trim();
    const rootPath = projectId
      ? getProjectRootPath(projectId)
      : getGlobalRootPath();
    if (!rootPath) {
      throw new Error(projectId ? "Project not found." : "Root path not found.");
    }
    let normalizedRelative = normalizeRelativePath(raw.slice(1));
    const bareMatch = normalizedRelative.match(/^\[([^\]/]+)\]$/);
    if (bareMatch?.[1]) {
      normalizedRelative = bareMatch[1];
    }
    return path.resolve(rootPath, normalizedRelative);
  }
  const scopeMatch = raw.match(PROJECT_SCOPE_REGEX);
  if (scopeMatch) {
    const scopedProjectId = scopeMatch[1]?.trim();
    const scopedRelativePath = scopeMatch[2] ?? "";
    if (!scopedProjectId) {
      throw new Error("Project not found.");
    }
    const projectRootPath = getProjectRootPath(scopedProjectId);
    if (!projectRootPath) {
      throw new Error("Project not found.");
    }
    const normalizedRelative = scopedRelativePath
      .replace(/\\/g, "/")
      .replace(/^(\.\/)+/, "")
      .replace(/^\/+/, "");
    return path.resolve(projectRootPath, normalizedRelative);
  }
  const projectId = input.projectId?.trim();
  if (projectId) {
    const projectRootPath = getProjectRootPath(projectId);
    if (!projectRootPath) {
      throw new Error("Project not found.");
    }
    return path.resolve(projectRootPath, raw);
  }
  const globalRootPath = getGlobalRootPath();
  return path.resolve(globalRootPath, normalizeGlobalScopedPath(raw));
}
