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
import { getProjectStorageRootUri } from "./vfsService";
import { getProjectRegistryEntries } from "./projectRegistryConfig";
import { syncProjectsFromDisk } from "./projectDbService";

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
    isFavorite: z.boolean().optional(),
    childrenIds: z.array(z.string()).optional(),
    // Child project map uses projectId -> rootUri.
    projects: z.record(z.string(), z.string()).optional(),
    // Skill folder names to ignore for this project.
    ignoreSkills: z.array(z.string()).optional(),
    /** Feature ids that have been explicitly initialized (e.g. "index", "tasks"). */
    initializedFeatures: z.array(z.string()).optional(),
    /** AI-inferred or user-set project type. */
    projectType: z
      .enum(['code', 'document', 'data', 'design', 'research', 'general'])
      .optional(),
    /** When true the user explicitly set the type; auto-inference won't overwrite. */
    typeManuallySet: z.boolean().optional(),
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
  /** Whether the project is favorited (pinned to top). */
  isFavorite?: boolean;
  /** AI-inferred or user-set project type. */
  projectType?: string;
  /** Child projects. */
  children: ProjectNode[];
};

/** Flat project list item used by paginated project queries. */
export type ProjectListItem = {
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
  /** Whether the project is favorited (pinned to top). */
  isFavorite?: boolean;
  /** AI-inferred or user-set project type. */
  projectType?: string;
  /** Nesting depth in the project tree. */
  depth: number;
  /** Child project count. */
  childCount: number;
};

/** Flat project option item used by lightweight selectors. */
export type ProjectFlatItem = {
  /** Project id. */
  projectId: string;
  /** Project display title. */
  title: string;
  /** Project icon. */
  icon?: string;
  /** Project root URI. */
  rootUri: string;
  /** Nesting depth in the project tree. */
  depth: number;
};

/** Paginated project list response. */
export type ProjectListPage = {
  /** Current page items. */
  items: ProjectListItem[];
  /** Total items after current filters are applied. */
  total: number;
  /** Request cursor used for this page. */
  cursor: string | null;
  /** Cursor for the next page. */
  nextCursor: string | null;
  /** Effective page size. */
  pageSize: number;
  /** Whether there are more items after the current page. */
  hasMore: boolean;
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
const DEFAULT_PROJECT_LIST_PAGE_SIZE = 48;
const MAX_PROJECT_LIST_PAGE_SIZE = 120;

type ProjectListDbRow = {
  id: string;
  title: string;
  icon: string | null;
  rootUri: string;
  parentId: string | null;
  sortIndex: number;
  isFavorite: boolean;
  type: string | null;
};

type ProjectListDbClient = {
  project: {
    /** Query the project snapshot used by list pages. */
    findMany: (args: {
      where: { isDeleted: boolean };
      select: {
        id: true;
        title: true;
        icon: true;
        rootUri: true;
        parentId: true;
        sortIndex: true;
        isFavorite: true;
        type: true;
      };
    }) => Promise<ProjectListDbRow[]>;
  };
};

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

/** Normalize project list page size into a safe bounded integer. */
function normalizeProjectListPageSize(pageSize?: number | null): number {
  if (!pageSize || Number.isNaN(pageSize)) return DEFAULT_PROJECT_LIST_PAGE_SIZE;
  const normalized = Math.floor(pageSize);
  if (normalized < 1) return DEFAULT_PROJECT_LIST_PAGE_SIZE;
  return Math.min(normalized, MAX_PROJECT_LIST_PAGE_SIZE);
}

/** Decode offset cursor for paginated project list queries. */
function decodeProjectListCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  const offset = Number.parseInt(cursor, 10);
  if (Number.isNaN(offset) || offset < 0) return 0;
  return offset;
}

/** Normalize project type for list filtering. */
function normalizeProjectListType(projectType?: string | null): string {
  return projectType?.trim() || "general";
}

/** Compare sibling project rows while preserving stored sort order. */
function compareProjectListRows(a: ProjectListDbRow, b: ProjectListDbRow): number {
  if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
  const titleCompare = a.title.localeCompare(b.title);
  if (titleCompare !== 0) return titleCompare;
  return a.id.localeCompare(b.id);
}

/** Flatten project trees into a list that preserves visual tree depth. */
function flattenProjectNodes(
  nodes: ProjectNode[],
  depth = 0,
): ProjectListItem[] {
  const items: ProjectListItem[] = [];
  for (const node of nodes) {
    items.push({
      projectId: node.projectId,
      title: node.title,
      icon: node.icon,
      rootUri: node.rootUri,
      isGitProject: node.isGitProject,
      isFavorite: node.isFavorite,
      projectType: node.projectType,
      depth,
      childCount: node.children?.length ?? 0,
    });
    if (node.children?.length) {
      items.push(...flattenProjectNodes(node.children, depth + 1));
    }
  }
  return items;
}

/** Flatten DB project snapshot rows into page items while preserving tree order. */
function flattenProjectRows(rows: ProjectListDbRow[]): ProjectListItem[] {
  if (rows.length === 0) return [];

  const rowIdSet = new Set(rows.map((row) => row.id));
  const childrenByParent = new Map<string | null, ProjectListDbRow[]>();

  for (const row of rows) {
    const trimmedParentId = row.parentId?.trim() || null;
    const parentId = trimmedParentId && rowIdSet.has(trimmedParentId)
      ? trimmedParentId
      : null;
    const bucket = childrenByParent.get(parentId);
    if (bucket) {
      bucket.push(row);
      continue;
    }
    childrenByParent.set(parentId, [row]);
  }

  for (const bucket of childrenByParent.values()) {
    bucket.sort(compareProjectListRows);
  }

  const items: ProjectListItem[] = [];
  const visit = (nodes: ProjectListDbRow[], depth: number) => {
    for (const row of nodes) {
      const children = childrenByParent.get(row.id) ?? [];
      items.push({
        projectId: row.id,
        title: row.title,
        icon: row.icon ?? undefined,
        rootUri: row.rootUri,
        isGitProject: false,
        isFavorite: row.isFavorite,
        projectType: row.type ?? undefined,
        depth,
        childCount: children.length,
      });
      if (children.length > 0) {
        visit(children, depth + 1);
      }
    }
  };

  visit(childrenByParent.get(null) ?? [], 0);
  return items;
}

/** Resolve whether a project path is inside a git repository. */
async function resolveGitProjectStatus(
  projectRootPath: string,
  storageRootPath?: string,
): Promise<boolean> {
  const resolvedProjectRoot = path.resolve(projectRootPath);
  const resolvedStorageRoot = storageRootPath
    ? path.resolve(storageRootPath)
    : "";
  const shouldBoundStorageRoot =
    Boolean(resolvedStorageRoot) &&
    (resolvedProjectRoot === resolvedStorageRoot ||
      resolvedProjectRoot.startsWith(resolvedStorageRoot + path.sep));
  const limitRoot = shouldBoundStorageRoot ? resolvedStorageRoot : "";
  const filesystemRoot = path.parse(resolvedProjectRoot).root;
  let cursor = resolvedProjectRoot;
  // 逻辑：项目位于存储根内时，向上扫描会限制到该存储根；否则只扫描到文件系统根。
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
  storageRootPath?: string,
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
          storageRootPath,
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
          storageRootPath,
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
      storageRootPath,
    );
    return {
      projectId,
      title: config.title ?? path.basename(projectRootPath),
      icon: config.icon ?? undefined,
      rootUri: rootUriOverride ?? toFileUriWithoutEncoding(projectRootPath),
      isGitProject,
      isFavorite: config.isFavorite ?? false,
      projectType: config.projectType ?? undefined,
      children: childNodes,
    };
  } catch {
    // Return null on read failure to avoid breaking the full list.
    return null;
  }
}

/** Read the project trees from the top-level project registry. */
export async function readProjectTrees(): Promise<ProjectNode[]> {
  const projectStorageRootUri = getProjectStorageRootUri();
  let projectStorageRootPath: string | undefined;
  try {
    projectStorageRootPath = resolveFilePathFromUri(projectStorageRootUri);
  } catch {
    projectStorageRootPath = undefined;
  }
  const projectEntries = getProjectRegistryEntries();
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
      projectStorageRootPath,
      rootUri
    );
    if (node) projects.push(node);
  }
  return projects;
}

/** Read project snapshot rows from the database and backfill once when empty. */
async function readProjectListRows(prisma: ProjectListDbClient): Promise<ProjectListDbRow[]> {
  const select = {
    id: true,
    title: true,
    icon: true,
    rootUri: true,
    parentId: true,
    sortIndex: true,
    isFavorite: true,
    type: true,
  } as const;

  let rows = await prisma.project.findMany({
    where: { isDeleted: false },
    select,
  });

  if (rows.length === 0 && getProjectRegistryEntries().length > 0) {
    // 逻辑：首轮分页命中空快照时，同步一次磁盘项目树，避免旧数据集无法进入新分页链路。
    await syncProjectsFromDisk(prisma as any);
    rows = await prisma.project.findMany({
      where: { isDeleted: false },
      select,
    });
  }

  return rows;
}

/** Resolve project storage root path for bounded git detection. */
function resolveProjectStorageRootPath(): string | undefined {
  const projectStorageRootUri = getProjectStorageRootUri();
  try {
    return resolveFilePathFromUri(projectStorageRootUri);
  } catch {
    return undefined;
  }
}

/** Apply project search and type filters to flattened page items. */
function filterProjectListItems(
  items: ProjectListItem[],
  input?: {
    search?: string | null;
    projectType?: string | null;
  },
) {
  let nextItems = items;
  const search = input?.search?.trim().toLowerCase();
  if (search) {
    nextItems = nextItems.filter(
      (item) =>
        item.title.toLowerCase().includes(search) ||
        item.rootUri.toLowerCase().includes(search),
    );
  }

  const projectType = input?.projectType?.trim();
  if (projectType) {
    nextItems = nextItems.filter(
      (item) => normalizeProjectListType(item.projectType) === projectType,
    );
  }

  return nextItems;
}

/** Resolve git flags only for the current page to avoid scanning every project root. */
async function hydratePagedProjectGitStatus(items: ProjectListItem[]): Promise<ProjectListItem[]> {
  if (items.length === 0) return items;
  const projectStorageRootPath = resolveProjectStorageRootPath();
  return Promise.all(
    items.map(async (item) => {
      let isGitProject = false;
      try {
        const rootPath = resolveFilePathFromUri(item.rootUri);
        isGitProject = await resolveGitProjectStatus(rootPath, projectStorageRootPath);
      } catch {
        isGitProject = false;
      }
      return { ...item, isGitProject };
    }),
  );
}

/** List top-level project trees as a flattened paginated collection. */
export async function listProjectListPage(
  prisma: ProjectListDbClient,
  input?: {
  cursor?: string | null;
  pageSize?: number | null;
  search?: string | null;
  projectType?: string | null;
}): Promise<ProjectListPage> {
  const rows = await readProjectListRows(prisma);
  const items = filterProjectListItems(flattenProjectRows(rows), input);

  const total = items.length;
  const cursor = input?.cursor?.trim() || null;
  const pageSize = normalizeProjectListPageSize(input?.pageSize);
  const offset = Math.min(decodeProjectListCursor(cursor), total);
  const pageItems = await hydratePagedProjectGitStatus(
    items.slice(offset, offset + pageSize),
  );
  const nextOffset = offset + pageItems.length;
  const hasMore = nextOffset < total;

  return {
    items: pageItems,
    total,
    cursor,
    nextCursor: hasMore ? String(nextOffset) : null,
    pageSize,
    hasMore,
  };
}

/** List lightweight flat projects for selectors without loading the full tree. */
export async function listProjectFlat(prisma: ProjectListDbClient): Promise<ProjectFlatItem[]> {
  const rows = await readProjectListRows(prisma);
  return flattenProjectRows(rows).map((item) => ({
    projectId: item.projectId,
    title: item.title,
    icon: item.icon,
    rootUri: item.rootUri,
    depth: item.depth,
  }));
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

/** Build a projectId -> icon map from trees. */
export function buildProjectIconMap(projects: ProjectNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const stack = [...projects];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.projectId && current.icon) map.set(current.projectId, current.icon);
    for (const child of current.children ?? []) {
      stack.push(child);
    }
  }
  return map;
}
