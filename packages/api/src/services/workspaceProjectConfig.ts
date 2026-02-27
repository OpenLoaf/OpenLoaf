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
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { z } from "zod";
import {
  getActiveWorkspaceConfig,
  getWorkspaceByIdConfig,
  resolveWorkspaceRootPath,
} from "./workspaceConfig";
import { normalizeFileUri, resolveFilePathFromUri, toFileUriWithoutEncoding } from "./fileUri";

/** Workspace-level project config directory name. */
const WORKSPACE_PROJECT_CONFIG_DIR = ".openloaf";
/** Workspace-level project config file name. */
const WORKSPACE_PROJECT_CONFIG_FILE = "workspace.json";

/** Workspace project config schema. */
export const workspaceProjectConfigSchema = z
  .object({
    schema: z.number().optional(),
    projects: z.record(z.string(), z.string()).optional(),
    order: z.array(z.string()).optional(),
  })
  .passthrough();

export type WorkspaceProjectConfig = z.infer<typeof workspaceProjectConfigSchema>;

type WorkspaceProjectContext = {
  /** Workspace id. */
  workspaceId: string;
  /** Workspace root URI. */
  rootUri: string;
  /** Workspace root path on disk. */
  rootPath: string;
  /** Raw workspace config data. */
  config: WorkspaceProjectConfig;
};

/** Build workspace.json path from workspace root path. */
function resolveWorkspaceProjectConfigPath(rootPath: string): string {
  return path.join(rootPath, WORKSPACE_PROJECT_CONFIG_DIR, WORKSPACE_PROJECT_CONFIG_FILE);
}

/** Read workspace.json safely. */
function readWorkspaceProjectConfig(rootPath: string): WorkspaceProjectConfig | null {
  const filePath = resolveWorkspaceProjectConfigPath(rootPath);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    return workspaceProjectConfigSchema.parse(raw);
  } catch {
    return null;
  }
}

/** Write workspace.json atomically. */
function writeWorkspaceProjectConfig(rootPath: string, payload: WorkspaceProjectConfig): void {
  const filePath = resolveWorkspaceProjectConfigPath(rootPath);
  const dirPath = path.dirname(filePath);
  mkdirSync(dirPath, { recursive: true });
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  // 中文注释：使用原子写入，避免读取到半写入状态。
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

/** Normalize workspace project mapping and order. */
function normalizeWorkspaceProjectConfig(
  raw: WorkspaceProjectConfig,
): { projects: Record<string, string>; order: string[] } {
  const projects: Record<string, string> = {};
  for (const [projectId, value] of Object.entries(raw.projects ?? {})) {
    const trimmedId = projectId.trim();
    const trimmedValue = value?.trim();
    if (!trimmedId || !trimmedValue) continue;
    projects[trimmedId] = trimmedValue;
  }
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of raw.order ?? []) {
    const trimmed = typeof id === "string" ? id.trim() : "";
    if (!trimmed || seen.has(trimmed) || !projects[trimmed]) continue;
    seen.add(trimmed);
    order.push(trimmed);
  }
  for (const id of Object.keys(projects)) {
    if (seen.has(id)) continue;
    order.push(id);
    seen.add(id);
  }
  return { projects, order };
}

/** Check whether target path is inside the workspace root. */
function isPathInside(rootPath: string, targetPath: string): boolean {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedRoot === normalizedTarget) return true;
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** Convert a stored project entry into a file:// root URI. */
function resolveWorkspaceProjectEntry(rootPath: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("file://")) return trimmed;
  const candidatePath = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(rootPath, trimmed);
  return toFileUriWithoutEncoding(candidatePath);
}

/** Convert a project root URI into a workspace.json entry. */
function toWorkspaceProjectEntry(rootPath: string, rootUri: string): string {
  // 中文注释：兼容历史脏数据，截取拼接字符串中的 file:// 段。
  const cleanedRootUri = (() => {
    const trimmed = rootUri.trim();
    const fileIndex = trimmed.indexOf("file://");
    if (fileIndex > 0) return trimmed.slice(fileIndex);
    return trimmed;
  })();
  const normalizedUri = normalizeFileUri(cleanedRootUri);
  const projectRootPath = resolveFilePathFromUri(normalizedUri);
  if (!isPathInside(rootPath, projectRootPath)) {
    return toFileUriWithoutEncoding(projectRootPath);
  }
  const relativePath = path.relative(rootPath, projectRootPath);
  // 中文注释：同目录时使用 "."，避免空字符串导致歧义。
  return relativePath || ".";
}

/** Ensure workspace.json exists for the workspace. */
function ensureWorkspaceProjectConfig(workspaceId?: string): WorkspaceProjectContext | null {
  const workspace = workspaceId
    ? getWorkspaceByIdConfig(workspaceId)
    : getActiveWorkspaceConfig();
  if (!workspace) return null;
  const rootPath = resolveWorkspaceRootPath(workspace.rootUri);
  let config = readWorkspaceProjectConfig(rootPath);
  let shouldWrite = false;

  if (!config) {
    config = { schema: 1, projects: {}, order: [] };
    shouldWrite = true;
  }

  if (shouldWrite) {
    writeWorkspaceProjectConfig(rootPath, config);
  }

  return {
    workspaceId: workspace.id,
    rootUri: workspace.rootUri,
    rootPath,
    config,
  };
}

/** Get ordered project entries for a workspace. */
export function getWorkspaceProjectEntries(workspaceId?: string): Array<[string, string]> {
  const context = ensureWorkspaceProjectConfig(workspaceId);
  if (!context) return [];
  const { projects, order } = normalizeWorkspaceProjectConfig(context.config);
  const entries: Array<[string, string]> = [];
  for (const projectId of order) {
    const raw = projects[projectId];
    if (!raw) continue;
    const rootUri = resolveWorkspaceProjectEntry(context.rootPath, raw);
    if (!rootUri) continue;
    entries.push([projectId, rootUri]);
  }
  return entries;
}

/** Get project map for a workspace. */
export function getWorkspaceProjectMap(workspaceId?: string): Map<string, string> {
  return new Map(getWorkspaceProjectEntries(workspaceId));
}

/** Upsert a project entry into workspace.json. */
export function upsertWorkspaceProjectEntry(
  projectId: string,
  rootUri: string,
  workspaceId?: string,
): void {
  const context = ensureWorkspaceProjectConfig(workspaceId);
  if (!context) return;
  const normalized = normalizeWorkspaceProjectConfig(context.config);
  const nextProjects = { ...normalized.projects };
  const nextOrder = [...normalized.order];
  const trimmedId = projectId.trim();
  const trimmedUri = rootUri.trim();
  if (!trimmedId || !trimmedUri) return;
  nextProjects[trimmedId] = toWorkspaceProjectEntry(context.rootPath, trimmedUri);
  if (!nextOrder.includes(trimmedId)) {
    nextOrder.push(trimmedId);
  }
  writeWorkspaceProjectConfig(context.rootPath, {
    ...context.config,
    schema: 1,
    projects: nextProjects,
    order: nextOrder,
  });
}

/** Remove a project entry from workspace.json. */
export function removeWorkspaceProjectEntry(projectId: string, workspaceId?: string): void {
  const context = ensureWorkspaceProjectConfig(workspaceId);
  if (!context) return;
  const normalized = normalizeWorkspaceProjectConfig(context.config);
  const trimmedId = projectId.trim();
  if (!trimmedId || !normalized.projects[trimmedId]) return;
  const nextProjects = { ...normalized.projects };
  delete nextProjects[trimmedId];
  const nextOrder = normalized.order.filter((id) => id !== trimmedId);
  writeWorkspaceProjectConfig(context.rootPath, {
    ...context.config,
    schema: 1,
    projects: nextProjects,
    order: nextOrder,
  });
}

/** Replace workspace.json project entries in order. */
export function setWorkspaceProjectEntries(
  entries: Array<[string, string]>,
  workspaceId?: string,
): void {
  const context = ensureWorkspaceProjectConfig(workspaceId);
  if (!context) return;
  const projects: Record<string, string> = {};
  const order: string[] = [];
  for (const [projectId, rootUri] of entries) {
    const trimmedId = projectId?.trim();
    const trimmedUri = rootUri?.trim();
    if (!trimmedId || !trimmedUri) continue;
    projects[trimmedId] = toWorkspaceProjectEntry(context.rootPath, trimmedUri);
    order.push(trimmedId);
  }
  writeWorkspaceProjectConfig(context.rootPath, {
    ...context.config,
    schema: 1,
    projects,
    order,
  });
}
