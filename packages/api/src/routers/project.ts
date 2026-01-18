import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { t, shieldedProcedure } from "../index";
import {
  getProjectRootUri,
  getWorkspaceRootPath,
  removeActiveWorkspaceProject,
  resolveFilePathFromUri,
  toFileUriWithoutEncoding,
  upsertActiveWorkspaceProject,
} from "../services/vfsService";
import {
  PROJECT_META_DIR,
  findProjectNodeWithParent,
  getProjectMetaPath,
  hasProjectInSubtree,
  projectConfigSchema,
  readProjectConfig,
  readWorkspaceProjectTrees,
  type ProjectConfig,
} from "../services/projectTreeService";
import {
  getProjectGitBranches,
  getProjectGitCommits,
  getProjectGitInfo,
} from "../services/projectGitService";
import { moveProjectStorage } from "../services/projectStorageService";

/** File name for project homepage content. */
const PAGE_HOME_FILE = "page-home.json";
const BOARD_SNAPSHOT_FILE = "board.snapshot.json";
/** Default title used when the user does not provide one. */
const DEFAULT_PROJECT_TITLE = "Untitled Project";
/** Prefix for generated project ids. */
const PROJECT_ID_PREFIX = "proj_";

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

/** Build a safe folder name from user input. */
function toSafeFolderName(title: string): string {
  const normalized = title.trim().toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

/** Resolve a unique project root directory under workspace. */
async function ensureUniqueProjectRoot(
  workspaceRootPath: string,
  baseName: string
): Promise<string> {
  let candidate = baseName;
  let counter = 1;
  // 中文注释：目录名冲突时递增后缀，直到找到可用目录。
  while (await fileExists(path.join(workspaceRootPath, candidate))) {
    candidate = `${baseName}-${counter}`;
    counter += 1;
  }
  return path.join(workspaceRootPath, candidate);
}

/** Write JSON file with tmp + rename for atomicity. */
async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  const content = JSON.stringify(payload, null, 2);
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

/** Build homepage content path from a project root. */
function getHomePagePath(projectRootPath: string): string {
  return path.join(projectRootPath, PROJECT_META_DIR, PAGE_HOME_FILE);
}

/** Build board snapshot path from a project root. */
function getBoardSnapshotPath(projectRootPath: string): string {
  return path.join(projectRootPath, PROJECT_META_DIR, BOARD_SNAPSHOT_FILE);
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

/** Resolve a project root path from config by project id. */
function resolveProjectRootPath(projectId: string): string {
  const rootUri = getProjectRootUri(projectId);
  if (!rootUri) {
    throw new Error("Project not found.");
  }
  return resolveFilePathFromUri(rootUri);
}

/** Append a child project entry into parent project.json. */
async function appendChildProjectEntry(
  parentProjectId: string,
  childProjectId: string,
  childRootUri: string
): Promise<void> {
  const parentRootPath = resolveProjectRootPath(parentProjectId);
  const metaPath = getProjectMetaPath(parentRootPath);
  const existing = (await readJsonFile(metaPath)) ?? {};
  const parsed = projectConfigSchema.parse(existing);
  const nextProjects = { ...(parsed.projects ?? {}) };
  if (!nextProjects[childProjectId]) {
    nextProjects[childProjectId] = childRootUri;
  }
  const nextConfig = projectConfigSchema.parse({
    ...parsed,
    projects: nextProjects,
  });
  // 中文注释：更新父项目的子项目列表，避免重复写入。
  await writeJsonAtomic(metaPath, nextConfig);
}

/** Remove a child project entry from parent project.json. */
async function removeChildProjectEntry(
  parentProjectId: string,
  childProjectId: string
): Promise<void> {
  const parentRootPath = resolveProjectRootPath(parentProjectId);
  const metaPath = getProjectMetaPath(parentRootPath);
  const existing = (await readJsonFile(metaPath)) ?? {};
  const parsed = projectConfigSchema.parse(existing);
  const nextProjects = { ...(parsed.projects ?? {}) };
  if (!nextProjects[childProjectId]) return;
  // 删除子项目映射，确保父项目配置保持最新。
  delete nextProjects[childProjectId];
  const nextConfig = projectConfigSchema.parse({
    ...parsed,
    projects: nextProjects,
  });
  await writeJsonAtomic(metaPath, nextConfig);
}


export const projectRouter = t.router({
  /** List all project roots under workspace. */
  list: shieldedProcedure.query(async () => {
    return readWorkspaceProjectTrees();
  }),

  /** Create a new project under workspace root or custom root. */
  create: shieldedProcedure
    .input(
      z.object({
        title: z.string().nullable().optional(),
        folderName: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        rootUri: z.string().optional(),
        parentProjectId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const workspaceRootPath = getWorkspaceRootPath();
      const title = input.title?.trim() || DEFAULT_PROJECT_TITLE;
      const folderName = toSafeFolderName(input.folderName?.trim() || title);
      let projectRootPath: string;
      let existingConfig: ProjectConfig | null = null;
      if (input.rootUri?.trim()) {
        const rawRoot = input.rootUri.trim();
        projectRootPath = rawRoot.startsWith("file://")
          ? resolveFilePathFromUri(rawRoot)
          : path.resolve(rawRoot);
        await fs.mkdir(projectRootPath, { recursive: true });
        const metaPath = getProjectMetaPath(projectRootPath);
        if (await fileExists(metaPath)) {
          existingConfig = await readProjectConfig(projectRootPath);
        }
      } else {
        projectRootPath = await ensureUniqueProjectRoot(workspaceRootPath, folderName);
      }
      const projectRootUri = toFileUriWithoutEncoding(projectRootPath);
      const projectId = existingConfig?.projectId ?? `${PROJECT_ID_PREFIX}${randomUUID()}`;
      const fallbackTitle = input.rootUri
        ? path.basename(projectRootPath)
        : title;
      const config = projectConfigSchema.parse(
        existingConfig ?? {
          schema: 1,
          projectId,
          title: input.title?.trim() || fallbackTitle,
          icon: input.icon ?? undefined,
          projects: {},
        }
      );
      const metaPath = getProjectMetaPath(projectRootPath);
      if (!existingConfig) {
        await writeJsonAtomic(metaPath, config);
      } else if (!existingConfig.projects) {
        await writeJsonAtomic(metaPath, { ...existingConfig, projects: {} });
      }
      if (!input.parentProjectId) {
        upsertActiveWorkspaceProject(projectId, projectRootUri);
      }
      if (input.parentProjectId) {
        await appendChildProjectEntry(
          input.parentProjectId,
          projectId,
          projectRootUri
        );
      }
      return {
        project: {
          projectId: config.projectId,
          title: config.title ?? fallbackTitle,
          icon: config.icon ?? undefined,
          rootUri: projectRootUri,
        },
      };
    }),

  /** Get a single project by project id. */
  get: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const config = await readProjectConfig(rootPath);
      return {
        project: {
          projectId: input.projectId,
          title: config.title ?? path.basename(rootPath),
          icon: config.icon ?? undefined,
          rootUri: toFileUriWithoutEncoding(rootPath),
        },
      };
    }),

  /** Get git info for a project. */
  getGitInfo: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getProjectGitInfo(input.projectId);
    }),

  /** Get git branches for a project. */
  getGitBranches: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getProjectGitBranches(input.projectId);
    }),

  /** Get git commits for a project. */
  getGitCommits: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        branch: z.string().nullable().optional(),
        cursor: z.string().nullable().optional(),
        pageSize: z.number().int().min(1).max(120).nullable().optional(),
      })
    )
    .query(async ({ input }) => {
      return getProjectGitCommits(input);
    }),

  /** Update project metadata. */
  update: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().optional(),
        icon: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const metaPath = getProjectMetaPath(rootPath);
      const existing = (await readJsonFile(metaPath)) ?? {};
      const next = projectConfigSchema.parse({
        ...existing,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
      });
      await writeJsonAtomic(metaPath, next);
      return { ok: true };
    }),

  /** Remove a project from workspace list without deleting files. */
  remove: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const projectTrees = await readWorkspaceProjectTrees();
      const sourceEntry = findProjectNodeWithParent(projectTrees, input.projectId);
      if (!sourceEntry) {
        throw new Error("Project not found.");
      }
      const parentProjectId = sourceEntry.parentProjectId;
      if (parentProjectId) {
        await removeChildProjectEntry(parentProjectId, input.projectId);
      } else {
        removeActiveWorkspaceProject(input.projectId);
      }
      return { ok: true };
    }),

  /** Permanently delete a project from disk and remove it from workspace. */
  destroy: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const projectTrees = await readWorkspaceProjectTrees();
      const sourceEntry = findProjectNodeWithParent(projectTrees, input.projectId);
      if (!sourceEntry) {
        throw new Error("Project not found.");
      }
      const rootUri = getProjectRootUri(input.projectId);
      if (!rootUri) {
        throw new Error("Project not found.");
      }
      const rootPath = resolveFilePathFromUri(rootUri);
      // 中文注释：先删除磁盘目录，再移除项目映射，避免列表与磁盘状态不一致。
      await fs.rm(rootPath, { recursive: true, force: true });
      const parentProjectId = sourceEntry.parentProjectId;
      if (parentProjectId) {
        await removeChildProjectEntry(parentProjectId, input.projectId);
      } else {
        removeActiveWorkspaceProject(input.projectId);
      }
      return { ok: true };
    }),

  /** Move a project under another parent or to workspace root. */
  move: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetParentProjectId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const targetParentProjectId = input.targetParentProjectId ?? null;
      const projectTrees = await readWorkspaceProjectTrees();
      const sourceEntry = findProjectNodeWithParent(projectTrees, input.projectId);
      if (!sourceEntry) {
        throw new Error("Project not found.");
      }
      const sourceNode = sourceEntry.node;
      const projectRootUri = sourceNode.rootUri;

      if (targetParentProjectId === input.projectId) {
        throw new Error("Cannot move project under itself.");
      }
      if (targetParentProjectId && hasProjectInSubtree(sourceNode, targetParentProjectId)) {
        throw new Error("Cannot move project into its descendant.");
      }
      if (targetParentProjectId) {
        const targetEntry = findProjectNodeWithParent(projectTrees, targetParentProjectId);
        if (!targetEntry) {
          throw new Error("Target parent project not found.");
        }
      }

      const parentProjectId = sourceEntry.parentProjectId;
      if (parentProjectId === targetParentProjectId) {
        return { ok: true, unchanged: true };
      }

      // 先从原父节点移除，避免重复挂载。
      if (parentProjectId) {
        await removeChildProjectEntry(parentProjectId, input.projectId);
      } else {
        removeActiveWorkspaceProject(input.projectId);
      }

      if (targetParentProjectId) {
        await appendChildProjectEntry(
          targetParentProjectId,
          input.projectId,
          projectRootUri
        );
      } else {
        upsertActiveWorkspaceProject(input.projectId, projectRootUri);
      }

      return { ok: true };
    }),

  /** Move project storage folder and update paths. */
  moveStorage: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetParentPath: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await moveProjectStorage({
        projectId: input.projectId,
        targetParentPath: input.targetParentPath,
        prisma: ctx.prisma,
      });
      return {
        ok: true,
        rootUri: result.rootUri,
        unchanged: result.unchanged ?? false,
      };
    }),

  /** Get homepage data for a project. */
  getHomePage: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const pagePath = getHomePagePath(rootPath);
      const raw = await readJsonFile(pagePath);
      if (!raw || typeof raw !== "object") {
        return { data: null, meta: null };
      }
      const payload = raw as {
        schema?: number;
        version?: number;
        updatedAt?: string;
        data?: unknown;
      };
      return {
        data: (payload.data ?? null) as unknown,
        meta: {
          schema: payload.schema ?? 1,
          version: payload.version ?? 0,
          updatedAt: payload.updatedAt ?? null,
        },
      };
    }),

  /** Publish homepage data for a project. */
  publishHomePage: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        data: z.any(),
      })
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const pagePath = getHomePagePath(rootPath);
      const version = Date.now();
      const payload = {
        schema: 1,
        version,
        updatedAt: new Date(version).toISOString(),
        data: input.data,
      };
      // 中文注释：仅发布时写入首页内容，避免编辑中产生脏数据。
      await writeJsonAtomic(pagePath, payload);
      return {
        ok: true,
        meta: {
          schema: payload.schema,
          version: payload.version,
          updatedAt: payload.updatedAt,
        },
      };
    }),

  /** Get board snapshot for a project. */
  getBoard: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const boardPath = getBoardSnapshotPath(rootPath);
      const raw = await readJsonFile(boardPath);
      return { board: raw ?? null };
    }),

  /** Save board snapshot for a project. */
  saveBoard: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        schemaVersion: z.number().optional().nullable(),
        nodes: z.any(),
        connectors: z.any(),
        viewport: z.any(),
        version: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const boardPath = getBoardSnapshotPath(rootPath);
      const payload = {
        schemaVersion: input.schemaVersion ?? 1,
        nodes: input.nodes ?? [],
        connectors: input.connectors ?? [],
        viewport: input.viewport ?? null,
        version: input.version ?? Date.now(),
      };
      await writeJsonAtomic(boardPath, payload);
      return { ok: true };
    }),
});

export type ProjectRouter = typeof projectRouter;
