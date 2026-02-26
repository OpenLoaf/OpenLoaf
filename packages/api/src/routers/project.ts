import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";
import {
  getProjectRootUri,
  getProjectRootPath,
  getActiveWorkspace,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
  removeActiveWorkspaceProject,
  resolveFilePathFromUri,
  setActiveWorkspaceProjectEntries,
  toFileUriWithoutEncoding,
  upsertActiveWorkspaceProject,
} from "../services/vfsService";
import { getWorkspaceProjectEntries } from "../services/workspaceProjectConfig";
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
import { requireSummaryRuntime } from "../services/summaryRuntime";
import { listSchedulerTaskRecords } from "../services/schedulerTaskRecordService";
import {
  getProjectGitBranches,
  getProjectGitCommits,
  getProjectGitInfo,
  ensureGitRepository,
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
  /** Target workspace id. */
  workspaceId?: string;
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

/** Resolve a unique project root directory under workspace. */
async function ensureUniqueProjectRoot(
  workspaceRootPath: string,
  baseName: string
): Promise<string> {
  let candidate = baseName;
  let counter = 1;
  // 逻辑：目录名冲突时递增后缀，直到找到可用目录。
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
  return resolveFilePathFromUri(rootUri);
}

/** Resolve cache root path from project/workspace scope. */
function resolveCacheRootPath(input: CacheScopeInput): string {
  const projectId = input.projectId?.trim();
  const workspaceId = input.workspaceId?.trim();
  if (projectId) {
    const rootPath = getProjectRootPath(projectId, workspaceId);
    if (!rootPath) {
      throw new Error("Project not found.");
    }
    return rootPath;
  }
  if (workspaceId) {
    const rootPath = getWorkspaceRootPathById(workspaceId);
    if (!rootPath) {
      throw new Error("Workspace not found.");
    }
    return rootPath;
  }
  throw new Error("projectId or workspaceId is required.");
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

/** Reorder root project entries in active workspace config. */
function reorderWorkspaceProjectEntry(
  projectId: string,
  projectRootUri: string,
  targetSiblingProjectId?: string | null,
  targetPosition?: ProjectOrderPosition,
): void {
  const ordered = buildOrderedProjectEntries(
    Object.entries(getActiveWorkspaceProjects()),
    projectId,
    projectRootUri,
    targetSiblingProjectId,
    targetPosition,
  );
  // 逻辑：重建 workspace 项目映射，保持根项目排序。
  setActiveWorkspaceProjectEntries(ordered);
}

/** Return the active workspace project map. */
function getActiveWorkspaceProjects(): Record<string, string> {
  return Object.fromEntries(getWorkspaceProjectEntries(getActiveWorkspace().id));
}

/** Schema for cache management input. */
const cacheScopeSchema = z
  .object({
    projectId: z.string().optional(),
    workspaceId: z.string().optional(),
  })
  .refine((value) => Boolean(value.projectId || value.workspaceId), {
    message: "projectId or workspaceId is required",
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
        enableVersionControl: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const workspaceRootPath = getWorkspaceRootPath();
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
        : resolvedTitle;
      const config = projectConfigSchema.parse(
        existingConfig ?? {
          schema: 1,
          projectId,
          title: rawTitle || fallbackTitle,
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
      // 逻辑：先删除磁盘目录，再移除项目映射，避免列表与磁盘状态不一致。
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
        targetSiblingProjectId: z.string().nullable().optional(),
        targetPosition: z.enum(["before", "after"]).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const targetSiblingProjectId = input.targetSiblingProjectId?.trim() || null;
      const targetPosition =
        input.targetPosition === "before" ? "before" : "after";
      let targetParentProjectId = input.targetParentProjectId?.trim() || null;
      const projectTrees = await readWorkspaceProjectTrees();
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
          removeActiveWorkspaceProject(input.projectId);
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
          reorderWorkspaceProjectEntry(
            input.projectId,
            projectRootUri,
            targetSiblingProjectId,
            targetPosition,
          );
        } else {
          upsertActiveWorkspaceProject(input.projectId, projectRootUri);
        }
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

  /** Get cache size for a project or workspace root. */
  getCacheSize: shieldedProcedure
    .input(cacheScopeSchema)
    .query(async ({ input }) => {
      const rootPath = resolveCacheRootPath(input);
      const cachePath = path.join(rootPath, CACHE_DIR_NAME);
      const bytes = await getDirectorySizeBytes(cachePath);
      return { bytes };
    }),

  /** Clear cache for a project or workspace root. */
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
    .query(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
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

  /** Run daily summary for all projects in a workspace by date. */
  runSummaryForWorkspace: shieldedProcedure
    .input(z.object({ workspaceId: z.string(), dateKey: z.string().regex(DATE_KEY_PATTERN) }))
    .mutation(async ({ input }) => {
      const runtime = requireSummaryRuntime();
      return runtime.runDailySummaryForWorkspace({
        workspaceId: input.workspaceId,
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
    .input(z.object({ projectId: z.string().optional(), workspaceId: z.string().optional() }))
    .query(async ({ input }) => {
      const runtime = requireSummaryRuntime();
      return runtime.listTaskStatus(input);
    }),

  /** List scheduler task records for history. */
  listSchedulerTaskRecords: shieldedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
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
