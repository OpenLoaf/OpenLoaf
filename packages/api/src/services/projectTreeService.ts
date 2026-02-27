/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolveFilePathFromUri, toFileUriWithoutEncoding } from "./fileUri";
import { getActiveWorkspace, getWorkspaceById } from "./vfsService";
import { getWorkspaceProjectEntries } from "./workspaceProjectConfig";

/** Directory name for project metadata. */
export const PROJECT_META_DIR = ".openloaf";
/** File name for project metadata. */
export const PROJECT_META_FILE = "project.json";

/** Zod schema for project.json. */
export const projectConfigSchema = z
  .object({
    schema: z.number().optional(),
    projectId: z.string().optional(),
    title: z.string().optional().nullable(),
    icon: z.string().optional().nullable(),
    childrenIds: z.array(z.string()).optional(),
    // Child project map uses projectId -> rootUri.
    projects: z.record(z.string(), z.string()).optional(),
    // Skill folder names to ignore for this project.
    ignoreSkills: z.array(z.string()).optional(),
    /** AI settings overrides for this project. */
    aiSettings: z
      .object({
        /** Whether project overrides are enabled. */
        overrideEnabled: z.boolean().optional(),
        /** Enable auto summary for docs. */
        autoSummaryEnabled: z.boolean().optional(),
        /** Selected hours for daily auto summary. */
        autoSummaryHours: z.array(z.number().int().min(0).max(24)).optional(),
      })
      .optional(),
  })
  .passthrough();

/** Parsed project.json shape. */
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** Project tree node. */
export type ProjectNode = {
  /** Project id. */
  projectId: string;
  /** Project display title. */
  title: string;
  /** Project icon. */
  icon?: string;
  /** Project root URI. */
  rootUri: string;
  /** Whether the project root belongs to a git repository. */
  isGitProject: boolean;
  /** Child projects. */
  children: ProjectNode[];
};

/** Project tree node with parent info. */
export type ProjectNodeWithParent = {
  /** Project node. */
  node: ProjectNode;
  /** Parent project id. */
  parentProjectId: string | null;
};

/** Project id prefix. */
const PROJECT_ID_PREFIX = "proj_";

/** Create a new project id. */
function buildProjectId(): string {
  return `${PROJECT_ID_PREFIX}${randomUUID()}`;
}

/** Read JSON file safely, return null when missing. */
async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Write JSON file atomically. */
async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  // 逻辑：原子写入，避免读取到半写入状态。
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

/** Check whether a file exists. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? false : false;
  }
}

/** Resolve whether a project path is inside a git repository. */
async function resolveGitProjectStatus(
  projectRootPath: string,
  workspaceRootPath?: string,
): Promise<boolean> {
  const resolvedProjectRoot = path.resolve(projectRootPath);
  const resolvedWorkspaceRoot = workspaceRootPath
    ? path.resolve(workspaceRootPath)
    : "";
  const shouldBoundWorkspace =
    Boolean(resolvedWorkspaceRoot) &&
    (resolvedProjectRoot === resolvedWorkspaceRoot ||
      resolvedProjectRoot.startsWith(resolvedWorkspaceRoot + path.sep));
  const limitRoot = shouldBoundWorkspace ? resolvedWorkspaceRoot : "";
  const filesystemRoot = path.parse(resolvedProjectRoot).root;
  let cursor = resolvedProjectRoot;
  // 逻辑：在工作区内则限制向上扫描到工作区根，否则只扫描到文件系统根。
  // 逻辑：从项目根目录向上查找 .git，命中即视为 Git 项目。
  while (true) {
    const gitPath = path.join(cursor, ".git");
    if (await fileExists(gitPath)) return true;
    if (limitRoot && cursor === limitRoot) break;
    if (cursor === filesystemRoot) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return false;
}

/** Build project.json path from a project root. */
export function getProjectMetaPath(projectRootPath: string): string {
  return path.join(projectRootPath, PROJECT_META_DIR, PROJECT_META_FILE);
}

/** Normalize project id value. */
function normalizeProjectId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Load and normalize project config. */
export async function readProjectConfig(
  projectRootPath: string,
  projectIdOverride?: string,
): Promise<ProjectConfig> {
  const metaPath = getProjectMetaPath(projectRootPath);
  const raw = await readJsonFile(metaPath);
  if (!raw) {
    throw new Error("project.json not found.");
  }
  const parsed = projectConfigSchema.parse(raw);
  const fallbackTitle = path.basename(projectRootPath);
  const parsedProjectId = normalizeProjectId(parsed.projectId);
  const overrideProjectId = normalizeProjectId(projectIdOverride);
  const resolvedProjectId = parsedProjectId || overrideProjectId || buildProjectId();
  const nextConfig = {
    ...parsed,
    projectId: resolvedProjectId,
    title: parsed.title?.trim() || fallbackTitle,
    projects: parsed.projects ?? {},
  };
  // 逻辑：project.json 缺失 projectId 时写回，确保后续可稳定引用。
  if (!parsedProjectId) {
    await writeJsonAtomic(metaPath, nextConfig);
  }
  return nextConfig;
}

/** Ensure the child folder name is safe and stays under root. */
function resolveChildProjectPath(rootPath: string, childName: string): string | null {
  if (!childName) return null;
  if (childName.includes("/") || childName.includes("\\")) return null;
  const normalized = childName.trim();
  if (!normalized || normalized === "." || normalized === "..") return null;
  const childPath = path.resolve(rootPath, normalized);
  if (childPath === rootPath) return null;
  if (childPath.startsWith(path.resolve(rootPath) + path.sep)) return childPath;
  return null;
}

/** Recursively read project tree from project.json. */
async function readProjectTree(
  projectRootPath: string,
  projectIdOverride?: string,
  workspaceRootPath?: string,
  rootUriOverride?: string,
): Promise<ProjectNode | null> {
  try {
    const config = await readProjectConfig(projectRootPath, projectIdOverride);
    const childProjectEntries = Object.entries(config.projects ?? {});
    const children = Array.isArray(config.childrenIds) ? config.childrenIds : [];
    const childNodes: ProjectNode[] = [];
    // Prefer projects mapping, fallback to childrenIds.
    if (childProjectEntries.length) {
      for (const [childProjectId, childRootUri] of childProjectEntries) {
        if (!childProjectId || !childRootUri) continue;
        let childPath: string;
        try {
          childPath = resolveFilePathFromUri(childRootUri);
        } catch {
          continue;
        }
        const metaPath = getProjectMetaPath(childPath);
        if (!(await fileExists(metaPath))) continue;
        const childNode = await readProjectTree(
          childPath,
          childProjectId,
          workspaceRootPath,
          childRootUri,
        );
        if (childNode) childNodes.push(childNode);
      }
    } else {
      for (const childName of children) {
        const childPath = resolveChildProjectPath(projectRootPath, childName);
        if (!childPath) continue;
        const metaPath = getProjectMetaPath(childPath);
        if (!(await fileExists(metaPath))) continue;
        const childNode = await readProjectTree(
          childPath,
          undefined,
          workspaceRootPath,
        );
        if (childNode) childNodes.push(childNode);
      }
    }
    const projectId = config.projectId;
    if (!projectId) {
      // 中文注释：配置缺失 projectId 时视为异常，避免返回不完整节点。
      throw new Error("projectId missing in project config.");
    }
    const isGitProject = await resolveGitProjectStatus(
      projectRootPath,
      workspaceRootPath,
    );
    return {
      projectId,
      title: config.title ?? path.basename(projectRootPath),
      icon: config.icon ?? undefined,
      rootUri: rootUriOverride ?? toFileUriWithoutEncoding(projectRootPath),
      isGitProject,
      children: childNodes,
    };
  } catch {
    // Return null on read failure to avoid breaking the full list.
    return null;
  }
}

/** Read the project trees from a workspace. */
export async function readWorkspaceProjectTrees(workspaceId?: string): Promise<ProjectNode[]> {
  const trimmedId = typeof workspaceId === "string" ? workspaceId.trim() : "";
  const workspace = trimmedId ? getWorkspaceById(trimmedId) : getActiveWorkspace();
  if (!workspace) return [];
  let workspaceRootPath: string | undefined;
  try {
    workspaceRootPath = resolveFilePathFromUri(workspace.rootUri);
  } catch {
    workspaceRootPath = undefined;
  }
  const projectEntries = getWorkspaceProjectEntries(workspace.id);
  const projects: ProjectNode[] = [];
  for (const [projectId, rootUri] of projectEntries) {
    let rootPath: string;
    try {
      rootPath = resolveFilePathFromUri(rootUri);
    } catch {
      continue;
    }
    const node = await readProjectTree(
      rootPath,
      projectId,
      workspaceRootPath,
      rootUri
    );
    if (node) projects.push(node);
  }
  return projects;
}

/** Find a project node and its parent id from tree. */
export function findProjectNodeWithParent(
  projects: ProjectNode[],
  targetProjectId: string,
  parentProjectId: string | null = null,
): ProjectNodeWithParent | null {
  for (const project of projects) {
    if (project.projectId === targetProjectId) {
      return { node: project, parentProjectId };
    }
    if (project.children?.length) {
      const hit = findProjectNodeWithParent(
        project.children,
        targetProjectId,
        project.projectId,
      );
      if (hit) return hit;
    }
  }
  return null;
}

/** Check whether a project id exists inside a subtree. */
export function hasProjectInSubtree(project: ProjectNode, targetProjectId: string): boolean {
  if (project.projectId === targetProjectId) return true;
  for (const child of project.children ?? []) {
    if (hasProjectInSubtree(child, targetProjectId)) return true;
  }
  return false;
}

/** Collect project ids from a subtree (root included). */
export function collectProjectSubtreeIds(project: ProjectNode): string[] {
  const ids: string[] = [];
  const stack = [project];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    ids.push(current.projectId);
    // Depth-first collection to include all descendants.
    for (const child of current.children ?? []) {
      stack.push(child);
    }
  }
  return ids;
}

/** Build a projectId -> title map from trees. */
export function buildProjectTitleMap(projects: ProjectNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const stack = [...projects];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.projectId) map.set(current.projectId, current.title);
    // Flatten tree for quick project title lookup.
    for (const child of current.children ?? []) {
      stack.push(child);
    }
  }
  return map;
}
