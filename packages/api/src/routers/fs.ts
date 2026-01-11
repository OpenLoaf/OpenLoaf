import { z } from "zod";
import path from "node:path";
import { promises as fs, type Dirent } from "node:fs";
import sharp from "sharp";
import { t, shieldedProcedure } from "../index";
import { resolveWorkspacePathFromUri, toFileUri } from "../services/vfsService";

/** Board folder prefix for server-side sorting. */
const BOARD_FOLDER_PREFIX = "tnboard_";
/** Directory names ignored by search when hidden entries are excluded. */
const SEARCH_IGNORE_NAMES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  ".tenas-trash",
  "dist",
  "build",
  "out",
]);
/** Default maximum number of search results to return. */
const DEFAULT_SEARCH_LIMIT = 500;
/** Default maximum depth for recursive search. */
const DEFAULT_SEARCH_MAX_DEPTH = 12;

const fsUriSchema = z.object({
  uri: z.string(),
});

const fsListSchema = z.object({
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
const fsSearchSchema = z.object({
  rootUri: z.string(),
  query: z.string(),
  includeHidden: z.boolean().optional(),
  limit: z.number().int().min(1).max(2000).optional(),
  maxDepth: z.number().int().min(0).max(50).optional(),
});

const fsCopySchema = z.object({
  from: z.string(),
  to: z.string(),
});

/** Schema for batch thumbnail requests. */
const fsThumbnailSchema = z.object({
  uris: z.array(z.string()).max(50),
});

/** Schema for folder thumbnail requests. */
const fsFolderThumbnailSchema = z.object({
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

function buildFileNode(input: {
  name: string;
  fullPath: string;
  stat: Awaited<ReturnType<typeof fs.stat>>;
  isEmpty?: boolean;
}): FsFileNode {
  const ext = path.extname(input.name).replace(/^\./, "");
  const isDir = input.stat.isDirectory();
  // 创建时间优先使用 birthtime，避免受元数据变更影响。
  const createdAt = Number.isNaN(input.stat.birthtime.getTime())
    ? input.stat.ctime.toISOString()
    : input.stat.birthtime.toISOString();
  return {
    uri: toFileUri(input.fullPath),
    name: input.name,
    kind: isDir ? "folder" : "file",
    ext: ext || undefined,
    size: isDir ? undefined : Number(input.stat.size),
    createdAt,
    updatedAt: input.stat.mtime.toISOString(),
    isEmpty: isDir ? input.isEmpty : undefined,
  };
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

/** Return true when the folder name follows the board prefix. */
function isBoardFolderName(name: string): boolean {
  return name.toLowerCase().startsWith(BOARD_FOLDER_PREFIX);
}

/** Resolve board folder display name. */
function getBoardDisplayName(name: string) {
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
    const fullPath = resolveWorkspacePathFromUri(input.uri);
    const stat = await fs.stat(fullPath);
    return buildFileNode({ name: path.basename(fullPath), fullPath, stat });
  }),

  /** List direct children of a directory. */
  list: shieldedProcedure.input(fsListSchema).query(async ({ input }) => {
    const fullPath = resolveWorkspacePathFromUri(input.uri);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
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
          const fullPath = resolveWorkspacePathFromUri(uri);
          const buffer = await sharp(fullPath)
            .resize(40, 40, { fit: "cover" })
            .webp({ quality: 45 })
            .toBuffer();
          return { uri, dataUrl: `data:image/webp;base64,${buffer.toString("base64")}` };
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
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      const includeHidden = Boolean(input.includeHidden);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const imageFiles = entries.filter((entry) => {
        if (!entry.isFile()) return false;
        if (!includeHidden && entry.name.startsWith(".")) return false;
        const ext = path.extname(entry.name).replace(/^\./, "");
        // 只处理图片文件，减少无效 IO 与 sharp 解码开销。
        return isImageExt(ext);
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
              uri: toFileUri(entryPath),
              dataUrl: `data:image/webp;base64,${buffer.toString("base64")}`,
            };
          } catch {
            return null;
          }
        })
      );
      return { items: items.filter((item): item is { uri: string; dataUrl: string } => Boolean(item)) };
    }),

  /** Read a text file. */
  readFile: shieldedProcedure.input(fsUriSchema).query(async ({ input }) => {
    const fullPath = resolveWorkspacePathFromUri(input.uri);
    const content = await fs.readFile(fullPath, "utf-8");
    return { content };
  }),

  /** Read a binary file (base64 payload). */
  readBinary: shieldedProcedure.input(fsUriSchema).query(async ({ input }) => {
    const fullPath = resolveWorkspacePathFromUri(input.uri);
    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).replace(/^\./, "");
    // 中文注释：二进制文件转 base64 供前端 dataUrl 预览。
    return { contentBase64: buffer.toString("base64"), mime: getMimeByExt(ext) };
  }),

  /** Write a text file. */
  writeFile: shieldedProcedure
    .input(
      z.object({
        uri: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, input.content, "utf-8");
      return { ok: true };
    }),

  /** Create a directory. */
  mkdir: shieldedProcedure
    .input(
      z.object({
        uri: z.string(),
        recursive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      await fs.mkdir(fullPath, { recursive: input.recursive ?? true });
      return { ok: true };
    }),

  /** Rename or move a file/folder. */
  rename: shieldedProcedure
    .input(
      z.object({
        from: z.string(),
        to: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fromPath = resolveWorkspacePathFromUri(input.from);
      const toPath = resolveWorkspacePathFromUri(input.to);
      await fs.mkdir(path.dirname(toPath), { recursive: true });
      await fs.rename(fromPath, toPath);
      return { ok: true };
    }),

  /** Copy a file/folder. */
  copy: shieldedProcedure.input(fsCopySchema).mutation(async ({ input }) => {
    const fromPath = resolveWorkspacePathFromUri(input.from);
    const toPath = resolveWorkspacePathFromUri(input.to);
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.cp(fromPath, toPath, { recursive: true });
    return { ok: true };
  }),

  /** Delete a file/folder. */
  delete: shieldedProcedure
    .input(
      z.object({
        uri: z.string(),
        recursive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      await fs.rm(fullPath, { recursive: input.recursive ?? true, force: true });
      return { ok: true };
    }),

  /** Write a binary file (base64 payload). */
  writeBinary: shieldedProcedure
    .input(
      z.object({
        uri: z.string(),
        contentBase64: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const buffer = Buffer.from(input.contentBase64, "base64");
      await fs.writeFile(fullPath, buffer);
      return { ok: true };
    }),

  /** Search within workspace root (MVP stub). */
  search: shieldedProcedure.input(fsSearchSchema).query(async ({ input }) => {
    const rootPath = resolveWorkspacePathFromUri(input.rootUri);
    const query = input.query.trim().toLowerCase();
    if (!query) return { results: [] };
    const includeHidden = Boolean(input.includeHidden);
    const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
    const maxDepth = input.maxDepth ?? DEFAULT_SEARCH_MAX_DEPTH;
    let rootStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
      rootStat = await fs.stat(rootPath);
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
    await visit(rootPath, 0);
    return { results };
  }),
});

export type FsRouter = typeof fsRouter;
