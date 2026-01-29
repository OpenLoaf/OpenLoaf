import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sanitizeFileName } from "@/ai/services/image/imageStorage";
import {
  getProjectRootPath,
  getWorkspaceRootPathById,
  resolveFilePathFromUri,
} from "@tenas-ai/api/services/vfsService";

/** Scoped project path matcher like @[projectId]/path/to/dir. */
const PROJECT_SCOPE_REGEX = /^@?\[([^\]]+)\]\/(.+)$/;
/** Supported video extensions for directory inference. */
const VIDEO_SAVE_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv"]);

/** Check whether extension is a known video extension. */
function isVideoSaveExtension(ext: string): boolean {
  return VIDEO_SAVE_EXTENSIONS.has(ext.toLowerCase());
}

/** Normalize a target path into a directory. */
async function normalizeVideoSaveDirectory(targetPath: string): Promise<string> {
  try {
    const stat = await fs.stat(targetPath);
    // 已存在文件时使用其所在目录，避免覆盖文件。
    if (stat.isFile()) return path.dirname(targetPath);
    return targetPath;
  } catch {
    const ext = path.extname(targetPath).toLowerCase();
    // 兼容传入文件路径时自动取目录。
    if (isVideoSaveExtension(ext)) return path.dirname(targetPath);
    return targetPath;
  }
}

/** Resolve local directory from a project-relative path. */
function resolveRelativeSaveDirectory(input: {
  /** Relative path input. */
  path: string;
  /** Optional workspace id fallback. */
  workspaceId?: string | null;
  /** Optional project id fallback. */
  projectId?: string | null;
}): string | null {
  const normalized = input.path.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  if (!normalized) return null;
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  const projectRootPath = input.projectId ? getProjectRootPath(input.projectId) : null;
  const workspaceRootPath =
    projectRootPath || !input.workspaceId ? null : getWorkspaceRootPathById(input.workspaceId);
  const rootPath = projectRootPath ?? workspaceRootPath;
  if (!rootPath) return null;

  const targetPath = path.resolve(rootPath, normalized);
  const rootPathResolved = path.resolve(rootPath);
  // 限制在 workspace/project 根目录内，避免路径穿越。
  if (targetPath !== rootPathResolved && !targetPath.startsWith(rootPathResolved + path.sep)) {
    return null;
  }
  return targetPath;
}

/** Resolve local directory from video save directory input. */
export async function resolveVideoSaveDirectory(input: {
  /** Raw save directory uri. */
  saveDir: string;
  /** Optional workspace id fallback. */
  workspaceId?: string | null;
  /** Optional project id fallback. */
  projectId?: string | null;
}): Promise<string | null> {
  const raw = input.saveDir.trim();
  if (!raw) return null;

  if (raw.startsWith("file://")) {
    try {
      const filePath = resolveFilePathFromUri(raw);
      return normalizeVideoSaveDirectory(filePath);
    } catch {
      return null;
    }
  }

  const scopeMatch = raw.match(PROJECT_SCOPE_REGEX);
  if (scopeMatch) {
    const scopedProjectId = scopeMatch[1]?.trim();
    const scopedRelativePath = scopeMatch[2] ?? "";
    if (!scopedProjectId) return null;
    const dirPath = resolveRelativeSaveDirectory({
      path: scopedRelativePath,
      workspaceId: input.workspaceId,
      projectId: scopedProjectId,
    });
    if (!dirPath) return null;
    return normalizeVideoSaveDirectory(dirPath);
  }

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    const dirPath = resolveRelativeSaveDirectory({
      path: raw,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
    if (!dirPath) return null;
    return normalizeVideoSaveDirectory(dirPath);
  }

  return null;
}

/** Resolve extension from media type or url. */
function resolveVideoExtension(input: { mediaType: string; url: string }): string {
  const mediaType = input.mediaType.toLowerCase();
  if (mediaType.includes("webm")) return "webm";
  if (mediaType.includes("quicktime")) return "mov";
  if (mediaType.includes("mp4")) return "mp4";
  try {
    const parsed = new URL(input.url);
    const ext = path.extname(parsed.pathname).toLowerCase().replace(".", "");
    if (ext && isVideoSaveExtension(`.${ext}`)) return ext;
  } catch {
    // ignore invalid url
  }
  return "mp4";
}

/** Download a video and save to directory. */
export async function saveGeneratedVideoFromUrl(input: {
  /** Source url. */
  url: string;
  /** Target directory path. */
  directory: string;
  /** Base file name (without extension). */
  fileNameBase: string;
}): Promise<{ filePath: string; fileName: string; mediaType: string }> {
  const response = await fetch(input.url);
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`下载视频失败: ${response.status} ${text}`);
  }
  const mediaType = response.headers.get("content-type") || "video/mp4";
  const ext = resolveVideoExtension({ mediaType, url: input.url });
  const safeBase = sanitizeFileName(input.fileNameBase) || "video";
  const fileName = `${safeBase}.${ext}`;
  const filePath = path.join(input.directory, fileName);
  await fs.mkdir(input.directory, { recursive: true });
  const stream = Readable.fromWeb(response.body as any);
  await pipeline(stream, createWriteStream(filePath));
  return { filePath, fileName, mediaType };
}
