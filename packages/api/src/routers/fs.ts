/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";
import path from "node:path";
import { promises as fs, type Dirent } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import { fileURLToPath } from "node:url";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";
import { convertDocxFileToSfdt } from "../services/docxSfdtService";
import { resolveFilePathFromUri, resolveScopedPath, resolveScopedRootPath, toRelativePath, toFileUriWithoutEncoding } from "../services/vfsService";
import { readProjectTrees } from "../services/projectTreeService";
import { resolveBoardDirFromDb } from "../common/boardPaths";
import { expandChatDirTemplate } from "../services/chatSessionPaths";

/** Board folder prefix for server-side sorting. */
const BOARD_FOLDER_PREFIX = "board_";
/** Legacy board folder prefix for backward compatibility. */
const BOARD_FOLDER_PREFIX_LEGACY = "tnboard_";
/** Board thumbnail file name inside a board folder. */
const BOARD_THUMBNAIL_FILE_NAME = "index.png";
/** Directory names ignored by search when hidden entries are excluded. */
const SEARCH_IGNORE_NAMES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  ".openloaf-trash",
  "dist",
  "build",
  "out",
]);
/** Default maximum number of search results to return. */
const DEFAULT_SEARCH_LIMIT = 500;
/** Default maximum depth for recursive search. */
const DEFAULT_SEARCH_MAX_DEPTH = 12;
/** Cache directory name for generated video thumbnails. */
const VIDEO_THUMB_CACHE_DIR = ".openloaf-cache/video-thumbs";
/** Default thumbnail width for video previews. */
const VIDEO_THUMB_WIDTH = 320;
/** Default thumbnail height for video previews. */
const VIDEO_THUMB_HEIGHT = 180;
/** Supported video extensions for thumbnail generation. */
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "mkv", "webm", "avi"]);
/** Maximum text file size for preview reads (50 MB). */
const READ_FILE_MAX_BYTES = 50 * 1024 * 1024;

/** Schema for project scope. */
const fsScopeSchema = z.object({
  projectId: z.string().trim().optional(),
  boardId: z.string().trim().optional(),
  /** Override root path for non-project contexts (e.g. temp storage). Accepts file:// URI. */
  rootUri: z.string().trim().optional(),
  /**
   * Chat session id — required when any path argument uses the
   * `${CURRENT_CHAT_DIR}` template. Resolved via expandChatDirTemplate before
   * the scope resolver sees the path, so downstream logic never needs to know
   * about the template.
   */
  sessionId: z.string().trim().optional(),
});

const fsUriSchema = fsScopeSchema.extend({
  uri: z.string(),
});

const fsVideoMetaSchema = fsUriSchema.extend({
  boardId: z.string().trim().optional(),
});

const fsListSchema = fsScopeSchema.extend({
  uri: z.string(),
  includeHidden: z.boolean().optional(),
  // 排序选项：name 按文件名，mtime 按修改时间。
  sort: z
    .object({
      field: z.enum(["name", "mtime"]),
      order: z.enum(["asc", "desc"]),
    })
    .optional(),
});

/** Schema for folder search requests. */
const fsSearchSchema = fsScopeSchema.extend({
  rootUri: z.string(),
  query: z.string(),
  includeHidden: z.boolean().optional(),
  limit: z.number().int().min(1).max(2000).optional(),
  maxDepth: z.number().int().min(0).max(50).optional(),
});

/** Schema for all-project search requests. */
const fsSearchAllProjectsSchema = z.object({
  query: z.string(),
  includeHidden: z.boolean().optional(),
  limit: z.number().int().min(1).max(2000).optional(),
  maxDepth: z.number().int().min(0).max(50).optional(),
});

const fsCopySchema = fsScopeSchema.extend({
  from: z.string(),
  to: z.string(),
});

const fsImportLocalSchema = fsScopeSchema.extend({
  uri: z.string(),
  sourcePath: z.string(),
});

/** Schema for batch thumbnail requests. */
const fsThumbnailSchema = fsScopeSchema.extend({
  uris: z.array(z.string()).max(50),
});

/** Schema for folder thumbnail requests. */
const fsFolderThumbnailSchema = fsScopeSchema.extend({
  uri: z.string(),
  includeHidden: z.boolean().optional(),
});

/** Build a file node for UI consumption. */
type FsFileNode = {
  uri: string;
  name: string;
  kind: "folder" | "file";
  ext?: string;
  size?: number;
  createdAt: string;
  updatedAt: string;
  isEmpty?: boolean;
};

type ResolvedFsReadScope = {
  rootPath: string;
  fullPath: string;
};

type BoardFsScope = {
  projectId?: string;
  boardId?: string;
  rootUri?: string;
  sessionId?: string;
};

/** Return true when the thrown error indicates a stale project scope. */
function isMissingProjectScopeError(error: unknown): boolean {
  return error instanceof Error && error.message === "Project not found.";
}

/** Resolve scoped paths for read-only fs queries and tolerate removed projects. */
function resolveFsReadScope(
  scope: { projectId?: string; rootUri?: string },
  target: string
): ResolvedFsReadScope | null {
  try {
    return {
      rootPath: resolveFsRootPath(scope),
      fullPath: resolveFsTarget(scope, target),
    };
  } catch (error) {
    // 中文注释：项目已删除或注册表未命中时，读查询降级为空结果，避免持续刷 500 日志。
    if (isMissingProjectScopeError(error)) {
      return null;
    }
    throw error;
  }
}

/** Scoped project path matcher like [projectId]/path/to/file. */
const PROJECT_SCOPE_REGEX = /^@?\[([^\]]+)\]\/(.+)$/;

/** Return true when the target should be resolved against a board folder. */
function shouldResolveViaBoardScope(target: string): boolean {
  const raw = target.trim();
  if (!raw) return true;
  if (raw.startsWith("file:")) return false;
  if (path.isAbsolute(raw)) return false;
  if (raw.startsWith("@")) return false;
  if (PROJECT_SCOPE_REGEX.test(raw)) return false;
  return true;
}

/** Resolve a board-relative fs target via boardId + DB folderUri. */
async function resolveBoardFsScope(
  scope: BoardFsScope,
  target: string
): Promise<ResolvedFsReadScope | null> {
  const boardId = scope.boardId?.trim();
  if (!boardId) return null;
  if (!shouldResolveViaBoardScope(target)) return null;
  const boardResult = await resolveBoardDirFromDb(boardId);
  if (!boardResult) {
    throw new Error("Board not found.");
  }
  const normalizedTarget = target
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
  if (normalizedTarget.split("/").some((segment) => segment === "..")) {
    throw new Error("Invalid board path.");
  }
  const basePath = path.resolve(boardResult.absDir);
  const fullPath = normalizedTarget
    ? path.resolve(basePath, normalizedTarget)
    : basePath;
  if (fullPath !== basePath && !fullPath.startsWith(basePath + path.sep)) {
    throw new Error("Invalid board path.");
  }
  return {
    // 中文注释：board-aware 查询统一返回相对画布根目录的 URI（如 asset/foo.png），
    // 避免前端再次拼接 temp/global 根目录。
    rootPath: basePath,
    fullPath,
  };
}

/**
 * Expand `${CURRENT_CHAT_DIR}` templates to an absolute path before any scope
 * resolver sees the string. Downstream resolvers treat expanded paths as
 * absolute file paths, which bypass project/board sandbox checks — the session
 * path itself is already sandboxed to the session's asset dir by construction,
 * so this is the correct place to centralize the template expansion.
 */
async function applyChatDirTemplate(
  scope: BoardFsScope,
  target: string,
): Promise<string> {
  if (!target.includes("${CURRENT_CHAT_DIR}")) return target;
  return expandChatDirTemplate(target, scope.sessionId);
}

/** Resolve fs read scope, preferring boardId when provided. */
async function resolveFsReadScopeAsync(
  scope: BoardFsScope,
  target: string
): Promise<ResolvedFsReadScope | null> {
  const expandedTarget = await applyChatDirTemplate(scope, target);
  const boardScope = await resolveBoardFsScope(scope, expandedTarget);
  if (boardScope) return boardScope;
  return resolveFsReadScope(scope, expandedTarget);
}

/** Resolve fs write target, preferring boardId when provided. */
async function resolveFsTargetAsync(
  scope: BoardFsScope,
  target: string
): Promise<string> {
  const expandedTarget = await applyChatDirTemplate(scope, target);
  const boardScope = await resolveBoardFsScope(scope, expandedTarget);
  if (boardScope) return boardScope.fullPath;
  return resolveFsTarget(scope, expandedTarget);
}

function buildFileNode(input: {
  name: string;
  fullPath: string;
  rootPath: string;
  stat: Awaited<ReturnType<typeof fs.stat>>;
  isEmpty?: boolean;
}): FsFileNode {
  const ext = path.extname(input.name).replace(/^\./, "");
  const isDir = input.stat.isDirectory();
  // 创建时间优先使用 birthtime，避免受元数据变更影响。
  const createdAt = Number.isNaN(input.stat.birthtime.getTime())
    ? input.stat.ctime.toISOString()
    : input.stat.birthtime.toISOString();
  // 当文件在 rootPath 外部时（如全局技能 ~/.agents 不在 ~/.openloaf 下），
  // 使用绝对 file:// URI 避免产生含 ".." 的相对路径被 path traversal 拦截。
  const relativePath = toRelativePath(input.rootPath, input.fullPath);
  const uri = relativePath.startsWith("..") ? toFileUriWithoutEncoding(input.fullPath) : relativePath;
  return {
    uri,
    name: input.name,
    kind: isDir ? "folder" : "file",
    ext: ext || undefined,
    size: isDir ? undefined : Number(input.stat.size),
    createdAt,
    updatedAt: input.stat.mtime.toISOString(),
    isEmpty: isDir ? input.isEmpty : undefined,
  };
}

/** Return true when the file extension belongs to a supported video format. */
function isVideoExt(ext: string) {
  return VIDEO_EXTENSIONS.has(ext.toLowerCase());
}

/** Build a stable cache key for video thumbnails. */
function buildVideoThumbnailKey(input: {
  relativePath: string;
  stat: { size: number; mtimeMs: number };
}) {
  const payload = JSON.stringify({
    path: input.relativePath,
    size: input.stat.size,
    mtime: input.stat.mtimeMs,
    thumb: { width: VIDEO_THUMB_WIDTH, height: VIDEO_THUMB_HEIGHT },
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Probe video dimensions and duration (rotation-aware) from the source file. */
async function probeVideoDimensions(sourcePath: string) {
  return new Promise<{ width: number; height: number; duration?: number } | null>((resolve) => {
    ffmpeg.ffprobe(sourcePath, (error, data) => {
      if (error) {
        resolve(null);
        return;
      }
      const streams = Array.isArray(data?.streams) ? data.streams : [];
      const stream = streams.find((item) => item?.codec_type === "video");
      const width = typeof stream?.width === "number" ? stream.width : 0;
      const height = typeof stream?.height === "number" ? stream.height : 0;
      if (!width || !height) {
        resolve(null);
        return;
      }
      // 逻辑：从 format.duration 提取视频时长（秒），供剪切面板使用。
      const rawDuration = Number(data?.format?.duration);
      const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : undefined;
      const tagRotation = Number(stream?.tags?.rotate);
      const sideRotation = Number(
        stream?.side_data_list?.find((item: { rotation?: number }) => typeof item?.rotation === "number")
          ?.rotation
      );
      const rotation = Number.isFinite(sideRotation)
        ? sideRotation
        : Number.isFinite(tagRotation)
          ? tagRotation
          : 0;
      const normalized = ((rotation % 360) + 360) % 360;
      // 逻辑：处理旋转元信息，确保宽高匹配实际显示方向。
      if (normalized === 90 || normalized === 270) {
        resolve({ width: height, height: width, duration });
        return;
      }
      resolve({ width, height, duration });
    });
  });
}

/** Generate a video thumbnail and return a data URL. */
async function buildVideoThumbnail(input: {
  sourcePath: string;
  rootPath: string;
  relativePath: string;
  stat: { size: number; mtimeMs: number };
}) {
  const cacheDir = path.join(input.rootPath, VIDEO_THUMB_CACHE_DIR);
  const cacheKey = buildVideoThumbnailKey({
    relativePath: input.relativePath,
    stat: input.stat,
  });
  const cachePath = path.join(cacheDir, `${cacheKey}.webp`);
  const cacheStat = await fs.stat(cachePath).catch(() => null);
  if (cacheStat && cacheStat.mtimeMs >= input.stat.mtimeMs) {
    const cached = await fs.readFile(cachePath);
    return `data:image/webp;base64,${cached.toString("base64")}`;
  }
  await fs.mkdir(cacheDir, { recursive: true });
  const tempPath = path.join(cacheDir, `${cacheKey}.jpg`);
  // 逻辑：视频首帧截图用于缩略图，避免等待完整转码。
  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.sourcePath)
      .seekInput(0.5)
      .outputOptions(["-frames:v 1"])
      .output(tempPath)
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .run();
  });
  const buffer = await sharp(tempPath)
    // 逻辑：保持原视频比例缩放到目标框内，避免裁切成固定 16:9。
    .resize(VIDEO_THUMB_WIDTH, VIDEO_THUMB_HEIGHT, { fit: "inside" })
    .webp({ quality: 50 })
    .toBuffer();
  await fs.writeFile(cachePath, buffer);
  await fs.unlink(tempPath).catch(() => null);
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

/** Resolve a filesystem path for the scoped input. */
function resolveFsTarget(
  scope: { projectId?: string; rootUri?: string },
  target: string
): string {
  if (!target?.trim()) {
    return resolveFsRootPath(scope);
  }
  // rootUri 覆盖：无 projectId 时用 rootUri 指定的路径作为相对解析基目录。
  if (!scope.projectId && scope.rootUri) {
    // target 本身是 file:// URI 时直接解析，避免 path.resolve 将 URI 当作相对路径拼接。
    if (target.startsWith("file:")) {
      const targetPath = resolveFilePathFromUri(target);
      const rootPath = resolveFilePathFromUri(scope.rootUri);
      // 安全检查：解析后的路径必须在 rootPath 内或等于 rootPath。
      if (targetPath !== rootPath && !targetPath.startsWith(rootPath + path.sep)) {
        throw new Error("Path traversal is not allowed.");
      }
      return targetPath;
    }
    const rootPath = resolveFilePathFromUri(scope.rootUri);
    const normalized = target.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
    if (normalized.split("/").some((s) => s === "..")) {
      throw new Error("Path traversal is not allowed.");
    }
    return path.resolve(rootPath, normalized);
  }
  return resolveScopedPath({
    projectId: scope.projectId,
    target,
  });
}

/** Resolve root path for scoped file system operations. */
function resolveFsRootPath(scope: { projectId?: string; rootUri?: string }): string {
  // rootUri 覆盖：非项目场景（临时对话）使用调用方指定的根路径。
  if (!scope.projectId && scope.rootUri) {
    return resolveFilePathFromUri(scope.rootUri);
  }
  return resolveScopedRootPath(scope);
}

/** Resolve a simple mime type from file extension. */
function getMimeByExt(ext: string) {
  const key = ext.toLowerCase();
  switch (key) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    case "tiff":
    case "tif":
      return "image/tiff";
    case "heic":
      return "image/heic";
    default:
      return "application/octet-stream";
  }
}

/** Return true when the extension maps to an image mime type. */
function isImageExt(ext: string): boolean {
  return getMimeByExt(ext).startsWith("image/");
}

/** Return true when the folder name follows a board prefix (new or legacy). */
function isBoardFolderName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith(BOARD_FOLDER_PREFIX) || lower.startsWith(BOARD_FOLDER_PREFIX_LEGACY);
}

/** Resolve board folder display name. */
function getBoardDisplayName(name: string) {
  const lower = name.toLowerCase();
  if (lower.startsWith(BOARD_FOLDER_PREFIX_LEGACY)) {
    return name.slice(BOARD_FOLDER_PREFIX_LEGACY.length) || name;
  }
  return name.slice(BOARD_FOLDER_PREFIX.length) || name;
}

/** Resolve whether a search entry should be skipped. */
function shouldSkipSearchEntry(name: string, includeHidden: boolean) {
  if (!includeHidden && name.startsWith(".")) return true;
  if (!includeHidden && SEARCH_IGNORE_NAMES.has(name)) return true;
  return false;
}

/** Resolve whether a folder should be treated as empty. */
async function resolveFolderEmptyState(fullPath: string, includeHidden: boolean): Promise<boolean> {
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    if (entries.length === 0) return true;
    if (includeHidden) return false;
    // 中文注释：隐藏文件不计入空目录判断。
    return entries.every((entry) => entry.name.startsWith("."));
  } catch {
    return false;
  }
}

export const fsRouter = t.router({
  /** Read metadata for a file or directory. */
  stat: shieldedProcedure.input(fsUriSchema).query(async ({ input }) => {
    const resolvedScope = await resolveFsReadScopeAsync(input, input.uri);
    if (!resolvedScope) return null;
    const { rootPath, fullPath } = resolvedScope;
    try {
      const stat = await fs.stat(fullPath);
      return buildFileNode({
        name: path.basename(fullPath),
        fullPath,
        rootPath,
        stat,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }),

  /** List direct children of a directory. */
  list: shieldedProcedure.input(fsListSchema).query(async ({ input }) => {
    const resolvedScope = await resolveFsReadScopeAsync(input, input.uri);
    if (!resolvedScope) return { entries: [] };
    const { rootPath, fullPath } = resolvedScope;
    const dirExists = await fs.stat(fullPath).then(s => s.isDirectory(), () => false);
    if (!dirExists) return { entries: [] };
    let entries: Dirent[];
    try {
      entries = await fs.readdir(fullPath, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EPERM" || code === "EACCES") {
        return { entries: [] };
      }
      throw error;
    }
    const includeHidden = Boolean(input.includeHidden);
    const nodes = [];
    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      const entryPath = path.join(fullPath, entry.name);
      const stat = await fs.stat(entryPath);
      const isEmpty = stat.isDirectory()
        ? await resolveFolderEmptyState(entryPath, includeHidden)
        : undefined;
      nodes.push(
        buildFileNode({
          name: entry.name,
          fullPath: entryPath,
          rootPath,
          stat,
          isEmpty,
        })
      );
    }
    const sortField = input.sort?.field ?? "name";
    const sortOrder = input.sort?.order ?? "asc";
    const direction = sortOrder === "asc" ? 1 : -1;
    // 按规则排序：name 时文件夹优先；mtime 时直接全量排序。
    if (sortField === "name") {
      nodes.sort((a, b) => {
        const rank = (node: typeof a) => {
          if (node.kind !== "folder") return 2;
          return isBoardFolderName(node.name) ? 1 : 0;
        };
        const rankA = rank(a);
        const rankB = rank(b);
        if (rankA !== rankB) {
          // 普通文件夹优先，画布文件夹排在文件夹末尾。
          return rankA - rankB;
        }
        return a.name.localeCompare(b.name) * direction;
      });
    } else {
      nodes.sort((a, b) => {
        return (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * direction;
      });
    }
    return { entries: nodes };
  }),

  /** Build thumbnails for image entries. */
  thumbnails: shieldedProcedure.input(fsThumbnailSchema).query(async ({ input }) => {
    // 生成 40x40 的低质量缩略图，避免传输原图。
    const items = await Promise.all(
      input.uris.map(async (uri) => {
        try {
          const resolvedScope = await resolveFsReadScopeAsync(input, uri);
          if (!resolvedScope) return null;
          const { rootPath, fullPath } = resolvedScope;
          const ext = path.extname(fullPath).replace(/^\./, "");
          // 中文注释：视频缩略图走专用管线，避免 sharp 读取失败。
          if (isVideoExt(ext)) {
            const stat = await fs.stat(fullPath);
            const relativePath = toRelativePath(rootPath, fullPath);
            const dataUrl = await buildVideoThumbnail({
              sourcePath: fullPath,
              rootPath,
              relativePath,
              stat: { size: stat.size, mtimeMs: stat.mtimeMs },
            });
            return { uri: relativePath, dataUrl };
          }
          if (!isImageExt(ext)) return null;
          const buffer = await sharp(fullPath)
            .resize(40, 40, { fit: "cover" })
            .webp({ quality: 45 })
            .toBuffer();
          return {
            uri: toRelativePath(rootPath, fullPath),
            dataUrl: `data:image/webp;base64,${buffer.toString("base64")}`,
          };
        } catch {
          return null;
        }
      })
    );
    return { items: items.filter((item): item is { uri: string; dataUrl: string } => Boolean(item)) };
  }),

  /** Build thumbnails for image entries in a directory. */
  folderThumbnails: shieldedProcedure
    .input(fsFolderThumbnailSchema)
    .query(async ({ input }) => {
      const resolvedScope = await resolveFsReadScopeAsync(input, input.uri);
      if (!resolvedScope) return { items: [] };
      const { rootPath, fullPath } = resolvedScope;
      const includeHidden = Boolean(input.includeHidden);
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(fullPath, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return { items: [] };
        }
        throw err;
      }
      const imageFiles = entries.filter((entry) => {
        if (!entry.isFile()) return false;
        if (!includeHidden && entry.name.startsWith(".")) return false;
        const ext = path.extname(entry.name).replace(/^\./, "");
        // 只处理图片文件，减少无效 IO 与 sharp 解码开销。
        return isImageExt(ext);
      });
      const videoFiles = entries.filter((entry) => {
        if (!entry.isFile()) return false;
        if (!includeHidden && entry.name.startsWith(".")) return false;
        const ext = path.extname(entry.name).replace(/^\./, "");
        // 只处理常见视频文件，避免无效的 ffmpeg 负载。
        return isVideoExt(ext);
      });
      const boardFolders = entries.filter((entry) => {
        if (!entry.isDirectory()) return false;
        if (!includeHidden && entry.name.startsWith(".")) return false;
        return isBoardFolderName(entry.name);
      });
      const items = await Promise.all(
        imageFiles.map(async (entry) => {
          try {
            const entryPath = path.join(fullPath, entry.name);
            const buffer = await sharp(entryPath)
              .resize(40, 40, { fit: "cover" })
              .webp({ quality: 45 })
              .toBuffer();
            return {
              uri: toRelativePath(rootPath, entryPath),
              dataUrl: `data:image/webp;base64,${buffer.toString("base64")}`,
            };
          } catch {
            return null;
          }
        })
      );
      const boardItems = await Promise.all(
        boardFolders.map(async (entry) => {
          try {
            const entryPath = path.join(fullPath, entry.name);
            const thumbnailPath = path.join(entryPath, BOARD_THUMBNAIL_FILE_NAME);
            // 逻辑：优先使用 board 文件夹内的 index.png 作为缩略图来源。
            const buffer = await sharp(thumbnailPath)
              .resize(40, 40, { fit: "cover" })
              .webp({ quality: 45 })
              .toBuffer();
            return {
              uri: toRelativePath(rootPath, entryPath),
              dataUrl: `data:image/webp;base64,${buffer.toString("base64")}`,
            };
          } catch {
            return null;
          }
        })
      );
      const videoItems = await Promise.all(
        videoFiles.map(async (entry) => {
          try {
            const entryPath = path.join(fullPath, entry.name);
            const stat = await fs.stat(entryPath);
            const relativePath = toRelativePath(rootPath, entryPath);
            const dataUrl = await buildVideoThumbnail({
              sourcePath: entryPath,
              rootPath,
              relativePath,
              stat: { size: stat.size, mtimeMs: stat.mtimeMs },
            });
            return {
              uri: relativePath,
              dataUrl,
            };
          } catch {
            return null;
          }
        })
      );
      const mergedItems = [...items, ...boardItems].filter(
        (item): item is { uri: string; dataUrl: string } => Boolean(item)
      );
      const videoMerged = [...mergedItems, ...videoItems].filter(
        (item): item is { uri: string; dataUrl: string } => Boolean(item)
      );
      return { items: videoMerged };
    }),

  /** Probe video dimensions and duration for a file entry. */
  videoMetadata: shieldedProcedure.input(fsVideoMetaSchema).query(async ({ input }) => {
    const resolvedScope = await resolveFsReadScopeAsync(input, input.uri);
    if (!resolvedScope) {
      return {
        width: null,
        height: null,
        duration: null,
      };
    }
    const { fullPath } = resolvedScope;
    const meta = await probeVideoDimensions(fullPath);
    return {
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      duration: meta?.duration ?? null,
    };
  }),

  /** Read a text file. */
  readFile: shieldedProcedure.input(fsUriSchema).query(async ({ input }) => {
    const resolvedScope = await resolveFsReadScopeAsync(input, input.uri);
    if (!resolvedScope) return { content: "" };
    const { fullPath } = resolvedScope;
    try {
      const stat = await fs.stat(fullPath);
      // 逻辑：大文件不走文本预览，避免阻塞页面与传输超大 payload。
      if (stat.size > READ_FILE_MAX_BYTES) {
        return { content: "", tooLarge: true };
      }
      const content = await fs.readFile(fullPath, "utf-8");
      return { content };
    } catch (error) {
      // 中文注释：文件不存在时返回空内容，避免首次读取落盘失败。
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { content: "" };
      }
      throw error;
    }
  }),

  /** Read a binary file (base64 payload). */
  readBinary: shieldedProcedure.input(fsUriSchema).query(async ({ input }) => {
    const resolvedScope = await resolveFsReadScopeAsync(input, input.uri);
    if (!resolvedScope) {
      return { contentBase64: "", mime: "application/octet-stream" };
    }
    const { fullPath } = resolvedScope;
    const ext = path.extname(fullPath).replace(/^\./, "");
    try {
      const buffer = await fs.readFile(fullPath);
      // 中文注释：二进制文件转 base64 供前端 dataUrl 预览。
      return { contentBase64: buffer.toString("base64"), mime: getMimeByExt(ext) };
    } catch (error) {
      // 中文注释：文件不存在时返回空内容，便于前端自行初始化。
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.warn(`[fs.readBinary] file not found: ${fullPath} (uri: ${input.uri})`);
        return { contentBase64: "", mime: getMimeByExt(ext) };
      }
      throw error;
    }
  }),

  /** Convert a DOCX file into SFDT for Syncfusion-based document editing. */
  convertDocxToSfdt: shieldedProcedure
    .input(fsUriSchema)
    .mutation(async ({ input }) => {
      const resolvedScope = await resolveFsReadScopeAsync(input, input.uri);
      if (!resolvedScope) {
        return {
          ok: false as const,
          reason: "未找到目标 DOCX 文件。",
          code: "file_not_found" as const,
        };
      }

      return await convertDocxFileToSfdt({
        inputPath: resolvedScope.fullPath,
        log: (message) => {
          console.warn(message);
        },
      });
    }),

  /** Write a text file. */
  writeFile: shieldedProcedure
    .input(
      fsScopeSchema.extend({
        uri: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = await resolveFsTargetAsync(input, input.uri);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, input.content, "utf-8");
      return { ok: true };
    }),

  /** Create a directory. */
  mkdir: shieldedProcedure
    .input(
      fsScopeSchema.extend({
        uri: z.string(),
        recursive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = await resolveFsTargetAsync(input, input.uri);
      await fs.mkdir(fullPath, { recursive: input.recursive ?? true });
      return { ok: true };
    }),

  /** Rename or move a file/folder. */
  rename: shieldedProcedure
    .input(
      fsScopeSchema.extend({
        from: z.string(),
        to: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fromPath = await resolveFsTargetAsync(input, input.from);
      const toPath = await resolveFsTargetAsync(input, input.to);
      await fs.mkdir(path.dirname(toPath), { recursive: true });
      await fs.rename(fromPath, toPath);
      return { ok: true };
    }),

  /** Copy a file/folder. */
  copy: shieldedProcedure.input(fsCopySchema).mutation(async ({ input }) => {
    const fromPath = await resolveFsTargetAsync(input, input.from);
    const toPath = await resolveFsTargetAsync(input, input.to);
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.cp(fromPath, toPath, { recursive: true });
    return { ok: true };
  }),

  /** Delete a file/folder. */
  delete: shieldedProcedure
    .input(
      fsScopeSchema.extend({
        uri: z.string(),
        recursive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = await resolveFsTargetAsync(input, input.uri);
      await fs.rm(fullPath, { recursive: input.recursive ?? true, force: true });
      return { ok: true };
    }),

  /** Write a binary file (base64 payload). */
  writeBinary: shieldedProcedure
    .input(
      fsScopeSchema.extend({
        uri: z.string(),
        contentBase64: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = await resolveFsTargetAsync(input, input.uri);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const buffer = Buffer.from(input.contentBase64, "base64");
      await fs.writeFile(fullPath, buffer);
      return { ok: true };
    }),

  /** Copy a local file into the scoped project directory. */
  importLocalFile: shieldedProcedure
    .input(fsImportLocalSchema)
    .mutation(async ({ input }) => {
      const fullPath = await resolveFsTargetAsync(input, input.uri);
      let sourcePath = input.sourcePath.trim();
      if (!sourcePath) throw new Error("Invalid sourcePath");
      if (sourcePath.startsWith("file://")) {
        try {
          sourcePath = fileURLToPath(sourcePath);
        } catch {
          throw new Error("Invalid sourcePath");
        }
      }
      if (!path.isAbsolute(sourcePath)) {
        throw new Error("Invalid sourcePath");
      }
      const sourceStat = await fs.stat(sourcePath);
      if (!sourceStat.isFile()) {
        throw new Error("Source is not a file");
      }
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.copyFile(sourcePath, fullPath);
      return { ok: true };
    }),

  /** Append a binary payload to an existing file. */
  appendBinary: shieldedProcedure
    .input(
      fsScopeSchema.extend({
        uri: z.string(),
        contentBase64: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = await resolveFsTargetAsync(input, input.uri);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const buffer = Buffer.from(input.contentBase64, "base64");
      await fs.appendFile(fullPath, buffer);
      return { ok: true };
    }),

  /** Search within the resolved root path (MVP stub). */
  search: shieldedProcedure.input(fsSearchSchema).query(async ({ input }) => {
    const resolvedScope = await resolveFsReadScopeAsync(input, input.rootUri);
    if (!resolvedScope) return { results: [] };
    const { rootPath: rootBasePath, fullPath: searchRootPath } = resolvedScope;
    const query = input.query.trim().toLowerCase();
    if (!query) return { results: [] };
    const includeHidden = Boolean(input.includeHidden);
    const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
    const maxDepth = input.maxDepth ?? DEFAULT_SEARCH_MAX_DEPTH;
    let rootStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
      rootStat = await fs.stat(searchRootPath);
    } catch {
      return { results: [] };
    }
    if (!rootStat.isDirectory()) return { results: [] };
    const results: Array<ReturnType<typeof buildFileNode>> = [];
    const visit = async (dirPath: string, depth: number) => {
      if (results.length >= limit) return;
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= limit) return;
        if (entry.isSymbolicLink()) continue;
        if (shouldSkipSearchEntry(entry.name, includeHidden)) continue;
        const entryPath = path.join(dirPath, entry.name);
        let stat: Awaited<ReturnType<typeof fs.stat>>;
        try {
          stat = await fs.stat(entryPath);
        } catch {
          continue;
        }
        const displayName =
          entry.isDirectory() && isBoardFolderName(entry.name)
            ? getBoardDisplayName(entry.name)
            : entry.name;
        if (displayName.toLowerCase().includes(query)) {
          const isEmpty = stat.isDirectory()
            ? await resolveFolderEmptyState(entryPath, includeHidden)
            : undefined;
          results.push(
            buildFileNode({
              name: entry.name,
              fullPath: entryPath,
              rootPath: rootBasePath,
              stat,
              isEmpty,
            })
          );
        }
        if (entry.isDirectory() && depth < maxDepth) {
          await visit(entryPath, depth + 1);
        }
      }
    };
    // 中文注释：递归搜索目录，命中数量达到上限时直接停止。
    await visit(searchRootPath, 0);
    return { results };
  }),

  /** Search across all registered projects. */
  searchAllProjects: shieldedProcedure
    .input(fsSearchAllProjectsSchema)
    .query(async ({ input, ctx }) => {
      const query = input.query.trim().toLowerCase();
      if (!query) return { results: [] };
      const includeHidden = Boolean(input.includeHidden);
      const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
      const maxDepth = input.maxDepth ?? DEFAULT_SEARCH_MAX_DEPTH;
      const projects = await readProjectTrees();
      const results: Array<{
        projectId: string;
        projectTitle: string;
        entry: ReturnType<typeof buildFileNode>;
        relativePath: string;
      }> = [];

      const visitProject = async (
        projectId: string,
        projectTitle: string,
        rootPath: string,
        dirPath: string,
        depth: number,
      ) => {
        if (results.length >= limit) return;
        let entries: Dirent[];
        try {
          entries = await fs.readdir(dirPath, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (results.length >= limit) return;
          if (entry.isSymbolicLink()) continue;
          if (shouldSkipSearchEntry(entry.name, includeHidden)) continue;
          const entryPath = path.join(dirPath, entry.name);
          let stat: Awaited<ReturnType<typeof fs.stat>>;
          try {
            stat = await fs.stat(entryPath);
          } catch {
            continue;
          }
          const displayName =
            entry.isDirectory() && isBoardFolderName(entry.name)
              ? getBoardDisplayName(entry.name)
              : entry.name;
          if (displayName.toLowerCase().includes(query)) {
            const isEmpty = stat.isDirectory()
              ? await resolveFolderEmptyState(entryPath, includeHidden)
              : undefined;
            const node = buildFileNode({
              name: entry.name,
              fullPath: entryPath,
              rootPath,
              stat,
              isEmpty,
            });
            results.push({
              projectId,
              projectTitle,
              entry: node,
              relativePath: node.uri,
            });
          }
          if (entry.isDirectory() && depth < maxDepth) {
            await visitProject(projectId, projectTitle, rootPath, entryPath, depth + 1);
          }
        }
      };

      for (const project of projects) {
        if (results.length >= limit) break;
        const rootUri = project.rootUri?.trim();
        if (!rootUri) continue;
        let rootPath: string;
        try {
          rootPath = resolveFilePathFromUri(rootUri);
        } catch {
          continue;
        }
        const projectTitle = project.title?.trim() ||
          (ctx.lang === 'en-US' ? 'Untitled Project' : ctx.lang === 'zh-TW' ? '未命名專案' : '未命名项目');
        await visitProject(project.projectId, projectTitle, rootPath, rootPath, 0);
      }

      return { results };
    }),
});

export type FsRouter = typeof fsRouter;
