import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Workspace } from "../types/workspace";
import {
  getActiveWorkspaceConfig,
  getWorkspaceByIdConfig,
  getWorkspaces,
  resolveWorkspaceRootPath,
  setWorkspaces,
} from "./workspaceConfig";

const PROJECT_META_DIR = ".tenas";
const PROJECT_META_FILE = "project.json";

/** Normalize a local path or file:// URI into a file:// URI. */
function normalizeFileUri(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("file://")) return trimmed;
  return pathToFileURL(path.resolve(trimmed)).href;
}

/** Normalize project map into file:// URIs. */
function normalizeProjects(projects?: Record<string, string>): Record<string, string> {
  if (!projects) return {};
  const normalized: Record<string, string> = {};
  for (const [projectId, projectUri] of Object.entries(projects)) {
    if (!projectId || !projectUri) continue;
    normalized[projectId] = normalizeFileUri(projectUri);
  }
  return normalized;
}

/** Get the active workspace config. */
export function getActiveWorkspace(): Workspace {
  return getActiveWorkspaceConfig();
}

/** Get workspace config by id. */
export function getWorkspaceById(workspaceId: string): Workspace | null {
  return getWorkspaceByIdConfig(workspaceId);
}

/** Get workspace root URI from active workspace. */
export function getWorkspaceRootUri(): string {
  return getActiveWorkspace().rootUri;
}

/** Get workspace root path on disk and ensure it exists. */
export function getWorkspaceRootPath(): string {
  return resolveWorkspaceRootPath(getWorkspaceRootUri());
}

/** Get workspace root URI by workspace id. */
export function getWorkspaceRootUriById(workspaceId: string): string | null {
  if (!workspaceId) return null;
  const workspace = getWorkspaceById(workspaceId);
  return workspace?.rootUri ?? null;
}

/** Get workspace root path by workspace id and ensure it exists. */
export function getWorkspaceRootPathById(workspaceId: string): string | null {
  const rootUri = getWorkspaceRootUriById(workspaceId);
  if (!rootUri) return null;
  return resolveWorkspaceRootPath(rootUri);
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

export function getProjectRootUri(projectId: string, workspaceId?: string): string | null {
  const workspace = workspaceId ? getWorkspaceById(workspaceId) : getActiveWorkspace();
  if (!workspace) return null;
  const direct = workspace.projects?.[projectId];
  if (direct) return direct;

  const queue = Object.values(workspace.projects ?? {});
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
export function getProjectRootPath(projectId: string, workspaceId?: string): string | null {
  const rootUri = getProjectRootUri(projectId, workspaceId);
  if (!rootUri) return null;
  return fileURLToPath(rootUri);
}

/** Upsert project root URI into active workspace config. */
export function upsertActiveWorkspaceProject(projectId: string, rootUri: string): void {
  const workspaces = getWorkspaces();
  const activeIndex = workspaces.findIndex((workspace) => workspace.isActive);
  const targetIndex = activeIndex >= 0 ? activeIndex : 0;
  const active = workspaces[targetIndex];
  if (!active) {
    throw new Error("Active workspace not found.");
  }
  const nextProjects = {
    ...(active.projects ?? {}),
    [projectId]: normalizeFileUri(rootUri),
  };
  const nextWorkspaces = workspaces.map((workspace, index) =>
    index === targetIndex ? { ...workspace, projects: nextProjects } : workspace
  );
  setWorkspaces(nextWorkspaces);
}

/** Remove a project from the active workspace config. */
export function removeActiveWorkspaceProject(projectId: string): void {
  const workspaces = getWorkspaces();
  const activeIndex = workspaces.findIndex((workspace) => workspace.isActive);
  const targetIndex = activeIndex >= 0 ? activeIndex : 0;
  const active = workspaces[targetIndex];
  if (!active) {
    throw new Error("Active workspace not found.");
  }
  const nextProjects = { ...(active.projects ?? {}) };
  if (!nextProjects[projectId]) return;
  // 移除项目映射，避免残留在 workspace 列表中。
  delete nextProjects[projectId];
  const nextWorkspaces = workspaces.map((workspace, index) =>
    index === targetIndex ? { ...workspace, projects: nextProjects } : workspace
  );
  setWorkspaces(nextWorkspaces);
}

/** Convert a local path to file:// URI. */
export function toFileUri(targetPath: string): string {
  return pathToFileURL(targetPath).href;
}

/** Resolve a file:// URI into a local path. */
export function resolveFilePathFromUri(uri: string): string {
  const url = new URL(uri);
  if (url.protocol !== "file:") {
    throw new Error("Only file:// URIs are supported.");
  }
  return fileURLToPath(url);
}

/** Resolve a URI into an absolute local path. */
export function resolveWorkspacePathFromUri(uri: string): string {
  return path.resolve(resolveFilePathFromUri(uri));
}

/** Resolve an input path from file uri, absolute path, or workspace/project scope. */
export function resolveScopedPath(input: {
  workspaceId: string;
  projectId?: string;
  target: string;
}): string {
  const raw = input.target.trim();
  if (!raw) {
    throw new Error("Path is required.");
  }
  if (raw.startsWith("file:")) {
    return resolveWorkspacePathFromUri(raw);
  }
  if (path.isAbsolute(raw)) {
    return path.resolve(raw);
  }
  const projectId = input.projectId?.trim();
  if (projectId) {
    const projectRootPath = getProjectRootPath(projectId, input.workspaceId);
    if (!projectRootPath) {
      throw new Error("Project not found.");
    }
    // 相对路径优先拼接到项目根目录下。
    return path.resolve(projectRootPath, raw);
  }
  const workspaceRootPath = getWorkspaceRootPathById(input.workspaceId);
  if (!workspaceRootPath) {
    throw new Error("Workspace not found.");
  }
  // 相对路径使用工作区根目录作为基准。
  return path.resolve(workspaceRootPath, raw);
}
