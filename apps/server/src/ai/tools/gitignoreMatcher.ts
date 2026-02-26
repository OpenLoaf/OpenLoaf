import path from "node:path";
import { promises as fs } from "node:fs";
import ignore, { type Ignore } from "ignore";

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

type GitignoreMatcherInput = {
  /** Project root path. */
  rootPath: string;
  /** Extra ignore directories. */
  extraIgnoreDirs?: string[];
};

/**
 * Build a gitignore matcher from .gitignore files within the tree.
 */
export async function buildGitignoreMatcher(
  input: GitignoreMatcherInput,
): Promise<Ignore> {
  const matcher = ignore();
  const defaultPatterns = Array.from(DEFAULT_IGNORE_DIRS).map((dir) => `${dir}/`);
  const extraPatterns = (input.extraIgnoreDirs ?? []).map((dir) => `${dir}/`);
  matcher.add([...defaultPatterns, ...extraPatterns]);
  await collectGitignoreFiles(input.rootPath, input.rootPath, matcher);
  return matcher;
}

async function collectGitignoreFiles(
  rootPath: string,
  dirPath: string,
  matcher: Ignore,
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

function toRelativePath(rootPath: string, targetPath: string): string {
  return path.relative(rootPath, targetPath).replace(/\\/g, "/");
}
