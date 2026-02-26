import * as nodeFs from "node:fs";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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

export type ProjectGitBranch = {
  /** Branch name. */
  name: string;
  /** Whether this branch is the current branch. */
  isCurrent: boolean;
};

export type ProjectGitBranchList = {
  /** Whether the project root belongs to a git repository. */
  isGitProject: boolean;
  /** Current branch name. */
  currentBranch: string | null;
  /** Local branches list. */
  branches: ProjectGitBranch[];
};

export type ProjectGitCommit = {
  /** Full commit oid. */
  oid: string;
  /** Short commit oid. */
  shortOid: string;
  /** Commit summary (first line). */
  summary: string;
  /** Author name. */
  authorName: string | null;
  /** Author email. */
  authorEmail: string | null;
  /** Commit time (ISO string). */
  authoredAt: string;
  /** Changed files count. */
  filesChanged: number;
  /** Inserted lines count. */
  insertions: number;
  /** Deleted lines count. */
  deletions: number;
};

export type ProjectGitCommitPage = {
  /** Whether the project root belongs to a git repository. */
  isGitProject: boolean;
  /** Branch name used for listing. */
  branch: string | null;
  /** Commit items. */
  items: ProjectGitCommit[];
  /** Cursor to load the next page. */
  nextCursor: string | null;
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

type GitCommitStats = {
  /** Changed files count. */
  filesChanged: number;
  /** Inserted lines count. */
  insertions: number;
  /** Deleted lines count. */
  deletions: number;
};

type GitWalkEntry = {
  /** Resolve entry type. */
  type: () => Promise<string>;
  /** Resolve entry oid. */
  oid: () => Promise<string>;
  /** Resolve entry content. */
  content: () => Promise<Uint8Array>;
};

type GitCliCommitQuery = {
  /** Repo context for CLI execution. */
  ctx: GitRepoContext;
  /** Ref or cursor to use for git log. */
  ref: string;
  /** Pagination cursor. */
  cursor: string | null;
  /** Page size. */
  pageSize: number;
};

/** Default commit page size for history queries. */
const DEFAULT_GIT_PAGE_SIZE = 30;
/** Max commit page size to avoid heavy git log scans. */
const MAX_GIT_PAGE_SIZE = 120;
/** Maximum blob size (bytes) to run line diff in fallback mode. */
const MAX_DIFF_BYTES = 200_000;
/** Maximum total DP cells for line diff. */
const MAX_DIFF_CELLS = 2_000_000;
/** Timeout for detecting git CLI (ms). */
const GIT_CLI_VERSION_TIMEOUT_MS = 1500;
/** Timeout for git log command (ms). */
const GIT_CLI_LOG_TIMEOUT_MS = 6000;
/** Separator for git log commit header. */
const GIT_LOG_SEPARATOR = "@@@";
/** Field separator in git log format. */
const GIT_LOG_FIELD_SEPARATOR = "\x1f";
/** Cached git CLI availability. */
let gitCliAvailable: boolean | null = null;
/** Marker for appended gitignore template. */
const GITIGNORE_TEMPLATE_MARKER = "# OpenLoaf default .gitignore";

/** Exec helper for git CLI. */
const execFileAsync = promisify(execFile);

type GitRepoResolveOptions = {
  /** Whether to scan parent directories for .git. */
  allowParentScan?: boolean;
};

/** Resolve git working directory and gitdir for a project path. */
async function resolveGitRepoContext(
  startPath: string,
  options: GitRepoResolveOptions = {}
): Promise<GitRepoContext | null> {
  const allowParentScan = options.allowParentScan === true;
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
    // 逻辑：默认仅检查项目根目录，显式开启时才向上查找。
    if (!allowParentScan) break;
    previous = cursor;
    cursor = path.dirname(cursor);
  }

  return null;
}

/** Normalize text content to LF and trim trailing whitespace. */
function normalizeTextContent(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\s+$/g, "");
}

/** Resolve whether a gitignore content already contains the template marker. */
function hasGitignoreTemplate(raw: string): boolean {
  return raw.includes(GITIGNORE_TEMPLATE_MARKER);
}

/** Merge gitignore template into target path without overwriting existing content. */
async function mergeGitignoreTemplate(input: {
  rootPath: string;
  templatePath: string;
}): Promise<void> {
  const gitignorePath = path.join(input.rootPath, ".gitignore");
  let templateRaw = "";
  try {
    templateRaw = await fs.readFile(input.templatePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // 中文注释：模板不存在时跳过，避免影响项目初始化。
    if (code === "ENOENT") return;
    throw err;
  }
  const normalizedTemplate = normalizeTextContent(templateRaw);
  if (!normalizedTemplate) return;

  let existingRaw = "";
  try {
    existingRaw = await fs.readFile(gitignorePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
  if (existingRaw && hasGitignoreTemplate(existingRaw)) {
    return;
  }

  const normalizedExisting = normalizeTextContent(existingRaw);
  const nextContent = normalizedExisting
    ? `${normalizedExisting}\n\n${normalizedTemplate}\n`
    : `${normalizedTemplate}\n`;
  // 中文注释：保留原有 .gitignore 内容并追加模板。
  await fs.writeFile(gitignorePath, nextContent, "utf-8");
}

/** Initialize a git repository with a default branch. */
async function initGitRepository(input: {
  rootPath: string;
  defaultBranch: string;
}): Promise<void> {
  const defaultBranch = input.defaultBranch.trim() || "main";
  if (await checkGitCliAvailable(input.rootPath)) {
    try {
      const args = ["init", "-b", defaultBranch];
      await execFileAsync("git", args, { cwd: input.rootPath });
      return;
    } catch {
      // 中文注释：git 旧版本不支持 -b 时回退处理。
    }
    try {
      await execFileAsync("git", ["init"], { cwd: input.rootPath });
      await execFileAsync("git", ["symbolic-ref", "HEAD", `refs/heads/${defaultBranch}`], {
        cwd: input.rootPath,
      });
      return;
    } catch {
      // 中文注释：CLI 初始化失败时回退到 isomorphic-git。
    }
  }

  await git.init({
    fs: nodeFs,
    dir: input.rootPath,
    defaultBranch,
  });
}

/** Ensure a project path is a git repository and has the gitignore template appended. */
export async function ensureGitRepository(input: {
  rootPath: string;
  defaultBranch: string;
  templatePath: string;
}): Promise<void> {
  const rootPath = input.rootPath.trim();
  if (!rootPath) {
    throw new Error("项目路径不能为空");
  }
  const existingRepo = await resolveGitRepoContext(rootPath, {
    allowParentScan: true,
  });
  if (existingRepo) return;
  // 中文注释：非 Git 项目时自动初始化仓库并追加模板。
  await initGitRepository({ rootPath, defaultBranch: input.defaultBranch });
  await mergeGitignoreTemplate({ rootPath, templatePath: input.templatePath });
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

/** Normalize page size for git history queries. */
function normalizeGitPageSize(pageSize?: number | null): number {
  if (!pageSize || Number.isNaN(pageSize)) return DEFAULT_GIT_PAGE_SIZE;
  const normalized = Math.floor(pageSize);
  return Math.min(Math.max(normalized, 1), MAX_GIT_PAGE_SIZE);
}

/** Resolve the commit summary from a raw git message. */
function resolveCommitSummary(message: string | undefined): string {
  const summary = (message ?? "").split(/\r?\n/)[0]?.trim() ?? "";
  return summary || "无提交信息";
}

/** Build a short oid for display. */
function buildShortOid(oid: string): string {
  return oid.slice(0, 7);
}

/** Check whether git CLI is available on this host. */
async function checkGitCliAvailable(workdir: string): Promise<boolean> {
  if (gitCliAvailable !== null) return gitCliAvailable;
  try {
    await execFileAsync("git", ["--version"], {
      cwd: workdir,
      timeout: GIT_CLI_VERSION_TIMEOUT_MS,
    });
    gitCliAvailable = true;
  } catch {
    gitCliAvailable = false;
  }
  return gitCliAvailable;
}

/** Parse git log header line into commit metadata. */
function parseGitLogHeaderLine(line: string): ProjectGitCommit | null {
  if (!line.startsWith(GIT_LOG_SEPARATOR)) return null;
  const payload = line.slice(GIT_LOG_SEPARATOR.length);
  const parts = payload.split(GIT_LOG_FIELD_SEPARATOR);
  const [oid, authorName, authorEmail, authoredAtRaw, summaryRaw] = parts;
  if (!oid) return null;
  const timestamp = Number(authoredAtRaw ?? "0");
  const authoredAt = Number.isNaN(timestamp)
    ? new Date(0).toISOString()
    : new Date(timestamp * 1000).toISOString();
  return {
    oid,
    shortOid: buildShortOid(oid),
    summary: resolveCommitSummary(summaryRaw ?? ""),
    authorName: authorName?.trim() || null,
    authorEmail: authorEmail?.trim() || null,
    authoredAt,
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
  };
}

/** Parse a git numstat line into change counts. */
function parseGitNumstatLine(line: string): {
  insertions: number;
  deletions: number;
  isBinary: boolean;
} | null {
  const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
  if (!match) return null;
  const rawInsertions = match[1] ?? "-";
  const rawDeletions = match[2] ?? "-";
  const isBinary = rawInsertions === "-" || rawDeletions === "-";
  const insertions = isBinary ? 0 : Number.parseInt(rawInsertions, 10);
  const deletions = isBinary ? 0 : Number.parseInt(rawDeletions, 10);
  return {
    insertions: Number.isNaN(insertions) ? 0 : insertions,
    deletions: Number.isNaN(deletions) ? 0 : deletions,
    isBinary,
  };
}

/** Parse git log output with numstat into commit items. */
function parseGitLogWithNumstat(raw: string): ProjectGitCommit[] {
  const commits: ProjectGitCommit[] = [];
  const lines = raw.split(/\r?\n/);
  let current: ProjectGitCommit | null = null;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith(GIT_LOG_SEPARATOR)) {
      if (current) commits.push(current);
      current = parseGitLogHeaderLine(line);
      continue;
    }
    if (!current) continue;
    const stats = parseGitNumstatLine(line);
    if (!stats) continue;
    current.filesChanged += 1;
    current.insertions += stats.insertions;
    current.deletions += stats.deletions;
  }
  if (current) commits.push(current);
  return commits;
}

/** Detect whether a buffer is binary-ish. */
function isBinaryBuffer(buffer: Buffer): boolean {
  // 中文注释：包含 0 字节则视为二进制文件。
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

/** Split text into lines for diff. */
function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** Count lines in a buffer (text only). */
function countLinesFromBuffer(buffer: Buffer): number {
  const text = buffer.toString("utf8");
  return splitLines(text).length;
}

/** Compute LCS length for two line arrays. */
function lcsLength(a: string[], b: string[]): number {
  if (b.length === 0 || a.length === 0) return 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let prev = new Array(shorter.length + 1).fill(0);
  let curr = new Array(shorter.length + 1).fill(0);
  for (let i = 1; i <= longer.length; i += 1) {
    const line = longer[i - 1];
    for (let j = 1; j <= shorter.length; j += 1) {
      if (line === shorter[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[shorter.length] ?? 0;
}

/** Compute line insertions/deletions for two text blobs. */
function computeLineChanges(
  beforeText: string,
  afterText: string
): Pick<GitCommitStats, "insertions" | "deletions"> {
  const beforeLines = splitLines(beforeText);
  const afterLines = splitLines(afterText);
  const cells = beforeLines.length * afterLines.length;
  if (cells > MAX_DIFF_CELLS) {
    return {
      insertions: afterLines.length,
      deletions: beforeLines.length,
    };
  }
  const lcs = lcsLength(beforeLines, afterLines);
  return {
    insertions: Math.max(0, afterLines.length - lcs),
    deletions: Math.max(0, beforeLines.length - lcs),
  };
}

/** Check whether a blob should skip line diff. */
function shouldSkipLineDiff(buffer: Buffer): boolean {
  return buffer.length > MAX_DIFF_BYTES || isBinaryBuffer(buffer);
}

/** Read git walker entry content as a buffer. */
async function readEntryBuffer(entry: GitWalkEntry | null): Promise<Buffer | null> {
  if (!entry) return null;
  const type = await entry.type();
  if (type !== "blob") return null;
  const content = await entry.content();
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

/** Collect commit stats via git walk diff. */
async function collectCommitStatsWithGitWalk(
  ctx: GitRepoContext,
  currentOid: string,
  parentOid: string | null
): Promise<GitCommitStats> {
  const stats: GitCommitStats = {
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
  };

  if (!parentOid) {
    // 中文注释：初始提交，所有文件视为新增。
    await git.walk({
      fs: nodeFs,
      dir: ctx.workdir,
      gitdir: ctx.gitdir,
      trees: [git.TREE({ ref: currentOid })],
      map: async (filepath, entries) => {
        if (filepath === ".") return;
        const entry = (entries?.[0] ?? null) as GitWalkEntry | null;
        if (!entry) return;
        const entryType = await entry.type();
        if (entryType === "tree") return;
        stats.filesChanged += 1;
        const buffer = await readEntryBuffer(entry);
        if (!buffer) return;
        if (shouldSkipLineDiff(buffer)) return;
        stats.insertions += countLinesFromBuffer(buffer);
      },
    });
    return stats;
  }

  await git.walk({
    fs: nodeFs,
    dir: ctx.workdir,
    gitdir: ctx.gitdir,
    trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: currentOid })],
    map: async (filepath, entries) => {
      if (filepath === ".") return;
      const beforeEntry = (entries?.[0] ?? null) as GitWalkEntry | null;
      const afterEntry = (entries?.[1] ?? null) as GitWalkEntry | null;
      if (!beforeEntry && !afterEntry) return;
      const beforeType = beforeEntry ? await beforeEntry.type() : null;
      const afterType = afterEntry ? await afterEntry.type() : null;
      if (beforeType === "tree" || afterType === "tree") return;
      if (beforeEntry && afterEntry) {
        const [beforeOid, afterOid] = await Promise.all([
          beforeEntry.oid(),
          afterEntry.oid(),
        ]);
        if (beforeOid && afterOid && beforeOid === afterOid) return;
      }
      stats.filesChanged += 1;

      const [beforeBuffer, afterBuffer] = await Promise.all([
        readEntryBuffer(beforeEntry),
        readEntryBuffer(afterEntry),
      ]);
      if (!beforeBuffer && !afterBuffer) return;
      if (beforeBuffer && !afterBuffer) {
        if (shouldSkipLineDiff(beforeBuffer)) return;
        stats.deletions += countLinesFromBuffer(beforeBuffer);
        return;
      }
      if (!beforeBuffer && afterBuffer) {
        if (shouldSkipLineDiff(afterBuffer)) return;
        stats.insertions += countLinesFromBuffer(afterBuffer);
        return;
      }
      if (!beforeBuffer || !afterBuffer) return;
      if (shouldSkipLineDiff(beforeBuffer) || shouldSkipLineDiff(afterBuffer)) return;
      const beforeText = beforeBuffer.toString("utf8");
      const afterText = afterBuffer.toString("utf8");
      const diff = computeLineChanges(beforeText, afterText);
      stats.insertions += diff.insertions;
      stats.deletions += diff.deletions;
    },
  });

  return stats;
}

/** Read git commit history with CLI numstat. */
async function readGitCommitsWithCli(
  input: GitCliCommitQuery
): Promise<{ items: ProjectGitCommit[]; hasMore: boolean }> {
  const maxCount = input.pageSize + (input.cursor ? 2 : 1);
  const format = [
    `${GIT_LOG_SEPARATOR}%H`,
    "%an",
    "%ae",
    "%at",
    "%s",
  ].join(GIT_LOG_FIELD_SEPARATOR);
  const args = [
    "--no-pager",
    "log",
    "--numstat",
    `--max-count=${maxCount}`,
    `--format=${format}`,
    input.ref,
  ];
  const { stdout } = await execFileAsync("git", args, {
    cwd: input.ctx.workdir,
    timeout: GIT_CLI_LOG_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = parseGitLogWithNumstat(stdout ?? "");
  const trimmed = input.cursor ? parsed.slice(1) : parsed;
  const items = trimmed.slice(0, input.pageSize);
  return {
    items,
    hasMore: trimmed.length > input.pageSize,
  };
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

/** Get local git branches for a project. */
export async function getProjectGitBranches(
  projectId: string
): Promise<ProjectGitBranchList> {
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
      currentBranch: null,
      branches: [],
    };
  }

  const [currentBranch, branchNames] = await Promise.all([
    resolveCurrentBranch(repoContext),
    git.listBranches({
      fs: nodeFs,
      dir: repoContext.workdir,
      gitdir: repoContext.gitdir,
    }),
  ]);

  // 中文注释：当前分支置顶，其余按名称排序。
  const sorted = [...branchNames].sort((a, b) => {
    if (currentBranch && a === currentBranch) return -1;
    if (currentBranch && b === currentBranch) return 1;
    return a.localeCompare(b);
  });

  return {
    isGitProject: true,
    currentBranch,
    branches: sorted.map((name) => ({
      name,
      isCurrent: currentBranch === name,
    })),
  };
}

/** Get git commits for a project with cursor pagination. */
export async function getProjectGitCommits(input: {
  projectId: string;
  branch?: string | null;
  cursor?: string | null;
  pageSize?: number | null;
}): Promise<ProjectGitCommitPage> {
  const trimmedId = input.projectId.trim();
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
      items: [],
      nextCursor: null,
    };
  }

  const requestedBranch = input.branch?.trim() || null;
  const currentBranch = await resolveCurrentBranch(repoContext);
  const resolvedBranch = requestedBranch || currentBranch;
  const cursor = input.cursor?.trim() || null;
  const pageSize = normalizeGitPageSize(input.pageSize);
  const offset = cursor ? 1 : 0;
  const depth = pageSize + offset + 1;
  const ref = cursor ?? resolvedBranch ?? "HEAD";

  // 中文注释：优先使用 git CLI 计算 numstat，失败后回退到 isomorphic-git。
  if (await checkGitCliAvailable(repoContext.workdir)) {
    try {
      const cliResult = await readGitCommitsWithCli({
        ctx: repoContext,
        ref,
        cursor,
        pageSize,
      });
      const lastCliItem = cliResult.items.at(-1);
      const nextCursor = cliResult.hasMore && lastCliItem ? lastCliItem.oid : null;
      return {
        isGitProject: true,
        branch: resolvedBranch,
        items: cliResult.items,
        nextCursor,
      };
    } catch {
      // 中文注释：CLI 异常时使用 isomorphic-git 保障可用性。
    }
  }

  // 中文注释：cursor 作为 ref 定位起点，额外取一条判断是否还有下一页。
  let logEntries: git.ReadCommitResult[];
  try {
    logEntries = await git.log({
      fs: nodeFs,
      dir: repoContext.workdir,
      gitdir: repoContext.gitdir,
      ref,
      depth,
    });
  } catch (error) {
    // 中文注释：记录 ref/分支信息，便于定位 NotFoundError（例如 main 不存在）。
    let branchNames: string[] = [];
    try {
      branchNames = await git.listBranches({
        fs: nodeFs,
        dir: repoContext.workdir,
        gitdir: repoContext.gitdir,
      });
    } catch {
      branchNames = [];
    }
    console.warn("[projectGitService] git.log failed", {
      ref,
      cursor,
      requestedBranch,
      currentBranch,
      resolvedBranch,
      workdir: repoContext.workdir,
      gitdir: repoContext.gitdir,
      branches: branchNames,
      error,
    });
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;
    // 中文注释：当 ref 不存在时直接跳过，避免后台任务崩溃。
    if (errorCode === "NotFoundError") {
      return {
        isGitProject: true,
        branch: resolvedBranch,
        items: [],
        nextCursor: null,
      };
    }
    throw error;
  }

  const pageEntries = logEntries.slice(offset, offset + pageSize);
  const hasMore = logEntries.length > offset + pageSize;
  const items: ProjectGitCommit[] = [];
  for (const entry of pageEntries) {
    const parentOid = entry.commit.parent?.[0] ?? null;
    const stats = await collectCommitStatsWithGitWalk(
      repoContext,
      entry.oid,
      parentOid
    );
    items.push({
      oid: entry.oid,
      shortOid: buildShortOid(entry.oid),
      summary: resolveCommitSummary(entry.commit.message),
      authorName: entry.commit.author.name?.trim() || null,
      authorEmail: entry.commit.author.email?.trim() || null,
      authoredAt: new Date(entry.commit.author.timestamp * 1000).toISOString(),
      filesChanged: stats.filesChanged,
      insertions: stats.insertions,
      deletions: stats.deletions,
    });
  }
  const lastItem = items.at(-1);
  const nextCursor = hasMore && lastItem ? lastItem.oid : null;

  return {
    isGitProject: true,
    branch: resolvedBranch,
    items,
    nextCursor,
  };
}

/** Get git commits for a project within a time range. */
export async function getProjectGitCommitsInRange(input: {
  projectId: string;
  from: Date;
  to: Date;
}): Promise<ProjectGitCommit[]> {
  const commits: ProjectGitCommit[] = [];
  let cursor: string | null = null;
  while (true) {
    const page = await getProjectGitCommits({
      projectId: input.projectId,
      cursor,
      pageSize: 50,
    });
    if (!page.isGitProject) return [];
    for (const item of page.items) {
      const authoredAt = new Date(item.authoredAt);
      if (authoredAt < input.from) return commits;
      if (authoredAt <= input.to) commits.push(item);
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return commits;
}
