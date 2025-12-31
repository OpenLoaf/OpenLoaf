import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs, type Dirent } from "node:fs";
import sharp from "sharp";
import { getWorkspaceRootPath } from "@teatime-ai/api/services/vfsService";

const CHAT_IMAGE_MAX_EDGE = 1024;
const CHAT_IMAGE_QUALITY = 80;
const PROJECT_META_DIR = ".teatime";
const PROJECT_ID_EXT = ".ttid";

const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const SKIP_DIRS = new Set([
  ".git",
  ".teatime",
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
]);

type ImageFormat = {
  ext: string;
  mediaType: string;
};

type ImageOutput = ImageFormat & {
  buffer: Buffer;
};

function isSupportedImageMime(mime: string): boolean {
  return SUPPORTED_IMAGE_MIME.has(mime);
}

function resolveImageFormat(mime: string, fileName: string): ImageFormat | null {
  const lowerName = fileName.toLowerCase();
  if (mime === "image/png" || lowerName.endsWith(".png")) {
    return { ext: "png", mediaType: "image/png" };
  }
  if (mime === "image/webp" || lowerName.endsWith(".webp")) {
    return { ext: "webp", mediaType: "image/webp" };
  }
  if (mime === "image/jpeg" || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return { ext: "jpg", mediaType: "image/jpeg" };
  }
  return null;
}

function normalizeRelativePath(input: string): string {
  return input.replace(/^\/+/, "");
}

function buildTeatimeFileUrl(projectId: string, relativePath: string): string {
  return `teatime-file://${projectId}/${normalizeRelativePath(relativePath)}`;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveProjectRootPath(projectId: string): Promise<string | null> {
  const workspaceRootPath = getWorkspaceRootPath();
  const queue: string[] = [workspaceRootPath];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    // 中文注释：通过 .teatime/{projectId}.ttid 定位项目根目录。
    const markerPath = path.join(current, PROJECT_META_DIR, `${projectId}${PROJECT_ID_EXT}`);
    if (await pathExists(markerPath)) return current;

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      queue.push(path.join(current, entry.name));
    }
  }

  return null;
}

export async function resolveTeatimeFilePath(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "teatime-file:") return null;
  const projectId = parsed.hostname.trim();
  if (!projectId) return null;
  const relativePath = normalizeRelativePath(decodeURIComponent(parsed.pathname));
  if (!relativePath) return null;
  const projectRootPath = await resolveProjectRootPath(projectId);
  if (!projectRootPath) return null;

  const targetPath = path.resolve(projectRootPath, relativePath);
  const rootPath = path.resolve(projectRootPath);
  if (targetPath === rootPath) return null;
  if (!targetPath.startsWith(rootPath + path.sep)) return null;
  return targetPath;
}

async function compressImageBuffer(input: Buffer, format: ImageFormat): Promise<ImageOutput> {
  // 中文注释：统一限制最大边长与质量，避免超大图片传给模型。
  const transformer = sharp(input).resize({
    width: CHAT_IMAGE_MAX_EDGE,
    height: CHAT_IMAGE_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  let buffer: Buffer;
  if (format.ext === "png") {
    buffer = await transformer.png({ compressionLevel: 9 }).toBuffer();
  } else if (format.ext === "webp") {
    buffer = await transformer.webp({ quality: CHAT_IMAGE_QUALITY }).toBuffer();
  } else {
    buffer = await transformer.jpeg({ quality: CHAT_IMAGE_QUALITY, mozjpeg: true }).toBuffer();
  }

  return { buffer, ext: format.ext, mediaType: format.mediaType };
}

export async function saveChatImageAttachment(input: {
  projectId: string;
  sessionId: string;
  fileName: string;
  mediaType: string;
  buffer: Buffer;
}): Promise<{ url: string; mediaType: string }> {
  const format = resolveImageFormat(input.mediaType, input.fileName);
  if (!format || !isSupportedImageMime(format.mediaType)) {
    throw new Error("Unsupported image type");
  }

  // 中文注释：只保存压缩后的图片，不保留原图。
  const compressed = await compressImageBuffer(input.buffer, format);
  const hash = createHash("sha256").update(compressed.buffer).digest("hex");
  const fileName = `${hash}.${compressed.ext}`;
  const relativePath = path.posix.join(".teatime", "chat", input.sessionId, fileName);
  const projectRootPath = await resolveProjectRootPath(input.projectId);
  if (!projectRootPath) {
    throw new Error("Project not found");
  }

  const targetPath = path.join(projectRootPath, ".teatime", "chat", input.sessionId, fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, compressed.buffer);

  return {
    url: buildTeatimeFileUrl(input.projectId, relativePath),
    mediaType: compressed.mediaType,
  };
}

export async function buildFilePartFromTeatimeUrl(input: {
  url: string;
  mediaType?: string;
}): Promise<{ type: "file"; url: string; mediaType: string } | null> {
  const filePath = await resolveTeatimeFilePath(input.url);
  if (!filePath) return null;
  const buffer = await fs.readFile(filePath);
  const fallbackType = input.mediaType || "application/octet-stream";
  const format = resolveImageFormat(fallbackType, filePath);
  if (!format || !isSupportedImageMime(format.mediaType)) return null;

  const compressed = await compressImageBuffer(buffer, format);
  const base64 = compressed.buffer.toString("base64");
  return {
    type: "file",
    url: `data:${compressed.mediaType};base64,${base64}`,
    mediaType: compressed.mediaType,
  };
}
