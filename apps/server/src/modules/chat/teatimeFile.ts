import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import {
  getProjectRootPath,
  getWorkspaceRootPathById,
} from "@teatime-ai/api/services/vfsService";

const CHAT_IMAGE_MAX_EDGE = 1024;
const CHAT_IMAGE_QUALITY = 80;
const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

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

function buildTeatimeFileUrl(ownerId: string, relativePath: string): string {
  return `teatime-file://${ownerId}/${normalizeRelativePath(relativePath)}`;
}

async function resolveProjectRootPath(projectId: string): Promise<string | null> {
  return getProjectRootPath(projectId);
}

/** Resolve workspace root path by workspace id. */
function resolveWorkspaceRootPath(workspaceId: string): string | null {
  return getWorkspaceRootPathById(workspaceId);
}

/** Resolve the root path for chat attachments and return the owner id. */
async function resolveChatAttachmentRoot(input: {
  projectId?: string;
  workspaceId?: string;
}): Promise<{ rootPath: string; ownerId: string } | null> {
  const projectId = input.projectId?.trim();
  if (projectId) {
    const projectRootPath = await resolveProjectRootPath(projectId);
    if (projectRootPath) return { rootPath: projectRootPath, ownerId: projectId };
  }
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return null;
  const workspaceRootPath = resolveWorkspaceRootPath(workspaceId);
  if (!workspaceRootPath) return null;
  return { rootPath: workspaceRootPath, ownerId: workspaceId };
}

export async function resolveTeatimeFilePath(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "teatime-file:") return null;
  const ownerId = parsed.hostname.trim();
  if (!ownerId) return null;
  const relativePath = normalizeRelativePath(decodeURIComponent(parsed.pathname));
  if (!relativePath) return null;
  const projectRootPath = await resolveProjectRootPath(ownerId);
  const workspaceRootPath = projectRootPath ? null : resolveWorkspaceRootPath(ownerId);
  const rootPath = projectRootPath ?? workspaceRootPath;
  if (!rootPath) return null;

  const targetPath = path.resolve(rootPath, relativePath);
  const rootPathResolved = path.resolve(rootPath);
  if (targetPath === rootPathResolved) return null;
  if (!targetPath.startsWith(rootPathResolved + path.sep)) return null;
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
  workspaceId: string;
  projectId?: string;
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
  const root = await resolveChatAttachmentRoot({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!root) {
    throw new Error("Workspace or project not found");
  }

  const targetPath = path.join(root.rootPath, ".teatime", "chat", input.sessionId, fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, compressed.buffer);

  return {
    url: buildTeatimeFileUrl(root.ownerId, relativePath),
    mediaType: compressed.mediaType,
  };
}

async function loadTeatimeImageBuffer(input: {
  url: string;
  mediaType?: string;
}): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const filePath = await resolveTeatimeFilePath(input.url);
  if (!filePath) return null;
  const buffer = await fs.readFile(filePath);
  const fallbackType = input.mediaType || "application/octet-stream";
  const format = resolveImageFormat(fallbackType, filePath);
  if (!format || !isSupportedImageMime(format.mediaType)) return null;

  const compressed = await compressImageBuffer(buffer, format);
  return {
    buffer: compressed.buffer,
    mediaType: compressed.mediaType,
  };
}

export async function buildFilePartFromTeatimeUrl(input: {
  url: string;
  mediaType?: string;
}): Promise<{ type: "file"; url: string; mediaType: string } | null> {
  const payload = await loadTeatimeImageBuffer(input);
  if (!payload) return null;
  const base64 = payload.buffer.toString("base64");
  return {
    type: "file",
    url: `data:${payload.mediaType};base64,${base64}`,
    mediaType: payload.mediaType,
  };
}

/** Resolve preview content for supported teatime-file attachments. */
export async function getTeatimeFilePreview(input: {
  url: string;
}): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const filePath = await resolveTeatimeFilePath(input.url);
  if (!filePath) return null;
  const lowerPath = filePath.toLowerCase();
  // 中文注释：PDF 直接返回原文件内容，图片继续压缩预览。
  if (lowerPath.endsWith(".pdf")) {
    const buffer = await fs.readFile(filePath);
    return { buffer, mediaType: "application/pdf" };
  }
  const format = resolveImageFormat("application/octet-stream", filePath);
  if (!format || !isSupportedImageMime(format.mediaType)) return null;
  const buffer = await fs.readFile(filePath);
  const compressed = await compressImageBuffer(buffer, format);
  return { buffer: compressed.buffer, mediaType: compressed.mediaType };
}
