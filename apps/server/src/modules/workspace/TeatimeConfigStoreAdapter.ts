import { z } from "zod";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { workspaceBase, type Workspace } from "@teatime-ai/api/types/workspace";
import { getEnvString } from "@teatime-ai/config";

const TeatimeConfigSchema = z.object({
  workspaces: z.array(workspaceBase),
});

export type TeatimeConfig = z.infer<typeof TeatimeConfigSchema>;

let cached: TeatimeConfig | null = null;

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
  };
  const defaultConfig: TeatimeConfig = { workspaces: [workspace] };
  writeFileSync(normalizedPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
}

/**
 * 配置存储（MVP）：
 * - 单进程内存缓存 + 文件落盘
 * - cloud-server 迁移时可替换为 DB/Redis 等实现
 */
export const teatimeConfigStore = {
  /** 读取配置（带 zod 校验与缓存）。 */
  get: (): TeatimeConfig => {
    if (cached) return cached;
    const path = getConfigPath();
    ensureDefault(path);
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    const parsed = TeatimeConfigSchema.parse(raw);
    cached = parsed;
    return parsed;
  },

  /** 覆盖写入配置（同时更新内存缓存）。 */
  set: (next: TeatimeConfig) => {
    const path = getConfigPath();
    const parsed = TeatimeConfigSchema.parse(next);
    writeFileSync(path, JSON.stringify(parsed, null, 2), "utf-8");
    cached = parsed;
  },
} as const;
