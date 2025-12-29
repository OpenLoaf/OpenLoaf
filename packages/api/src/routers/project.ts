import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { t, shieldedProcedure } from "../index";
import {
  getWorkspaceRootPath,
  resolveWorkspacePathFromUri,
  toFileUri,
} from "../services/vfsService";

const PROJECT_META_DIR = ".teatime";
const PROJECT_META_FILE = "project.json";
const INTRO_BLOCKS_FILE = "intro.blocks.json";
const BOARD_SNAPSHOT_FILE = "board.snapshot.json";
const PROJECT_ID_EXT = ".ttid";
/** Default title used when the user does not provide one. */
const DEFAULT_PROJECT_TITLE = "Untitled Project";
/** Prefix for generated project ids. */
const PROJECT_ID_PREFIX = "proj_";

const SKIP_DIRS = new Set([
  ".git",
  ".teatime",
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
]);

const projectIntroSchema = z
  .object({
    kind: z.string(),
    targetId: z.string(),
    component: z.string().optional(),
    pageType: z.string().optional(),
  })
  .passthrough()
  .optional();

const projectConfigSchema = z
  .object({
    schema: z.number().optional(),
    projectId: z.string(),
    title: z.string().optional().nullable(),
    icon: z.string().optional().nullable(),
    intro: projectIntroSchema,
    childrenIds: z.array(z.string()).optional(),
  })
  .passthrough();

type ProjectConfig = z.infer<typeof projectConfigSchema>;
type ProjectNode = {
  projectId: string;
  title: string;
  icon?: string;
  intro?: ProjectConfig["intro"];
  rootUri: string;
  children: ProjectNode[];
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

/** Build project.json path from a project root. */
function getProjectMetaPath(projectRootPath: string): string {
  return path.join(projectRootPath, PROJECT_META_DIR, PROJECT_META_FILE);
}

/** Build intro blocks path from a project root. */
function getIntroBlocksPath(projectRootPath: string): string {
  return path.join(projectRootPath, PROJECT_META_DIR, INTRO_BLOCKS_FILE);
}

/** Build board snapshot path from a project root. */
function getBoardSnapshotPath(projectRootPath: string): string {
  return path.join(projectRootPath, PROJECT_META_DIR, BOARD_SNAPSHOT_FILE);
}

/** Build project id marker file path from a project root. */
function getProjectIdMarkerPath(projectRootPath: string, projectId: string): string {
  return path.join(projectRootPath, PROJECT_META_DIR, `${projectId}${PROJECT_ID_EXT}`);
}

/** Write the project id marker file for quick discovery. */
async function writeProjectIdMarker(
  projectRootPath: string,
  projectId: string
): Promise<void> {
  const markerPath = getProjectIdMarkerPath(projectRootPath, projectId);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, projectId, "utf-8");
}

/** Ensure the project id marker file exists. */
async function ensureProjectIdMarker(
  projectRootPath: string,
  projectId: string
): Promise<boolean> {
  const markerPath = getProjectIdMarkerPath(projectRootPath, projectId);
  if (await fileExists(markerPath)) return false;
  await writeProjectIdMarker(projectRootPath, projectId);
  return true;
}

/** Load and normalize project config. */
async function readProjectConfig(projectRootPath: string): Promise<ProjectConfig> {
  const metaPath = getProjectMetaPath(projectRootPath);
  const raw = await readJsonFile(metaPath);
  if (!raw) {
    throw new Error("project.json not found.");
  }
  const parsed = projectConfigSchema.parse(raw);
  const fallbackTitle = path.basename(projectRootPath);
  return {
    ...parsed,
    title: parsed.title?.trim() || fallbackTitle,
  };
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
async function readProjectTree(projectRootPath: string): Promise<ProjectNode | null> {
  try {
    const config = await readProjectConfig(projectRootPath);
    const children = Array.isArray(config.childrenIds) ? config.childrenIds : [];
    const childNodes: ProjectNode[] = [];
    for (const childName of children) {
      const childPath = resolveChildProjectPath(projectRootPath, childName);
      if (!childPath) continue;
      const metaPath = getProjectMetaPath(childPath);
      if (!(await fileExists(metaPath))) continue;
      const childNode = await readProjectTree(childPath);
      if (childNode) childNodes.push(childNode);
    }
    return {
      projectId: config.projectId,
      title: config.title ?? path.basename(projectRootPath),
      icon: config.icon ?? undefined,
      intro: config.intro ?? undefined,
      rootUri: toFileUri(projectRootPath),
      children: childNodes,
    };
  } catch {
    // 中文注释：读取失败时返回 null，避免影响整体列表。
    return null;
  }
}

/** Repair missing project id markers recursively. */
async function repairProjectTree(projectRootPath: string): Promise<number> {
  try {
    const config = await readProjectConfig(projectRootPath);
    let createdCount = 0;
    if (await ensureProjectIdMarker(projectRootPath, config.projectId)) {
      createdCount += 1;
    }
    const children = Array.isArray(config.childrenIds) ? config.childrenIds : [];
    for (const childName of children) {
      const childPath = resolveChildProjectPath(projectRootPath, childName);
      if (!childPath) continue;
      const metaPath = getProjectMetaPath(childPath);
      if (!(await fileExists(metaPath))) continue;
      createdCount += await repairProjectTree(childPath);
    }
    return createdCount;
  } catch {
    // 中文注释：修复失败时返回 0，避免影响整体流程。
    return 0;
  }
}

/** Find top-level projects under workspace root. */
async function listTopLevelProjectRoots(workspaceRootPath: string): Promise<string[]> {
  const entries = await fs.readdir(workspaceRootPath, { withFileTypes: true });
  const roots: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const candidate = path.join(workspaceRootPath, entry.name);
    const metaPath = getProjectMetaPath(candidate);
    if (await fileExists(metaPath)) {
      roots.push(candidate);
    }
  }
  return roots;
}

export const projectRouter = t.router({
  /** List all project roots under workspace. */
  list: shieldedProcedure.query(async () => {
    const workspaceRootPath = getWorkspaceRootPath();
    const roots = await listTopLevelProjectRoots(workspaceRootPath);
    const projects: ProjectNode[] = [];
    for (const rootPath of roots) {
      const node = await readProjectTree(rootPath);
      if (node) projects.push(node);
    }
    return projects;
  }),

  /** Create a new project under workspace root. */
  create: shieldedProcedure
    .input(
      z.object({
        title: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const workspaceRootPath = getWorkspaceRootPath();
      const title = input.title?.trim() || DEFAULT_PROJECT_TITLE;
      const folderName = toSafeFolderName(title);
      const projectRootPath = await ensureUniqueProjectRoot(
        workspaceRootPath,
        folderName
      );
      const projectId = `${PROJECT_ID_PREFIX}${randomUUID()}`;
      const config = projectConfigSchema.parse({
        schema: 1,
        projectId,
        title,
        icon: input.icon ?? undefined,
      });
      const metaPath = getProjectMetaPath(projectRootPath);
      await writeJsonAtomic(metaPath, config);
      await writeProjectIdMarker(projectRootPath, projectId);
      return {
        project: {
          projectId: config.projectId,
          title: config.title ?? title,
          icon: config.icon ?? undefined,
          intro: config.intro ?? undefined,
          rootUri: toFileUri(projectRootPath),
        },
      };
    }),

  /** Repair missing project id markers under workspace. */
  repairIds: shieldedProcedure.mutation(async () => {
    const workspaceRootPath = getWorkspaceRootPath();
    const roots = await listTopLevelProjectRoots(workspaceRootPath);
    let created = 0;
    for (const rootPath of roots) {
      created += await repairProjectTree(rootPath);
    }
    return { created };
  }),

  /** Get a single project by root URI. */
  get: shieldedProcedure
    .input(z.object({ rootUri: z.string() }))
    .query(async ({ input }) => {
      const rootPath = resolveWorkspacePathFromUri(input.rootUri);
      const config = await readProjectConfig(rootPath);
      return {
        project: {
          projectId: config.projectId,
          title: config.title ?? path.basename(rootPath),
          icon: config.icon ?? undefined,
          intro: config.intro ?? undefined,
          rootUri: toFileUri(rootPath),
        },
      };
    }),

  /** Update project metadata. */
  update: shieldedProcedure
    .input(
      z.object({
        rootUri: z.string(),
        title: z.string().optional(),
        icon: z.string().nullable().optional(),
        intro: projectIntroSchema,
      })
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveWorkspacePathFromUri(input.rootUri);
      const metaPath = getProjectMetaPath(rootPath);
      const existing = (await readJsonFile(metaPath)) ?? {};
      const next = projectConfigSchema.parse({
        ...existing,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
      });
      await writeJsonAtomic(metaPath, next);
      return { ok: true };
    }),

  /** Get intro blocks for a project. */
  getIntro: shieldedProcedure
    .input(z.object({ rootUri: z.string() }))
    .query(async ({ input }) => {
      const rootPath = resolveWorkspacePathFromUri(input.rootUri);
      const introPath = getIntroBlocksPath(rootPath);
      const raw = await readJsonFile(introPath);
      const blocks = Array.isArray((raw as any)?.blocks) ? (raw as any).blocks : [];
      return { blocks };
    }),

  /** Save intro blocks for a project. */
  saveIntro: shieldedProcedure
    .input(
      z.object({
        rootUri: z.string(),
        blocks: z.array(
          z.object({
            content: z.any().nullable(),
            order: z.number().optional().nullable(),
            type: z.string().optional().nullable(),
            props: z.any().optional().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveWorkspacePathFromUri(input.rootUri);
      const introPath = getIntroBlocksPath(rootPath);
      await writeJsonAtomic(introPath, { schema: 1, blocks: input.blocks });
      return { ok: true };
    }),

  /** Get board snapshot for a project. */
  getBoard: shieldedProcedure
    .input(z.object({ rootUri: z.string() }))
    .query(async ({ input }) => {
      const rootPath = resolveWorkspacePathFromUri(input.rootUri);
      const boardPath = getBoardSnapshotPath(rootPath);
      const raw = await readJsonFile(boardPath);
      return { board: raw ?? null };
    }),

  /** Save board snapshot for a project. */
  saveBoard: shieldedProcedure
    .input(
      z.object({
        rootUri: z.string(),
        schemaVersion: z.number().optional().nullable(),
        nodes: z.any(),
        connectors: z.any(),
        viewport: z.any(),
        version: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const rootPath = resolveWorkspacePathFromUri(input.rootUri);
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
