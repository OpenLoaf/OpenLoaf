import path from "node:path";
import { promises as fs } from "node:fs";
import ignore, { type Ignore } from "ignore";
import { getProjectRootPath } from "./vfsService";

export type ProjectFileChange = {
  /** Relative path from project root. */
  relativePath: string;
  /** Last modified time (ISO). */
  updatedAt: string;
};

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  ".openloaf",
  ".openloaf-cache",
  "node_modules",
  "dist",
  "build",
  ".turbo",
]);
const GITIGNORE_FILE = ".gitignore";

type IgnoreMatcher = Ignore;

/** List files changed in a time range for a project. */
export async function listProjectFilesChangedInRange(input: {
  projectId: string;
  from: Date;
  to: Date;
  maxItems?: number;
}): Promise<ProjectFileChange[]> {
  const rootPath = getProjectRootPath(input.projectId);
  if (!rootPath) {
    throw new Error("项目不存在");
  }
  const maxItems = typeof input.maxItems === "number" && input.maxItems > 0 ? input.maxItems : 200;
  const results: ProjectFileChange[] = [];
  // 逻辑：非 git 项目或无提交时，使用文件更新时间作为变更参考。
  const ignoreMatcher = await buildGitignoreMatcher({ rootPath });
  await walkDir(rootPath, rootPath, input.from, input.to, results, maxItems, ignoreMatcher);
  return results;
}

/** Build a gitignore matcher from .gitignore files within the tree. */
async function buildGitignoreMatcher(input: { rootPath: string }): Promise<IgnoreMatcher> {
  const matcher = ignore();
  const defaultPatterns = Array.from(DEFAULT_IGNORE_DIRS).map((dir) => `${dir}/`);
  matcher.add(defaultPatterns);
  await collectGitignoreFiles(input.rootPath, input.rootPath, matcher);
  return matcher;
}

async function collectGitignoreFiles(
  rootPath: string,
  dirPath: string,
  matcher: IgnoreMatcher,
): Promise<void> {
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  const gitignore = entries.find((entry) => entry.isFile() && entry.name === GITIGNORE_FILE);
  if (gitignore) {
    const filePath = path.join(dirPath, GITIGNORE_FILE);
    const raw = await fs.readFile(filePath, "utf-8");
    const baseRel = toRelativePath(rootPath, dirPath);
    const patterns = mapGitignorePatterns(raw, baseRel);
    if (patterns.length) {
      matcher.add(patterns);
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
    const entryPath = path.join(dirPath, entry.name);
    await collectGitignoreFiles(rootPath, entryPath, matcher);
  }
}

function mapGitignorePatterns(raw: string, baseRel: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => prefixGitignorePattern(line, baseRel))
    .filter((line): line is string => Boolean(line));
}

function prefixGitignorePattern(raw: string, baseRel: string): string | null {
  if (!raw) return null;
  const negated = raw.startsWith("!");
  const pattern = negated ? raw.slice(1) : raw;
  if (!pattern) return null;
  const normalized = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  const prefix = baseRel ? `${baseRel}/` : "";
  const combined = `${prefix}${normalized}`;
  return negated ? `!${combined}` : combined;
}

async function walkDir(
  basePath: string,
  dirPath: string,
  from: Date,
  to: Date,
  results: ProjectFileChange[],
  maxItems: number,
  ignoreMatcher: IgnoreMatcher,
): Promise<void> {
  if (results.length >= maxItems) return;
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxItems) break;
    const entryPath = path.join(dirPath, entry.name);
    const relativePath = toRelativePath(basePath, entryPath);
    if (entry.isDirectory()) {
      if (ignoreMatcher.ignores(`${relativePath}/`)) {
        continue;
      }
      await walkDir(basePath, entryPath, from, to, results, maxItems, ignoreMatcher);
      continue;
    }
    if (!entry.isFile()) continue;
    if (ignoreMatcher.ignores(relativePath)) {
      continue;
    }
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(entryPath);
    } catch {
      continue;
    }
    if (stat.mtime >= from && stat.mtime <= to) {
      results.push({
        relativePath,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }
}

function toRelativePath(rootPath: string, targetPath: string): string {
  return path.relative(rootPath, targetPath).replace(/\\/g, "/");
}
