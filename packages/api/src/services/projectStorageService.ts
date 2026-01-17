import path from "node:path";
import { promises as fs } from "node:fs";
import {
  getActiveWorkspace,
  getProjectRootUri,
  resolveFilePathFromUri,
  toFileUriWithoutEncoding,
  upsertActiveWorkspaceProject,
} from "./vfsService";
import {
  findProjectNodeWithParent,
  getProjectMetaPath,
  projectConfigSchema,
  readProjectConfig,
  readWorkspaceProjectTrees,
} from "./projectTreeService";
import { syncWorkspaceProjectsFromDisk, type ProjectDbClient } from "./projectDbService";

type MoveProjectStorageInput = {
  /** Project id to move. */
  projectId: string;
  /** Target parent directory picked by user. */
  targetParentPath: string;
  /** Prisma client used for project sync. */
  prisma: ProjectDbClient;
};

type MoveProjectStorageResult = {
  /** Updated project root URI. */
  rootUri: string;
  /** Whether the move was skipped due to unchanged path. */
  unchanged?: boolean;
};

/** Resolve a local path from a file URI or absolute string. */
function resolveLocalPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) {
    return resolveFilePathFromUri(trimmed);
  }
  return path.resolve(trimmed);
}

/** Check whether a path exists. */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? false : false;
  }
}

/** Ensure the target parent directory exists and is a folder. */
async function ensureParentDirectory(dirPath: string): Promise<void> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error("目标路径不是文件夹");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("目标路径不存在");
    }
    throw err;
  }
}

/** Move a directory with cross-device fallback. */
async function moveDirectory(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, targetPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    // 逻辑：跨磁盘移动时先复制再删除源目录。
    await fs.cp(sourcePath, targetPath, { recursive: true });
    await fs.rm(sourcePath, { recursive: true, force: true });
  }
}

/** Update a child project entry under its parent project.json. */
async function updateChildProjectEntry(
  parentProjectId: string,
  childProjectId: string,
  childRootUri: string,
): Promise<void> {
  const parentRootUri = getProjectRootUri(parentProjectId);
  if (!parentRootUri) {
    throw new Error("父项目不存在");
  }
  const parentRootPath = resolveFilePathFromUri(parentRootUri);
  const metaPath = getProjectMetaPath(parentRootPath);
  const existing = await readProjectConfig(parentRootPath, parentProjectId);
  const nextProjects = { ...(existing.projects ?? {}) };
  nextProjects[childProjectId] = childRootUri;
  const nextConfig = projectConfigSchema.parse({
    ...existing,
    projects: nextProjects,
  });
  // 逻辑：更新父项目的子项目路径映射，避免丢失挂载关系。
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  const tmpPath = `${metaPath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(nextConfig, null, 2), "utf-8");
  await fs.rename(tmpPath, metaPath);
}

/** Move project storage folder and update workspace config. */
export async function moveProjectStorage(
  input: MoveProjectStorageInput,
): Promise<MoveProjectStorageResult> {
  const projectId = input.projectId.trim();
  if (!projectId) {
    throw new Error("项目 ID 不能为空");
  }
  const rootUri = getProjectRootUri(projectId);
  if (!rootUri) {
    throw new Error("项目不存在");
  }
  const targetParentPath = resolveLocalPath(input.targetParentPath);
  if (!targetParentPath) {
    throw new Error("目标路径不能为空");
  }

  const projectTrees = await readWorkspaceProjectTrees();
  const sourceEntry = findProjectNodeWithParent(projectTrees, projectId);
  if (!sourceEntry) {
    throw new Error("项目不存在");
  }

  const sourceRootPath = resolveFilePathFromUri(rootUri);
  const projectFolderName = path.basename(sourceRootPath);
  const nextRootPath = path.join(targetParentPath, projectFolderName);

  await ensureParentDirectory(targetParentPath);

  if (path.resolve(nextRootPath) === path.resolve(sourceRootPath)) {
    return { rootUri, unchanged: true };
  }

  if (await pathExists(nextRootPath)) {
    throw new Error("目标目录已存在");
  }

  await moveDirectory(sourceRootPath, nextRootPath);
  const nextRootUri = toFileUriWithoutEncoding(nextRootPath);

  if (sourceEntry.parentProjectId) {
    await updateChildProjectEntry(sourceEntry.parentProjectId, projectId, nextRootUri);
  } else {
    upsertActiveWorkspaceProject(projectId, nextRootUri);
  }

  const workspaceId = getActiveWorkspace().id;
  await syncWorkspaceProjectsFromDisk(input.prisma, workspaceId);

  return { rootUri: nextRootUri };
}
