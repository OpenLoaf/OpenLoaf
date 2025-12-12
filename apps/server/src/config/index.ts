import { z } from "zod";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { workspaceBase, type Workspace } from "@teatime-ai/api/types/workspace";

const TeatimeConfigSchema = z.object({
  workspaces: z.array(workspaceBase),
});

type TeatimeConfig = z.infer<typeof TeatimeConfigSchema>;

let config: TeatimeConfig | null = null;

// Create default config if it doesn't exist
export function createDefaultConfigIfNotExists(normalizedPath: string): Workspace {
  if (!existsSync(normalizedPath)) {
    const workspace: Workspace = {
      id: uuidv4(),
      name: "Default Workspace",
      type: "local",
      isActive: true,
    };

    const defaultConfig: TeatimeConfig = {
      workspaces: [workspace],
    };

    try {
      writeFileSync(
        normalizedPath,
        JSON.stringify(defaultConfig, null, 2),
        "utf-8"
      );
      console.log(`Created default config file at ${normalizedPath}`);
      return workspace;
    } catch (error) {
      throw new Error(
        `Failed to create default config file at ${normalizedPath}: ${error}`
      );
    }
  }

  // Return the first workspace if config already exists
  const configContent = readFileSync(normalizedPath, "utf-8");
  const parsedContent = JSON.parse(configContent) as TeatimeConfig;
  return parsedContent.workspaces[0] as Workspace;
}

// 获取配置路径的辅助函数
export function getConfigPath(): string {
  const configPath = process.env.TEATIME_CONF_PATH;
  if (!configPath) {
    throw new Error("TEATIME_CONF_PATH environment variable is not set");
  }
  return configPath;
}

export function getTeatimeConfig(): TeatimeConfig {
  if (config) {
    return config;
  }

  const normalizedPath = getConfigPath();

  // Create default config if it doesn't exist
  createDefaultConfigIfNotExists(normalizedPath);

  let configContent: string;
  try {
    configContent = readFileSync(normalizedPath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read config file at ${normalizedPath}: ${error}`
    );
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(configContent);
  } catch (error) {
    throw new Error(
      `Failed to parse config file at ${normalizedPath}: ${error}`
    );
  }

  const result = TeatimeConfigSchema.safeParse(parsedContent);
  if (!result.success) {
    throw new Error(
      `Invalid config file at ${normalizedPath}: ${result.error.message}`
    );
  }

  config = result.data;
  return config;
}

// 写入配置到文件
export function writeTeatimeConfig(updatedConfig: TeatimeConfig): void {
  const normalizedPath = getConfigPath();

  try {
    writeFileSync(
      normalizedPath,
      JSON.stringify(updatedConfig, null, 2),
      "utf-8"
    );
    // 更新内存中的配置
    config = updatedConfig;
    console.log(`Updated config file at ${normalizedPath}`);
  } catch (error) {
    throw new Error(
      `Failed to write config file at ${normalizedPath}: ${error}`
    );
  }
}

export type { TeatimeConfig };
export { TeatimeConfigSchema };
