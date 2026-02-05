import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

let rootOverride: string | null = null;
let workspaceRootOverride: string | null = null;

/** Override the Tenas root directory (tests only). */
export function setTenasRootOverride(root: string | null): void {
  rootOverride = root;
}

/** Override the default workspace root directory (tests only). */
export function setDefaultWorkspaceRootOverride(root: string | null): void {
  workspaceRootOverride = root;
}

/** Resolve the Tenas root directory and ensure it exists. */
export function getTenasRootDir(): string {
  const root = rootOverride ?? path.join(homedir(), ".tenas");
  // 中文注释：统一根目录，缺失时自动创建。
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** Resolve the default workspace root directory and ensure it exists. */
export function getDefaultWorkspaceRootDir(): string {
  const root =
    workspaceRootOverride ??
    (process.platform === "win32"
      ? resolveWindowsWorkspaceRoot()
      : resolveUnixWorkspaceRoot());
  // 中文注释：默认工作区目录固定，缺失时自动创建。
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** Resolve legacy workspace root directory used by older builds. */
export function getLegacyWorkspaceRootDir(): string {
  return path.join(getTenasRootDir(), "workspace");
}

/** Resolve a file path under the Tenas root directory. */
export function resolveTenasPath(...segments: string[]): string {
  return path.join(getTenasRootDir(), ...segments);
}

/** Resolve the default database file path under the Tenas root directory. */
export function resolveTenasDbPath(): string {
  return resolveTenasPath("tenas.db");
}

/** Resolve the default database URL for Prisma/libsql. */
export function resolveTenasDatabaseUrl(): string {
  return `file:${resolveTenasDbPath()}`;
}

export type LegacyMigrationResult = {
  moved: string[];
  skipped: string[];
};

export type LegacyMigrationOptions = {
  legacyRoot?: string;
  targetRoot?: string;
  workspaceRoot?: string;
  logger?: (message: string) => void;
};

/**
 * Migrate legacy server data from the repo `apps/server` directory to the Tenas root.
 */
export function migrateLegacyServerData(
  options: LegacyMigrationOptions = {}
): LegacyMigrationResult {
  const moved: string[] = [];
  const skipped: string[] = [];
  const targetRoot = options.targetRoot ?? getTenasRootDir();
  const workspaceRoot = options.workspaceRoot ?? getDefaultWorkspaceRootDir();
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
    // 中文注释：跨盘移动可能失败，这里兜底为复制后删除。
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
  moveFile("workspaces.json");
  moveFile("local.db", "tenas.db");
  moveFile("local-auth.json");

  const legacyWorkspace = path.join(legacyRoot, "workspace");
  const targetWorkspace = workspaceRoot;
  const moveWorkspaceOnce = (sourcePath: string) => {
    if (!fs.existsSync(sourcePath)) return;
    const workspaceResult = moveDirectoryContents(sourcePath, targetWorkspace);
    if (workspaceResult === "moved") {
      moved.push("workspace");
    } else if (workspaceResult === "skipped") {
      skipped.push("workspace");
    }
  };

  moveWorkspaceOnce(legacyWorkspace);

  const legacyWorkspaceRoot = getLegacyWorkspaceRootDir();
  if (
    legacyWorkspaceRoot !== targetWorkspace &&
    legacyWorkspaceRoot !== legacyWorkspace
  ) {
    moveWorkspaceOnce(legacyWorkspaceRoot);
  }

  if (options.logger) {
    options.logger(
      `legacy migration complete (moved: ${moved.length}, skipped: ${skipped.length})`
    );
  }

  return { moved, skipped };
}

function resolveUnixWorkspaceRoot(): string {
  return path.join(homedir(), process.platform === "darwin" ? "Documents" : "", "tenas-workspace");
}

function resolveWindowsWorkspaceRoot(): string {
  const dDriveRoot = "D:\\\\tenas-workspace";
  if (fs.existsSync("D:\\\\")) {
    return dDriveRoot;
  }
  return path.join(homedir(), "tenas-workspace");
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

function moveDirectoryContents(sourceDir: string, targetDir: string): "moved" | "skipped" {
  if (!fs.existsSync(sourceDir)) return "skipped";

  if (!fs.existsSync(targetDir)) {
    // 中文注释：目标不存在时直接整体迁移目录。
    try {
      fs.renameSync(sourceDir, targetDir);
      return "moved";
    } catch {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  let movedAny = false;

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      const result = moveDirectoryContents(sourcePath, targetPath);
      if (result === "moved") movedAny = true;
      continue;
    }

    if (fs.existsSync(targetPath)) {
      continue;
    }

    // 中文注释：文件冲突时保留目标，避免覆盖已有数据。
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch {
      fs.copyFileSync(sourcePath, targetPath);
      fs.rmSync(sourcePath, { force: true });
    }
    movedAny = true;
  }

  // 中文注释：清理空目录，保持旧目录不残留。
  if (fs.existsSync(sourceDir) && fs.readdirSync(sourceDir).length === 0) {
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }

  return movedAny ? "moved" : "skipped";
}
