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
import { existsSync, promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";
import {
  getProjectRootUri,
  getProjectRootPath,
  getProjectStorageRootPath,
  removeTopLevelProject,
  resolveLocalPathFromUri,
  setTopLevelProjectEntries,
  toFileUriWithoutEncoding,
  upsertTopLevelProject,
} from "../services/vfsService";
import { getProjectRegistryEntries } from "../services/projectRegistryConfig";
import {
  PROJECT_META_DIR,
  findProjectNodeWithParent,
  getProjectMetaPath,
  hasProjectInSubtree,
  listProjectFlat,
  listProjectListPage,
  projectConfigSchema,
  readProjectConfig,
  readProjectTrees,
  type ProjectConfig,
} from "../services/projectTreeService";
import { syncProjectsFromDisk } from "../services/projectDbService";
import { requireSummaryRuntime } from "../services/summaryRuntime";
import { listSchedulerTaskRecords } from "../services/schedulerTaskRecordService";
import {
  getProjectGitBranches,
  getProjectGitCommits,
  getProjectGitInfo,
  getProjectGitStatus,
  getProjectGitDiff,
  commitProjectGit,
  ensureGitRepository,
  checkPathIsGitProject,
  cloneGitRepository,
} from "../services/projectGitService";
import { moveProjectStorage } from "../services/projectStorageService";
import { listProjectFilesChangedInRange } from "../services/projectFileChangeService";
import { endOfDay, parseDateKey, startOfDay } from "../services/summaryDateUtils";

/** File name for project homepage content. */
const PAGE_HOME_FILE = "page-home.json";
const BOARD_SNAPSHOT_FILE = "board.snapshot.json";
/** Default title used when the user does not provide one. */
const DEFAULT_PROJECT_TITLE = "Untitled Project";
/** Prefix for generated project ids. */
const PROJECT_ID_PREFIX = "proj_";
/** Cache directory name under root path. */
const CACHE_DIR_NAME = ".openloaf-cache";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CacheScopeInput = {
  /** Target project id. */
  projectId?: string;
};

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

/** Sync the project DB snapshot after filesystem mutations without breaking the main flow. */
async function syncProjectSnapshot(prisma: unknown): Promise<void> {
  try {
    await syncProjectsFromDisk(prisma as any);
  } catch (error) {
    // 逻辑：项目主操作已经成功落盘时，同步失败只记录告警，避免把成功操作误报成失败。
    console.warn("[project] sync snapshot failed", error);
  }
}

/** Build a safe folder name from user input. */
function toSafeFolderName(title: string): string {
  const normalized = title.trim();
  // 中文注释：保留中文等 Unicode 字符，替换非法文件名字符与路径分隔符。
  const sanitized = normalized
    .replace(/[\\\/\0]/g, "-")
    .replace(/[<>:"|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .trim();
  return sanitized || "project";
}

/** Resolve a unique project root directory under the project storage root. */
async function ensureUniqueProjectRoot(
  storageRootPath: string,
  baseName: string
): Promise<string> {
  let candidate = baseName;
  let counter = 1;
  // 逻辑：目录名冲突时递增后缀，直到找到可用目录。
  while (await fileExists(path.join(storageRootPath, candidate))) {
    candidate = `${baseName}-${counter}`;
    counter += 1;
  }
  return path.join(storageRootPath, candidate);
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

/** Code project marker files — presence of any means it's a code project. */
const CODE_PROJECT_MARKERS = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "pom.xml",
  "build.gradle",
  "Gemfile",
  "composer.json",
  "CMakeLists.txt",
  "Makefile",
  ".sln",
  "tsconfig.json",
  "deno.json",
  "mix.exs",
  "pubspec.yaml",
];

/** Detect whether a directory is a code/dev project. */
async function detectCodeProject(dirPath: string): Promise<boolean> {
  for (const marker of CODE_PROJECT_MARKERS) {
    if (await fileExists(path.join(dirPath, marker))) return true;
  }
  return false;
}

/** Detect whether a project already has an icon set in its config. */
async function detectHasIcon(dirPath: string): Promise<boolean> {
  const metaPath = getProjectMetaPath(dirPath);
  if (!(await fileExists(metaPath))) return false;
  const config = await readProjectConfig(dirPath).catch(() => null);
  return Boolean(config?.icon);
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

/** Resolve gitignore template path for auto git init. */
async function resolveGitignoreTemplatePath(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "apps/server/src/assets/gitignore-template.txt"),
    path.resolve(process.cwd(), "src/assets/gitignore-template.txt"),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  // 中文注释：优先使用仓库内模板路径，找不到时返回默认候选路径。
  return candidates[0] ?? "";
}

/** Resolve a project root path from config by project id. */
function resolveProjectRootPath(projectId: string): string {
  const rootUri = getProjectRootUri(projectId);
  if (!rootUri) {
    throw new Error("Project not found.");
  }
  return resolveLocalPathFromUri(rootUri);
}

/** Soft-delete a missing project from DB and remove from registry. */
async function cleanupMissingProject(
  projectId: string,
  prisma: { project: { updateMany: (args: any) => Promise<any> } },
): Promise<void> {
  try {
    removeTopLevelProject(projectId);
  } catch {
    // ignore registry cleanup errors
  }
  try {
    await prisma.project.updateMany({
      where: { id: projectId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  } catch {
    // ignore DB cleanup errors
  }
}

/**
 * Resolve a project root path, cleaning up DB/registry when the project
 * directory is missing from disk or registry. Throws NOT_FOUND with
 * message "PROJECT_REMOVED" so the frontend can show a friendly toast.
 */
async function resolveProjectRootPathOrCleanup(
  projectId: string,
  prisma: { project: { updateMany: (args: any) => Promise<any> } },
): Promise<string> {
  const rootUri = getProjectRootUri(projectId);
  if (!rootUri) {
    await cleanupMissingProject(projectId, prisma);
    throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_REMOVED" });
  }
  const rootPath = resolveLocalPathFromUri(rootUri);
  if (!existsSync(rootPath)) {
    await cleanupMissingProject(projectId, prisma);
    throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_REMOVED" });
  }
  return rootPath;
}

/** Resolve cache root path from project scope. */
function resolveCacheRootPath(input: CacheScopeInput): string {
  const projectId = input.projectId?.trim();
  if (projectId) {
    const rootPath = getProjectRootPath(projectId);
    if (!rootPath) {
      throw new Error("Project not found.");
    }
    return rootPath;
  }
  return getProjectStorageRootPath();
}

/** Compute directory size recursively. */
async function getDirectorySizeBytes(dirPath: string): Promise<number> {
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(entryPath);
      continue;
    }
    if (entry.isFile()) {
      try {
        const stat = await fs.stat(entryPath);
        total += stat.size;
      } catch {
        // 逻辑：单文件读取失败时忽略，继续统计其他项。
      }
    }
  }
  return total;
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
  // 逻辑：更新父项目的子项目列表，避免重复写入。
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

type ProjectOrderPosition = "before" | "after";

/** Build ordered project entries after insert or reorder. */
function buildOrderedProjectEntries(
  entries: Array<[string, string]>,
  projectId: string,
  projectRootUri: string,
  targetSiblingProjectId?: string | null,
  targetPosition?: ProjectOrderPosition,
): Array<[string, string]> {
  const nextEntries = entries.filter(([id]) => id !== projectId);
  const position = targetPosition === "before" ? "before" : "after";
  if (!targetSiblingProjectId) {
    return [...nextEntries, [projectId, projectRootUri]];
  }
  const targetIndex = nextEntries.findIndex(([id]) => id === targetSiblingProjectId);
  if (targetIndex < 0) {
    return [...nextEntries, [projectId, projectRootUri]];
  }
  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  nextEntries.splice(insertIndex, 0, [projectId, projectRootUri]);
  return nextEntries;
}

/** Reorder child project entries under a parent project.json. */
async function reorderChildProjectEntry(
  parentProjectId: string,
  childProjectId: string,
  childRootUri: string,
  targetSiblingProjectId?: string | null,
  targetPosition?: ProjectOrderPosition,
): Promise<void> {
  const parentRootPath = resolveProjectRootPath(parentProjectId);
  const metaPath = getProjectMetaPath(parentRootPath);
  const existing = (await readJsonFile(metaPath)) ?? {};
  const parsed = projectConfigSchema.parse(existing);
  const ordered = buildOrderedProjectEntries(
    Object.entries(parsed.projects ?? {}),
    childProjectId,
    childRootUri,
    targetSiblingProjectId,
    targetPosition,
  );
  const nextConfig = projectConfigSchema.parse({
    ...parsed,
    projects: Object.fromEntries(ordered),
  });
  // 逻辑：按目标位置重排子项目顺序，保持排序落盘。
  await writeJsonAtomic(metaPath, nextConfig);
}

/** Reorder root project entries in project registry config. */
function reorderTopLevelProjectEntry(
  projectId: string,
  projectRootUri: string,
  targetSiblingProjectId?: string | null,
  targetPosition?: ProjectOrderPosition,
): void {
  const ordered = buildOrderedProjectEntries(
    Object.entries(getTopLevelProjects()),
    projectId,
    projectRootUri,
    targetSiblingProjectId,
    targetPosition,
  );
  // 逻辑：重建顶层项目映射，保持根项目排序。
  setTopLevelProjectEntries(ordered);
}

/** Return the project map. */
function getTopLevelProjects(): Record<string, string> {
  return Object.fromEntries(getProjectRegistryEntries());
}

/** Schema for cache management input. */
const cacheScopeSchema = z
  .object({
    projectId: z.string().optional(),
  });

/** Schema for project AI settings payload. */
const aiSettingsSchema = z.object({
  /** Whether project overrides are enabled. */
  overrideEnabled: z.boolean().optional(),
  /** Enable auto summary for docs. */
  autoSummaryEnabled: z.boolean().optional(),
  /** Selected hours for daily auto summary. */
  autoSummaryHours: z.array(z.number().int().min(0).max(24)).optional(),
});

/** Normalize auto summary hours. */
function normalizeAutoSummaryHours(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  // 逻辑：过滤无效小时并去重排序。
  return Array.from(
    new Set(
      raw
        .filter((value) => typeof value === "number" && Number.isInteger(value))
        .filter((value) => value >= 0 && value <= 24),
    ),
  ).sort((a, b) => a - b);
}

/** Normalize project AI settings payload. */
function normalizeAiSettings(raw: z.infer<typeof aiSettingsSchema>) {
  return {
    overrideEnabled: typeof raw.overrideEnabled === "boolean" ? raw.overrideEnabled : undefined,
    autoSummaryEnabled:
      typeof raw.autoSummaryEnabled === "boolean" ? raw.autoSummaryEnabled : undefined,
    autoSummaryHours: normalizeAutoSummaryHours(raw.autoSummaryHours),
  };
}

export const projectRouter = t.router({
  /** List all project roots under project storage. */
  list: shieldedProcedure.query(async () => {
    return readProjectTrees();
  }),

  /** List flattened projects with cursor pagination for grid views. */
  listPaged: shieldedProcedure
    .input(
      z.object({
        cursor: z.string().nullable().optional(),
        pageSize: z.number().int().min(1).max(120).nullable().optional(),
        search: z.string().nullable().optional(),
        projectType: z
          .enum(['code', 'document', 'data', 'design', 'research', 'general', 'temp'])
          .nullable()
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return listProjectListPage(ctx.prisma, input);
    }),

  /** List lightweight flat projects for selectors and filters. */
  listFlat: shieldedProcedure.query(async ({ ctx }) => {
    return listProjectFlat(ctx.prisma);
  }),

  /** Check whether a directory path is a git project and detect project type. */
  checkPath: shieldedProcedure
    .input(z.object({ dirPath: z.string() }))
    .query(async ({ input }) => {
      const raw = input.dirPath.trim();
      if (!raw) return { isGitProject: false, isCodeProject: false, hasIcon: false };
      const resolved = raw.startsWith("file://")
        ? resolveLocalPathFromUri(raw)
        : path.resolve(raw);
      const [isGit, isCode, hasIcon] = await Promise.all([
        checkPathIsGitProject(resolved),
        detectCodeProject(resolved),
        detectHasIcon(resolved),
      ]);
      return { isGitProject: isGit, isCodeProject: isCode, hasIcon };
    }),

  /** Create a new project under project storage root or custom root. */
  create: shieldedProcedure
    .input(
      z.object({
        title: z.string().nullable().optional(),
        folderName: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        rootUri: z.string().optional(),
        parentProjectId: z.string().optional(),
        enableVersionControl: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const projectStorageRootPath = getProjectStorageRootPath();
      const rawTitle = input.title?.trim() ?? "";
      const rawFolderName = input.folderName?.trim() ?? "";
      // 中文注释：显示名称为空时，优先用文件夹名称兜底，避免落到默认 project-*。
      const resolvedTitle = rawTitle || rawFolderName || DEFAULT_PROJECT_TITLE;
      const folderName = toSafeFolderName(rawFolderName || resolvedTitle);
      let projectRootPath: string;
      let existingConfig: ProjectConfig | null = null;
      if (input.rootUri?.trim()) {
        const rawRoot = input.rootUri.trim();
        projectRootPath = rawRoot.startsWith("file://")
          ? resolveLocalPathFromUri(rawRoot)
          : path.resolve(rawRoot);
        await fs.mkdir(projectRootPath, { recursive: true });
        const metaPath = getProjectMetaPath(projectRootPath);
        if (await fileExists(metaPath)) {
          existingConfig = await readProjectConfig(projectRootPath);
        }
      } else {
        projectRootPath = await ensureUniqueProjectRoot(projectStorageRootPath, folderName);
      }
      const projectRootUri = toFileUriWithoutEncoding(projectRootPath);
      const projectId = existingConfig?.projectId ?? `${PROJECT_ID_PREFIX}${randomUUID()}`;
      const fallbackTitle = input.rootUri
        ? path.basename(projectRootPath)
        : resolvedTitle;
      // 判断是否需要补充 icon 或 projects
      const needIconPatch = existingConfig && !existingConfig.icon && input.icon;
      const needProjectsPatch = existingConfig && !existingConfig.projects;
      const config = projectConfigSchema.parse(
        existingConfig
          ? { ...existingConfig, ...(needIconPatch ? { icon: input.icon } : {}) }
          : {
              schema: 1,
              projectId,
              title: rawTitle || fallbackTitle,
              icon: input.icon ?? undefined,
              projects: {},
              initializedFeatures: ["canvas"],
            },
      );
      const metaPath = getProjectMetaPath(projectRootPath);
      if (!existingConfig) {
        await writeJsonAtomic(metaPath, config);
      } else if (needProjectsPatch || needIconPatch) {
        await writeJsonAtomic(metaPath, config);
      }
      const enableVersionControl = input.enableVersionControl ?? true;
      if (enableVersionControl) {
        // 逻辑：仅在启用项目版本控制时初始化仓库。
        await ensureGitRepository({
          rootPath: projectRootPath,
          defaultBranch: "main",
          templatePath: await resolveGitignoreTemplatePath(),
        });
      }
      if (!input.parentProjectId) {
        upsertTopLevelProject(projectId, projectRootUri);
      }
      if (input.parentProjectId) {
        await appendChildProjectEntry(
          input.parentProjectId,
          projectId,
          projectRootUri
        );
      }
      await syncProjectSnapshot(ctx.prisma);
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
    .query(async ({ ctx, input }) => {
      const rootPath = await resolveProjectRootPathOrCleanup(input.projectId, ctx.prisma);
      const config = await readProjectConfig(rootPath);
      return {
        project: {
          projectId: input.projectId,
          title: config.title ?? path.basename(rootPath),
          icon: config.icon ?? undefined,
          rootUri: toFileUriWithoutEncoding(rootPath),
          initializedFeatures: config.initializedFeatures,
          projectType: config.projectType ?? undefined,
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
        projectType: z
          .enum(['code', 'document', 'data', 'design', 'research', 'general', 'temp'])
          .optional(),
        colorIndex: z.number().int().min(0).max(7).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const metaPath = getProjectMetaPath(rootPath);
      const existing = (await readJsonFile(metaPath)) ?? {};
      const next = projectConfigSchema.parse({
        ...existing,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.projectType !== undefined
          ? { projectType: input.projectType, typeManuallySet: true }
          : {}),
        ...(input.colorIndex !== undefined ? { colorIndex: input.colorIndex } : {}),
      });
      await writeJsonAtomic(metaPath, next);
      await syncProjectSnapshot(ctx.prisma);
      return { ok: true };
    }),

  /** Toggle favorite status for a project. */
  toggleFavorite: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        isFavorite: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const metaPath = getProjectMetaPath(rootPath);
      const existing = (await readJsonFile(metaPath)) ?? {};
      const next = projectConfigSchema.parse({
        ...existing,
        isFavorite: input.isFavorite,
      });
      await writeJsonAtomic(metaPath, next);
      await syncProjectSnapshot(ctx.prisma);
      return { ok: true, isFavorite: input.isFavorite };
    }),

  /** Remove a project from the top-level registry without deleting files. */
  remove: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const projectTrees = await readProjectTrees({ includeTemporary: true });
      const sourceEntry = findProjectNodeWithParent(projectTrees, input.projectId);
      if (!sourceEntry) {
        throw new Error("Project not found.");
      }
      const parentProjectId = sourceEntry.parentProjectId;
      if (parentProjectId) {
        await removeChildProjectEntry(parentProjectId, input.projectId);
      } else {
        removeTopLevelProject(input.projectId);
      }
      await syncProjectSnapshot(ctx.prisma);
      return { ok: true };
    }),

  /** Permanently delete a project from disk and remove it from the top-level registry. */
  destroy: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const projectTrees = await readProjectTrees({ includeTemporary: true });
      const sourceEntry = findProjectNodeWithParent(projectTrees, input.projectId);
      if (!sourceEntry) {
        throw new Error("Project not found.");
      }
      const rootUri = getProjectRootUri(input.projectId);
      if (!rootUri) {
        throw new Error("Project not found.");
      }
      const rootPath = resolveLocalPathFromUri(rootUri);
      // 逻辑：先删除磁盘目录，再移除项目映射，避免列表与磁盘状态不一致。
      await fs.rm(rootPath, { recursive: true, force: true });
      const parentProjectId = sourceEntry.parentProjectId;
      if (parentProjectId) {
        await removeChildProjectEntry(parentProjectId, input.projectId);
      } else {
        removeTopLevelProject(input.projectId);
      }
      await syncProjectSnapshot(ctx.prisma);
      return { ok: true };
    }),

  /** Move a project under another parent or back to the top-level registry. */
  move: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetParentProjectId: z.string().nullable().optional(),
        targetSiblingProjectId: z.string().nullable().optional(),
        targetPosition: z.enum(["before", "after"]).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetSiblingProjectId = input.targetSiblingProjectId?.trim() || null;
      const targetPosition =
        input.targetPosition === "before" ? "before" : "after";
      let targetParentProjectId = input.targetParentProjectId?.trim() || null;
      const projectTrees = await readProjectTrees({ includeTemporary: true });
      const sourceEntry = findProjectNodeWithParent(projectTrees, input.projectId);
      if (!sourceEntry) {
        throw new Error("Project not found.");
      }
      const sourceNode = sourceEntry.node;
      const projectRootUri = sourceNode.rootUri;

      if (targetSiblingProjectId === input.projectId) {
        throw new Error("Cannot move project relative to itself.");
      }
      if (targetSiblingProjectId) {
        const siblingEntry = findProjectNodeWithParent(
          projectTrees,
          targetSiblingProjectId
        );
        if (!siblingEntry) {
          throw new Error("Target sibling project not found.");
        }
        targetParentProjectId = siblingEntry.parentProjectId;
      }

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
      const isSameParent = parentProjectId === targetParentProjectId;
      const shouldReorder = Boolean(targetSiblingProjectId);
      if (!shouldReorder && isSameParent) {
        return { ok: true, unchanged: true };
      }

      if (!isSameParent) {
        // 先从原父节点移除，避免重复挂载。
        if (parentProjectId) {
          await removeChildProjectEntry(parentProjectId, input.projectId);
        } else {
          removeTopLevelProject(input.projectId);
        }
      }

      if (targetParentProjectId) {
        if (shouldReorder) {
          await reorderChildProjectEntry(
            targetParentProjectId,
            input.projectId,
            projectRootUri,
            targetSiblingProjectId,
            targetPosition,
          );
        } else {
          await appendChildProjectEntry(
            targetParentProjectId,
            input.projectId,
            projectRootUri
          );
        }
      } else {
        if (shouldReorder) {
          reorderTopLevelProjectEntry(
            input.projectId,
            projectRootUri,
            targetSiblingProjectId,
            targetPosition,
          );
        } else {
          upsertTopLevelProject(input.projectId, projectRootUri);
        }
      }

      await syncProjectSnapshot(ctx.prisma);
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

  /** Get cache size for a project or the project storage root. */
  getCacheSize: shieldedProcedure
    .input(cacheScopeSchema)
    .query(async ({ input }) => {
      const rootPath = resolveCacheRootPath(input);
      const cachePath = path.join(rootPath, CACHE_DIR_NAME);
      const bytes = await getDirectorySizeBytes(cachePath);
      return { bytes };
    }),

  /** Clear cache for a project or the project storage root. */
  clearCache: shieldedProcedure
    .input(cacheScopeSchema)
    .mutation(async ({ input }) => {
      const rootPath = resolveCacheRootPath(input);
      const cachePath = path.join(rootPath, CACHE_DIR_NAME);
      // 逻辑：强制删除缓存目录，不存在时不报错。
      await fs.rm(cachePath, { recursive: true, force: true });
      return { ok: true };
    }),

  /** Get AI settings for a project. */
  getAiSettings: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rootPath = await resolveProjectRootPathOrCleanup(input.projectId, ctx.prisma);
      const metaPath = getProjectMetaPath(rootPath);
      const raw = (await readJsonFile(metaPath)) ?? {};
      const parsed = projectConfigSchema.parse(raw);
      return { aiSettings: parsed.aiSettings ?? null };
    }),

  /** Update AI settings for a project. */
  setAiSettings: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        aiSettings: aiSettingsSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const metaPath = getProjectMetaPath(rootPath);
      const raw = (await readJsonFile(metaPath)) ?? {};
      const parsed = projectConfigSchema.parse(raw);
      const normalized = normalizeAiSettings(input.aiSettings);
      const next = projectConfigSchema.parse({
        ...parsed,
        aiSettings: normalized,
      });
      await writeJsonAtomic(metaPath, next);
      return { aiSettings: next.aiSettings ?? null };
    }),

  /** List file changes for a specific date. */
  listFileChangesForDate: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        dateKey: z.string().regex(DATE_KEY_PATTERN),
        maxItems: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      const day = parseDateKey(input.dateKey);
      // 中文注释：按本地时间对齐当天范围，返回最新文件变更列表。
      const items = await listProjectFilesChangedInRange({
        projectId: input.projectId,
        from: startOfDay(day),
        to: endOfDay(day),
        maxItems: input.maxItems,
      });
      return { items };
    }),

  /** Run daily summary for a project by date. */
  runSummaryForDay: shieldedProcedure
    .input(z.object({ projectId: z.string(), dateKey: z.string().regex(DATE_KEY_PATTERN) }))
    .mutation(async ({ input }) => {
      const runtime = requireSummaryRuntime();
      return runtime.runDailySummary({
        projectId: input.projectId,
        dateKey: input.dateKey,
        triggeredBy: "manual",
      });
    }),

  /** Run daily summary for all projects by date. */
  runSummaryForAllProjects: shieldedProcedure
    .input(z.object({ dateKey: z.string().regex(DATE_KEY_PATTERN) }))
    .mutation(async ({ input }) => {
      const runtime = requireSummaryRuntime();
      return runtime.runDailySummaryForAllProjects({
        dateKey: input.dateKey,
        triggeredBy: "manual",
      });
    }),

  /** Get summary task status by id. */
  getSummaryTaskStatus: shieldedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      const runtime = requireSummaryRuntime();
      return runtime.getTaskStatus({ taskId: input.taskId });
    }),

  /** List summary task statuses. */
  listSummaryTaskStatus: shieldedProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .query(async ({ input }) => {
      const runtime = requireSummaryRuntime();
      return runtime.listTaskStatus(input);
    }),

  /** List scheduler task records for history. */
  listSchedulerTaskRecords: shieldedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        statuses: z.array(z.string()).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ input }) => {
      return listSchedulerTaskRecords(input);
    }),

  /** Get homepage data for a project. */
  getHomePage: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rootPath = await resolveProjectRootPathOrCleanup(input.projectId, ctx.prisma);
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
      // 逻辑：仅发布时写入首页内容，避免编辑中产生脏数据。
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

  /** Initialize a gated feature for a project (e.g. homepage, history). */
  initFeature: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        feature: z.enum(["index", "tasks", "canvas", "scheduled"]),
      })
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const config = await readProjectConfig(rootPath);
      const features = new Set(config.initializedFeatures ?? []);
      if (features.has(input.feature)) return { ok: true };
      features.add(input.feature);
      const metaPath = getProjectMetaPath(rootPath);
      await writeJsonAtomic(metaPath, {
        ...config,
        initializedFeatures: [...features],
      });
      if (input.feature === "index") {
        const pagePath = getHomePagePath(rootPath);
        await writeJsonAtomic(pagePath, { schema: 1, blocks: [], version: Date.now() });
      }
      return { ok: true };
    }),

  /** Batch-set the enabled features for a project (replaces the entire list). */
  setFeatures: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        features: z.array(z.enum(["index", "tasks", "canvas", "scheduled"])),
      })
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const config = await readProjectConfig(rootPath);
      const metaPath = getProjectMetaPath(rootPath);
      await writeJsonAtomic(metaPath, {
        ...config,
        initializedFeatures: [...new Set(input.features)],
      });
      return { ok: true };
    }),

  /** Get board snapshot for a project. */
  getBoard: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rootPath = await resolveProjectRootPathOrCleanup(input.projectId, ctx.prisma);
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

  /** Clone a remote git repository and register it as a project. */
  cloneFromGit: shieldedProcedure
    .input(
      z.object({
        url: z.string(),
        targetDir: z.string().optional(),
        icon: z.string().optional(),
      })
    )
    .subscription(async function* ({ ctx, input }) {
      const url = input.url.trim();
      if (!url) {
        yield { type: "error" as const, message: "请输入 Git 仓库地址" };
        return;
      }
      const repoName = url.split("/").pop()?.replace(/\.git$/, "") ?? "project";
      const projectStorageRootPath = getProjectStorageRootPath();
      const baseDir = input.targetDir?.trim() || projectStorageRootPath;
      const targetDir = await ensureUniqueProjectRoot(baseDir, toSafeFolderName(repoName));

      yield { type: "progress" as const, message: `正在克隆到 ${targetDir} ...` };

      try {
        const progressLines: string[] = [];
        await cloneGitRepository(url, targetDir, (line) => {
          progressLines.push(line);
        });
        // 推送积累的进度行
        for (const line of progressLines) {
          yield { type: "progress" as const, message: line };
        }
      } catch (err: any) {
        yield { type: "error" as const, message: err?.message ?? "克隆失败" };
        return;
      }

      yield { type: "progress" as const, message: "正在注册项目..." };

      // 注册项目
      const projectId = `${PROJECT_ID_PREFIX}${randomUUID()}`;
      const projectRootUri = toFileUriWithoutEncoding(targetDir);
      const title = repoName;
      const isCode = await detectCodeProject(targetDir);
      const autoIcon = isCode ? "💻" : input.icon;
      const config = projectConfigSchema.parse({
        schema: 1,
        projectId,
        title,
        icon: autoIcon ?? undefined,
        projects: {},
      });
      const metaPath = getProjectMetaPath(targetDir);
      await writeJsonAtomic(metaPath, config);
      upsertTopLevelProject(projectId, projectRootUri);
      await syncProjectSnapshot(ctx.prisma);

      yield {
        type: "done" as const,
        projectId,
        rootUri: projectRootUri,
      };
    }),

  getGitStatus: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getProjectGitStatus(input.projectId);
    }),

  getGitDiff: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return getProjectGitDiff(input.projectId);
    }),

  gitCommit: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        subject: z.string().min(1),
        body: z.string().optional(),
        stageAll: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return commitProjectGit(input.projectId, {
        subject: input.subject,
        body: input.body,
        stageAll: input.stageAll,
      });
    }),

  /** Convert a global chat session to a project. */
  convertChatToProject: shieldedProcedure
    .input(
      z.object({
        chatSessionId: z.string(),
        projectTitle: z.string().optional(),
        projectParentId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. 验证 ChatSession 存在且 projectId IS NULL
      const session = await ctx.prisma.chatSession.findUnique({
        where: { id: input.chatSessionId },
        select: { id: true, title: true, projectId: true },
      });

      if (!session) {
        throw new Error("Chat session not found.");
      }

      if (session.projectId) {
        throw new Error("Chat session already belongs to a project.");
      }

      // 2. 生成项目名称和目录
      const projectTitle = input.projectTitle?.trim() || session.title || "Untitled Project";
      const folderName = toSafeFolderName(projectTitle);
      const projectStorageRootPath = getProjectStorageRootPath();

      const projectRootPath = await ensureUniqueProjectRoot(projectStorageRootPath, folderName);
      const projectRootUri = toFileUriWithoutEncoding(projectRootPath);
      const projectId = `${PROJECT_ID_PREFIX}${randomUUID()}`;

      // 3. 复制 chat-history/{sessionId}/root/ → {projectRoot}/
      const chatHistoryRoot = path.join(
        projectStorageRootPath,
        ".openloaf",
        "chat-history",
        input.chatSessionId
      );
      const chatRootDir = path.join(chatHistoryRoot, "root");
      const hasRootDir = await fileExists(chatRootDir);

      if (hasRootDir) {
        // 复制文件到项目根目录
        await fs.cp(chatRootDir, projectRootPath, { recursive: true });
      } else {
        // 如果没有 root/ 目录，创建空项目目录
        await fs.mkdir(projectRootPath, { recursive: true });
      }

      // 4. 创建 Project 记录
      const config = projectConfigSchema.parse({
        schema: 1,
        projectId,
        title: projectTitle,
        icon: "💬", // 默认对话图标
        projects: {},
        initializedFeatures: ["canvas"],
      });

      const metaPath = getProjectMetaPath(projectRootPath);
      await writeJsonAtomic(metaPath, config);

      // 5. 注册项目到顶层列表或父项目
      if (input.projectParentId) {
        await appendChildProjectEntry(input.projectParentId, projectId, projectRootUri);
      } else {
        upsertTopLevelProject(projectId, projectRootUri);
      }

      // 6. 更新 ChatSession.projectId
      await ctx.prisma.chatSession.update({
        where: { id: input.chatSessionId },
        data: { projectId },
      });
      await syncProjectSnapshot(ctx.prisma);

      // 7. 清理 sessionDirCache（需要导入 chatFileStore）
      // 注意：这里需要在 server 端调用，暂时跳过，由前端刷新处理

      return {
        projectId,
        projectTitle,
        rootUri: projectRootUri,
      };
    }),

  /** Promote a temp project to a permanent project. */
  promoteTempProject: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { promoteTempProject } = await import("../services/tempProjectService");
      await promoteTempProject(input.projectId, { title: input.title });
      return { ok: true };
    }),

});

export type ProjectRouter = typeof projectRouter;
