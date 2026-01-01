import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { v4 as uuidv4 } from "uuid";
import { workspaceBase, type Workspace } from "@teatime-ai/api/types/workspace";
import { getEnvString } from "@teatime-ai/config";

const TeatimeConfigSchema = z.object({
  workspaces: z.array(workspaceBase),
});

export type TeatimeConfig = z.infer<typeof TeatimeConfigSchema>;

let cached: TeatimeConfig | null = null;

/** Build default workspace root uri under config directory. */
function resolveDefaultWorkspaceRootUri(confPath: string): string {
  const rootPath = path.join(path.dirname(confPath), "workspace");
  // 中文注释：默认工作区目录固定在配置同级目录，便于本地迁移。
  mkdirSync(rootPath, { recursive: true });
  return pathToFileURL(rootPath).href;
}

function getConfigPath(): string {
  const p = getEnvString(process.env, "TEATIME_CONF_PATH", { required: true });
  return p!;
}

function ensureDefault(normalizedPath: string) {
  if (existsSync(normalizedPath)) return;

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
  };
  writeFileSync(normalizedPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
}

/**
 * 配置存储（MVP）：
 * - 单进程内存缓存 + 文件落盘
 * - cloud-server 迁移时可替换为 DB/Redis 等实现
 */
export const teatimeConfigStore = {
  /** Read config with zod validation and cache. */
  get: (): TeatimeConfig => {
    if (cached) return cached;
    const path = getConfigPath();
    ensureDefault(path);
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const legacyRootUri = typeof raw.workspaceRootUri === "string" ? raw.workspaceRootUri : "";
    if (legacyRootUri && Array.isArray(raw.workspaces)) {
      // 中文注释：兼容旧版配置，将 workspaceRootUri 下放到 workspace.rootUri。
      raw.workspaces = raw.workspaces.map((workspace) => ({
        ...workspace,
        rootUri: (workspace as Record<string, unknown>).rootUri ?? legacyRootUri,
        projects: (workspace as Record<string, unknown>).projects ?? {},
      }));
    }
    try {
      const parsed = TeatimeConfigSchema.parse(raw);
      const normalized: TeatimeConfig = {
        workspaces: parsed.workspaces.map((workspace) => ({
          ...workspace,
          rootUri: workspace.rootUri || resolveDefaultWorkspaceRootUri(path),
          projects: workspace.projects ?? {},
        })),
      };
      cached = normalized;
      if (legacyRootUri) {
        writeFileSync(path, JSON.stringify(normalized, null, 2), "utf-8");
      }
      return normalized;
    } catch {
      // 中文注释：配置结构不合法时直接重置为新结构，避免运行中断。
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
      };
      writeFileSync(path, JSON.stringify(reset, null, 2), "utf-8");
      cached = reset;
      return reset;
    }
  },

  /** Overwrite config on disk and refresh cache. */
  set: (next: TeatimeConfig) => {
    const path = getConfigPath();
    const parsed = TeatimeConfigSchema.parse(next);
    writeFileSync(path, JSON.stringify(parsed, null, 2), "utf-8");
    cached = parsed;
  },
} as const;
