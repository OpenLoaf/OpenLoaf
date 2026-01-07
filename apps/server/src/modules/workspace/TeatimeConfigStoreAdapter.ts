import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { v4 as uuidv4 } from "uuid";
import { workspaceBase, type Workspace } from "@teatime-ai/api/types/workspace";
import type { BasicConfig } from "@teatime-ai/api/types/basic";
import { getEnvString } from "@teatime-ai/config";

const TeatimeConfigSchema = z
  .object({
    workspaces: z.array(workspaceBase),
    basic: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type TeatimeConfig = z.infer<typeof TeatimeConfigSchema>;

/** Last known good config cache. */
let cached: TeatimeConfig | null = null;

/** Build default workspace root uri under config directory. */
function resolveDefaultWorkspaceRootUri(confPath: string): string {
  const rootPath = path.join(path.dirname(confPath), "workspace");
  // 逻辑：默认工作区目录固定在配置同级目录，便于本地迁移。
  mkdirSync(rootPath, { recursive: true });
  return pathToFileURL(rootPath).href;
}

function getConfigPath(): string {
  const p = getEnvString(process.env, "TEATIME_CONF_PATH", { required: true });
  return p!;
}

function ensureDefault(normalizedPath: string) {
  if (existsSync(normalizedPath)) return;

  const basic: BasicConfig = {
    chatSource: "local",
    activeS3Id: undefined,
    s3AutoUpload: true,
    s3AutoDeleteHours: 2,
    modelResponseLanguage: "zh-CN",
    modelQuality: "medium",
  };
  const workspace: Workspace = {
    id: uuidv4(),
    name: "Default Workspace",
    type: "local",
    isActive: true,
    rootUri: resolveDefaultWorkspaceRootUri(normalizedPath),
    projects: {},
  };
  const defaultConfig: TeatimeConfig = {
    workspaces: [workspace],
    basic,
  };
  writeFileSync(normalizedPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
}

/** Read raw config content from disk (no schema validation). */
function readRawConfig(normalizedPath: string): Record<string, unknown> {
  if (!existsSync(normalizedPath)) return {};
  try {
    return JSON.parse(readFileSync(normalizedPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Persist workspace updates without wiping other config fields. */
/** Persist workspace updates without wiping other config fields. */
function writeWorkspaceConfig(
  normalizedPath: string,
  raw: Record<string, unknown>,
  workspaces: Workspace[],
) {
  const merged = { ...raw, workspaces };
  const tmpPath = `${normalizedPath}.${Date.now()}.tmp`;
  // 逻辑：原子写入，避免读取时遇到半写入状态。
  writeFileSync(tmpPath, JSON.stringify(merged, null, 2), "utf-8");
  renameSync(tmpPath, normalizedPath);
}

/** Merge workspace list while preserving existing projects when possible. */
function mergeWorkspaceProjects(
  existing?: Workspace[],
  incoming?: Workspace[],
): Workspace[] | undefined {
  if (!incoming) return existing;
  if (!existing || existing.length === 0) return incoming;
  const existingById = new Map(existing.map((workspace) => [workspace.id, workspace]));
  return incoming.map((workspace) => {
    const previous = existingById.get(workspace.id);
    if (!previous) return workspace;
    // 逻辑：workspace 操作不修改 projects，优先保留磁盘上的映射。
    return { ...previous, ...workspace, projects: previous.projects ?? workspace.projects };
  });
}

/**
 * 配置存储（MVP）：
 * - 单进程直接读写配置文件
 * - cloud-server 迁移时可替换为 DB/Redis 等实现
 */
export const teatimeConfigStore = {
  /** Read config with zod validation from disk. */
  get: (): TeatimeConfig => {
    const path = getConfigPath();
    ensureDefault(path);
    const raw = readRawConfig(path);
    const legacyRootUri = typeof raw.workspaceRootUri === "string" ? raw.workspaceRootUri : "";
    const shouldMigrateLegacy = Boolean(legacyRootUri) && Array.isArray(raw.workspaces);
    if (shouldMigrateLegacy) {
      // 逻辑：兼容旧版配置，将 workspaceRootUri 下放并移除旧字段，避免重复写入。
      raw.workspaces = raw.workspaces.map((workspace) => ({
        ...workspace,
        rootUri: (workspace as Record<string, unknown>).rootUri ?? legacyRootUri,
        projects: (workspace as Record<string, unknown>).projects ?? {},
      }));
      if ("workspaceRootUri" in raw) {
        delete raw.workspaceRootUri;
      }
    }
    try {
      const parsed = TeatimeConfigSchema.parse(raw);
      const normalized: TeatimeConfig = {
        workspaces: parsed.workspaces.map((workspace) => ({
          ...workspace,
          rootUri: workspace.rootUri || resolveDefaultWorkspaceRootUri(path),
          projects: workspace.projects ?? {},
        })),
        basic: parsed.basic,
      };
      cached = normalized;
      if (shouldMigrateLegacy) {
        writeWorkspaceConfig(path, raw, normalized.workspaces);
      }
      return normalized;
    } catch {
      if (cached) return cached;
      // 逻辑：配置结构不合法时回退为默认结构，避免运行中断。
      const reset: TeatimeConfig = {
        workspaces: [
          {
            id: uuidv4(),
            name: "Default Workspace",
            type: "local",
            isActive: true,
            rootUri: legacyRootUri || resolveDefaultWorkspaceRootUri(path),
            projects: {},
          },
        ],
        basic: {
          chatSource: "local",
          activeS3Id: undefined,
          s3AutoUpload: true,
          s3AutoDeleteHours: 2,
          modelResponseLanguage: "zh-CN",
          modelQuality: "medium",
        },
      };
      writeWorkspaceConfig(path, raw, reset.workspaces);
      cached = reset;
      return reset;
    }
  },

  /** Overwrite config on disk. */
  set: (next: TeatimeConfig) => {
    const path = getConfigPath();
    const parsed = TeatimeConfigSchema.parse(next);
    const raw = readRawConfig(path);
    const existingParsed = TeatimeConfigSchema.safeParse(raw);
    const existingWorkspaces = existingParsed.success ? existingParsed.data.workspaces : cached?.workspaces;
    const mergedWorkspaces = mergeWorkspaceProjects(existingWorkspaces, parsed.workspaces)
      ?? parsed.workspaces;
    writeWorkspaceConfig(path, raw, mergedWorkspaces);
    cached = { ...parsed, workspaces: mergedWorkspaces };
  },
} as const;
