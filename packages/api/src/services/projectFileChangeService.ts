import path from "node:path";
import { promises as fs } from "node:fs";
import { type Ignore } from "ignore";
import { getProjectRootPath } from "./vfsService";
import { buildGitignoreMatcher } from "@/ai/tools/runtime/gitignoreMatcher";

export type ProjectFileChange = {
  /** Relative path from project root. */
  relativePath: string;
  /** Last modified time (ISO). */
  updatedAt: string;
};


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

async function walkDir(
  basePath: string,
  dirPath: string,
  from: Date,
  to: Date,
  results: ProjectFileChange[],
  maxItems: number,
  ignoreMatcher: Ignore,
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
