import * as nodeFs from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as git from "isomorphic-git";
import { getProjectRootUri, resolveFilePathFromUri } from "./vfsService";

export type ProjectGitInfo = {
  /** Whether the project root belongs to a git repository. */
  isGitProject: boolean;
  /** Current branch name. */
  branch: string | null;
  /** Remote origin URL. */
  originUrl: string | null;
  /** Local git user name. */
  userName: string | null;
  /** Local git user email. */
  userEmail: string | null;
};

type GitRepoContext = {
  /** Working directory that contains the .git entry. */
  workdir: string;
  /** Resolved gitdir path. */
  gitdir: string;
};

type GitConfigSection = {
  /** Section name, e.g. "user". */
  section: string;
  /** Key name within section, e.g. "name". */
  key: string;
};

/** Resolve git working directory and gitdir by walking up from a start path. */
async function resolveGitRepoContext(startPath: string): Promise<GitRepoContext | null> {
  let cursor = path.resolve(startPath);
  let previous = "";

  while (cursor && cursor !== previous) {
    const gitPath = path.join(cursor, ".git");
    try {
      const stat = await fs.stat(gitPath);
      // 逻辑：找到 .git 目录或文件即可认定为仓库根路径。
      if (stat.isDirectory()) {
        return { workdir: cursor, gitdir: gitPath };
      }
      if (stat.isFile()) {
        const raw = await fs.readFile(gitPath, "utf-8");
        const match = /^gitdir:\s*(.+)\s*$/i.exec(raw.trim());
        if (match) {
          const gitdir = match[1]?.trim() ?? "";
          // 逻辑：兼容 worktree 的相对 gitdir 路径。
          const resolvedGitdir = path.isAbsolute(gitdir)
            ? gitdir
            : path.resolve(cursor, gitdir);
          return { workdir: cursor, gitdir: resolvedGitdir };
        }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code && code !== "ENOENT") {
        throw err;
      }
    }
    previous = cursor;
    cursor = path.dirname(cursor);
  }

  return null;
}

/** Resolve current git branch name. */
async function resolveCurrentBranch(ctx: GitRepoContext): Promise<string | null> {
  try {
    const branch = await git.currentBranch({
      fs: nodeFs,
      dir: ctx.workdir,
      gitdir: ctx.gitdir,
      fullname: false,
    });
    return branch?.trim() || null;
  } catch {
    return null;
  }
}

/** Read a local git config value. */
async function readLocalGitConfigValue(
  ctx: GitRepoContext,
  key: string
): Promise<string | null> {
  try {
    const value = await git.getConfig({
      fs: nodeFs,
      dir: ctx.workdir,
      gitdir: ctx.gitdir,
      path: key,
    });
    return value?.trim() || null;
  } catch {
    return null;
  }
}

/** Resolve global git config file candidates. */
function resolveGlobalGitConfigPaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];
  const xdgHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgHome) {
    paths.push(path.join(xdgHome, "git", "config"));
  } else if (home) {
    paths.push(path.join(home, ".config", "git", "config"));
  }
  if (home) {
    paths.push(path.join(home, ".gitconfig"));
  }
  return paths;
}

/** Parse a config key into section and key name. */
function parseGitConfigKey(key: string): GitConfigSection | null {
  const [section, rawKey] = key.split(".");
  if (!section || !rawKey) return null;
  return { section: section.toLowerCase(), key: rawKey.toLowerCase() };
}

/** Strip quotes and inline comments from a git config value. */
function normalizeGitConfigValue(rawValue: string): string {
  let value = rawValue.trim();
  if (!value) return "";
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  const commentIndex = value.search(/\s[;#]/);
  if (commentIndex >= 0) {
    value = value.slice(0, commentIndex).trim();
  }
  return value;
}

/** Read a config value from a raw git config file. */
function readGitConfigValueFromRaw(
  raw: string,
  target: GitConfigSection
): string | null {
  let currentSection = "";
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const header = trimmed.slice(1, -1).trim();
      const sectionName = header.split(/\s+/)[0]?.toLowerCase() ?? "";
      currentSection = sectionName;
      continue;
    }
    if (currentSection !== target.section) continue;
    const match = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1]?.toLowerCase() ?? "";
    if (key !== target.key) continue;
    const value = normalizeGitConfigValue(match[2] ?? "");
    return value || null;
  }
  return null;
}

/** Read a config value from a git config file on disk. */
async function readGitConfigValueFromFile(
  filePath: string,
  key: string
): Promise<string | null> {
  const target = parseGitConfigKey(key);
  if (!target) return null;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return readGitConfigValueFromRaw(raw, target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    return null;
  }
}

/** Read a git config value with optional global fallback. */
async function readGitConfigValue(
  ctx: GitRepoContext,
  key: string,
  options?: { allowGlobalFallback?: boolean }
): Promise<string | null> {
  const localValue = await readLocalGitConfigValue(ctx, key);
  if (localValue || !options?.allowGlobalFallback) return localValue;
  const candidates = resolveGlobalGitConfigPaths();
  for (const candidate of candidates) {
    const value = await readGitConfigValueFromFile(candidate, key);
    if (value) return value;
  }
  return null;
}

/** Get git info for a single project. */
export async function getProjectGitInfo(projectId: string): Promise<ProjectGitInfo> {
  const trimmedId = projectId.trim();
  if (!trimmedId) {
    throw new Error("项目 ID 不能为空");
  }
  const rootUri = getProjectRootUri(trimmedId);
  if (!rootUri) {
    throw new Error("项目不存在");
  }
  const rootPath = resolveFilePathFromUri(rootUri);
  const repoContext = await resolveGitRepoContext(rootPath);
  if (!repoContext) {
    return {
      isGitProject: false,
      branch: null,
      originUrl: null,
      userName: null,
      userEmail: null,
    };
  }

  const [branch, originUrl, userName, userEmail] = await Promise.all([
    resolveCurrentBranch(repoContext),
    readGitConfigValue(repoContext, "remote.origin.url"),
    readGitConfigValue(repoContext, "user.name", { allowGlobalFallback: true }),
    readGitConfigValue(repoContext, "user.email", { allowGlobalFallback: true }),
  ]);

  return {
    isGitProject: true,
    branch,
    originUrl,
    userName,
    userEmail,
  };
}
