/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

let rootOverride: string | null = null;
let projectStorageRootOverride: string | null = null;

/** Override the OpenLoaf root directory (tests only). */
export function setOpenLoafRootOverride(root: string | null): void {
  rootOverride = root;
}

/** Override the default project storage root directory (tests only). */
export function setDefaultProjectStorageRootOverride(root: string | null): void {
  projectStorageRootOverride = root;
}

/** Resolve the OpenLoaf root directory and ensure it exists. */
export function getOpenLoafRootDir(): string {
  const root = rootOverride ?? path.join(homedir(), ".openloaf");
  // 统一根目录，缺失时自动创建。
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** Resolve the OpenLoafData root directory (user-facing data, outside ~/.openloaf config dir). */
export function getOpenLoafDataRootDir(): string {
  if (process.platform === "win32") {
    const dDrive = "D:\\OpenLoafData";
    if (fs.existsSync("D:\\")) return dDrive;
    return path.join(homedir(), "OpenLoafData");
  }
  return path.join(homedir(), "OpenLoafData");
}

/** Resolve the default project storage root directory and ensure it exists. */
export function getDefaultProjectStorageRootDir(): string {
  const root = projectStorageRootOverride ?? path.join(getOpenLoafDataRootDir(), "projects");
  // 项目默认存储根目录：~/OpenLoafData/projects（与 .openloaf 配置目录解耦）。
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** Resolve a file path under the OpenLoaf root directory. */
export function resolveOpenLoafPath(...segments: string[]): string {
  return path.join(getOpenLoafRootDir(), ...segments);
}

/** Resolve a scoped metadata path for the global root or a project root. */
export function resolveScopedOpenLoafPath(
  rootPath: string,
  ...segments: string[]
): string {
  const normalizedRoot = path.resolve(rootPath);
  const globalRoot = path.resolve(getOpenLoafRootDir());
  if (normalizedRoot === globalRoot) {
    return path.join(normalizedRoot, ...segments);
  }
  return path.join(normalizedRoot, ".openloaf", ...segments);
}

/** Resolve the default database file path under the OpenLoaf root directory. */
export function resolveOpenLoafDbPath(): string {
  return resolveOpenLoafPath("openloaf.db");
}

/** Resolve the default database URL for Prisma/libsql. */
export function resolveOpenLoafDatabaseUrl(): string {
  const override = process.env.OPENLOAF_DATABASE_URL || process.env.DATABASE_URL;
  // 允许打包或测试时通过环境变量覆盖数据库地址。
  if (override && override.trim()) {
    return override.trim();
  }
  return `file:${resolveOpenLoafDbPath()}`;
}

export type LegacyMigrationResult = {
  moved: string[];
  skipped: string[];
};

export type LegacyMigrationOptions = {
  legacyRoot?: string;
  targetRoot?: string;
  logger?: (message: string) => void;
};

/**
 * Migrate legacy server data from the repo `apps/server` directory to the OpenLoaf root.
 */
export function migrateLegacyServerData(
  options: LegacyMigrationOptions = {}
): LegacyMigrationResult {
  const moved: string[] = [];
  const skipped: string[] = [];
  const targetRoot = options.targetRoot ?? getOpenLoafRootDir();
  const legacyRoot = options.legacyRoot ?? resolveLegacyServerRoot();

  if (!legacyRoot || !fs.existsSync(legacyRoot)) {
    return { moved, skipped };
  }

  fs.mkdirSync(targetRoot, { recursive: true });

  const moveFile = (sourceName: string, targetName = sourceName) => {
    const sourcePath = path.join(legacyRoot, sourceName);
    const targetPath = path.join(targetRoot, targetName);
    if (!fs.existsSync(sourcePath)) return;
    if (fs.existsSync(targetPath)) {
      skipped.push(targetName);
      return;
    }
    // 跨盘移动可能失败，这里兜底为复制后删除。
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch {
      fs.copyFileSync(sourcePath, targetPath);
      fs.rmSync(sourcePath, { force: true });
    }
    moved.push(targetName);
  };

  moveFile("settings.json");
  moveFile("providers.json");
  moveFile("auth.json");
  moveFile("local.db", "openloaf.db");
  moveFile("local-auth.json");
  moveFile(".env");

  if (options.logger) {
    options.logger(
      `legacy migration complete (moved: ${moved.length}, skipped: ${skipped.length})`
    );
  }

  return { moved, skipped };
}

function resolveLegacyServerRoot(): string | null {
  const cwd = process.cwd();
  const basename = path.basename(cwd);
  const parent = path.basename(path.dirname(cwd));

  if (basename === "server" && parent === "apps") {
    return cwd;
  }

  const candidate = path.join(cwd, "apps", "server");
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  return null;
}
