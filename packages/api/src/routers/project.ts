import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { t, shieldedProcedure } from "../index";
import {
  getActiveWorkspace,
  getProjectRootUri,
  getWorkspaceRootPath,
  resolveFilePathFromUri,
  toFileUri,
  upsertActiveWorkspaceProject,
} from "../services/vfsService";

const PROJECT_META_DIR = ".teatime";
const PROJECT_META_FILE = "project.json";
const INTRO_BLOCKS_FILE = "intro.blocks.json";
const BOARD_SNAPSHOT_FILE = "board.snapshot.json";
/** Default title used when the user does not provide one. */
const DEFAULT_PROJECT_TITLE = "Untitled Project";
/** Prefix for generated project ids. */
const PROJECT_ID_PREFIX = "proj_";

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

/** Load and normalize project config. */
async function readProjectConfig(
  projectRootPath: string,
  projectIdOverride?: string
): Promise<ProjectConfig> {
  const metaPath = getProjectMetaPath(projectRootPath);
  const raw = await readJsonFile(metaPath);
  if (!raw) {
    throw new Error("project.json not found.");
  }
  const parsed = projectConfigSchema.parse(raw);
  const fallbackTitle = path.basename(projectRootPath);
  return {
    ...parsed,
    projectId: projectIdOverride ?? parsed.projectId,
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

/** Resolve a project root path from config by project id. */
function resolveProjectRootPath(projectId: string): string {
  const rootUri = getProjectRootUri(projectId);
  if (!rootUri) {
    throw new Error("Project not found.");
  }
  return resolveFilePathFromUri(rootUri);
}

/** Recursively read project tree from project.json. */
async function readProjectTree(
  projectRootPath: string,
  projectIdOverride?: string
): Promise<ProjectNode | null> {
  try {
    const config = await readProjectConfig(projectRootPath, projectIdOverride);
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

export const projectRouter = t.router({
  /** List all project roots under workspace. */
  list: shieldedProcedure.query(async () => {
    const workspace = getActiveWorkspace();
    const projectEntries = Object.entries(workspace.projects ?? {});
    const projects: ProjectNode[] = [];
    for (const [projectId, rootUri] of projectEntries) {
      let rootPath: string;
      try {
        rootPath = resolveFilePathFromUri(rootUri);
      } catch {
        continue;
      }
      const node = await readProjectTree(rootPath, projectId);
      if (node) projects.push(node);
    }
    return projects;
  }),

  /** Create a new project under workspace root or custom root. */
  create: shieldedProcedure
    .input(
      z.object({
        title: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        rootUri: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const workspaceRootPath = getWorkspaceRootPath();
      const title = input.title?.trim() || DEFAULT_PROJECT_TITLE;
      const folderName = toSafeFolderName(title);
      let projectRootPath: string;
      if (input.rootUri?.trim()) {
        const rawRoot = input.rootUri.trim();
        projectRootPath = rawRoot.startsWith("file://")
          ? resolveFilePathFromUri(rawRoot)
          : path.resolve(rawRoot);
        await fs.mkdir(projectRootPath, { recursive: true });
        const metaPath = getProjectMetaPath(projectRootPath);
        if (await fileExists(metaPath)) {
          throw new Error("project.json already exists in the target root.");
        }
      } else {
        projectRootPath = await ensureUniqueProjectRoot(workspaceRootPath, folderName);
      }
      const projectId = `${PROJECT_ID_PREFIX}${randomUUID()}`;
      const config = projectConfigSchema.parse({
        schema: 1,
        projectId,
        title,
        icon: input.icon ?? undefined,
      });
      const metaPath = getProjectMetaPath(projectRootPath);
      await writeJsonAtomic(metaPath, config);
      upsertActiveWorkspaceProject(projectId, toFileUri(projectRootPath));
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
          intro: config.intro ?? undefined,
          rootUri: toFileUri(rootPath),
        },
      };
    }),

  /** Update project metadata. */
  update: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().optional(),
        icon: z.string().nullable().optional(),
        intro: projectIntroSchema,
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
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
      });
      await writeJsonAtomic(metaPath, next);
      return { ok: true };
    }),

  /** Get intro blocks for a project. */
  getIntro: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const rootPath = resolveProjectRootPath(input.projectId);
      const introPath = getIntroBlocksPath(rootPath);
      const raw = await readJsonFile(introPath);
      const blocks = Array.isArray((raw as any)?.blocks) ? (raw as any).blocks : [];
      return { blocks };
    }),

  /** Save intro blocks for a project. */
  saveIntro: shieldedProcedure
    .input(
      z.object({
        projectId: z.string(),
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
      const rootPath = resolveProjectRootPath(input.projectId);
      const introPath = getIntroBlocksPath(rootPath);
      await writeJsonAtomic(introPath, { schema: 1, blocks: input.blocks });
      return { ok: true };
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
