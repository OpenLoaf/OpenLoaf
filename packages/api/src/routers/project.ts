import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
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
  })
  .passthrough();

type ProjectConfig = z.infer<typeof projectConfigSchema>;

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

/** Find project root directories under workspace root. */
async function listProjectRoots(workspaceRootPath: string): Promise<string[]> {
  const roots: string[] = [];
  const queue: string[] = [workspaceRootPath];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const metaPath = getProjectMetaPath(current);
    const metaExists = await fileExists(metaPath);
    if (metaExists) {
      roots.push(current);
      continue;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      queue.push(path.join(current, entry.name));
    }
  }
  return roots;
}

export const projectRouter = t.router({
  /** List all project roots under workspace. */
  list: shieldedProcedure.query(async () => {
    const workspaceRootPath = getWorkspaceRootPath();
    const roots = await listProjectRoots(workspaceRootPath);
    const projects: Array<{ rootPath: string; config: ProjectConfig }> = [];
    for (const rootPath of roots) {
      try {
        const config = await readProjectConfig(rootPath);
        projects.push({ rootPath, config });
      } catch {
        // 中文注释：配置异常的目录直接跳过，避免阻塞列表渲染。
      }
    }

    return projects.map(({ rootPath, config }, index) => ({
      projectId: config.projectId,
      title: config.title ?? `Project ${index + 1}`,
      icon: config.icon ?? undefined,
      intro: config.intro ?? undefined,
      rootUri: toFileUri(rootPath),
    }));
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
