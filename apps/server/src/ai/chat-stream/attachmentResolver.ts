import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { UIMessage } from "ai";
import { getProjectRootPath, getWorkspaceRootPathById } from "@tenas-ai/api/services/vfsService";

/** Max image edge length for chat. */
const CHAT_IMAGE_MAX_EDGE = 1024;
/** Image output quality for chat. */
const CHAT_IMAGE_QUALITY = 80;
/** Supported image types. */
const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Image format definition. */
type ImageFormat = {
  /** File extension. */
  ext: string;
  /** Media type. */
  mediaType: string;
};

/** Image output definition. */
type ImageOutput = ImageFormat & {
  /** Output buffer. */
  buffer: Buffer;
};

/** Resolve stored file name for chat attachment. */
function resolveChatAttachmentFileName(input: {
  fileName: string;
  hash: string;
  ext: string;
}): string {
  const parsed = path.parse(input.fileName);
  const baseName = parsed.name || "upload";
  const isMask = /_(mask|alpha|grey)$/i.test(baseName);
  // 遮罩图保留原始命名，便于区分来源。
  if (isMask) return `${baseName}.${input.ext}`;
  return `${input.hash}.${input.ext}`;
}

/** Check whether mime is supported. */
function isSupportedImageMime(mime: string): boolean {
  return SUPPORTED_IMAGE_MIME.has(mime);
}

/** Resolve image format from mime and filename. */
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

/** Normalize relative path for storage. */
function normalizeRelativePath(input: string): string {
  return input.replace(/^\/+/, "");
}

/** Build tenas-file url. */
function buildTenasFileUrl(ownerId: string, relativePath: string): string {
  return `tenas-file://${ownerId}/${normalizeRelativePath(relativePath)}`;
}

/** Resolve root path for chat attachments. */
async function resolveChatAttachmentRoot(input: {
  /** Project id. */
  projectId?: string;
  /** Workspace id. */
  workspaceId?: string;
}): Promise<{ rootPath: string; ownerId: string } | null> {
  const projectId = input.projectId?.trim();
  if (projectId) {
    const projectRootPath = await getProjectRootPath(projectId);
    if (projectRootPath) return { rootPath: projectRootPath, ownerId: projectId };
  }
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return null;
  const workspaceRootPath = getWorkspaceRootPathById(workspaceId);
  if (!workspaceRootPath) return null;
  return { rootPath: workspaceRootPath, ownerId: workspaceId };
}

/** Resolve local file path from tenas-file url. */
async function resolveTenasFilePath(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "tenas-file:") return null;
  const ownerId = parsed.hostname.trim();
  if (!ownerId) return null;
  const relativePath = normalizeRelativePath(decodeURIComponent(parsed.pathname));
  if (!relativePath) return null;
  const projectRootPath = await getProjectRootPath(ownerId);
  const workspaceRootPath = projectRootPath ? null : getWorkspaceRootPathById(ownerId);
  const rootPath = projectRootPath ?? workspaceRootPath;
  if (!rootPath) return null;

  const targetPath = path.resolve(rootPath, relativePath);
  const rootPathResolved = path.resolve(rootPath);
  if (targetPath === rootPathResolved) return null;
  if (!targetPath.startsWith(rootPathResolved + path.sep)) return null;
  return targetPath;
}

/** Compress image buffer to chat constraints. */
async function compressImageBuffer(input: Buffer, format: ImageFormat): Promise<ImageOutput> {
  // 统一限制最大边长与质量，避免超大图片传给模型。
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

/** Save chat image attachment and return url. */
export async function saveChatImageAttachment(input: {
  /** Workspace id. */
  workspaceId: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
  /** File name. */
  fileName: string;
  /** Media type. */
  mediaType: string;
  /** File buffer. */
  buffer: Buffer;
}): Promise<{ url: string; mediaType: string }> {
  const format = resolveImageFormat(input.mediaType, input.fileName);
  if (!format || !isSupportedImageMime(format.mediaType)) {
    throw new Error("Unsupported image type");
  }

  // 上传阶段即压缩并落盘，避免保存原图。
  const compressed = await compressImageBuffer(input.buffer, format);
  const hash = createHash("sha256").update(compressed.buffer).digest("hex");
  const fileName = resolveChatAttachmentFileName({
    fileName: input.fileName,
    hash,
    ext: compressed.ext,
  });
  const relativePath = path.posix.join(".tenas", "chat", input.sessionId, fileName);
  const root = await resolveChatAttachmentRoot({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!root) {
    throw new Error("Workspace or project not found");
  }

  const targetPath = path.join(root.rootPath, ".tenas", "chat", input.sessionId, fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, compressed.buffer);

  return {
    url: buildTenasFileUrl(root.ownerId, relativePath),
    mediaType: compressed.mediaType,
  };
}

/** Save chat image attachment from a tenas-file url. */
export async function saveChatImageAttachmentFromTenasUrl(input: {
  /** Workspace id. */
  workspaceId: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
  /** Source tenas-file url. */
  url: string;
}): Promise<{ url: string; mediaType: string }> {
  const filePath = await resolveTenasFilePath(input.url);
  if (!filePath) {
    throw new Error("Invalid tenas-file url");
  }
  const buffer = await fs.readFile(filePath);
  const format = resolveImageFormat("application/octet-stream", filePath);
  if (!format || !isSupportedImageMime(format.mediaType)) {
    throw new Error("Unsupported image type");
  }
  // 中文注释：tenas-file 仍需压缩转码，统一 chat 侧尺寸与质量。
  const compressed = await compressImageBuffer(buffer, format);
  const hash = createHash("sha256").update(compressed.buffer).digest("hex");
  const fileName = resolveChatAttachmentFileName({
    fileName: path.basename(filePath),
    hash,
    ext: compressed.ext,
  });
  const relativePath = path.posix.join(".tenas", "chat", input.sessionId, fileName);
  const root = await resolveChatAttachmentRoot({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!root) {
    throw new Error("Workspace or project not found");
  }
  const targetPath = path.join(root.rootPath, ".tenas", "chat", input.sessionId, fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, compressed.buffer);

  return {
    url: buildTenasFileUrl(root.ownerId, relativePath),
    mediaType: compressed.mediaType,
  };
}

/** Build UI file part from tenas-file url. */
export async function buildFilePartFromTenasUrl(input: {
  /** File url. */
  url: string;
  /** Media type override. */
  mediaType?: string;
}): Promise<{ type: "file"; url: string; mediaType: string } | null> {
  const payload = await loadTenasImageBuffer(input);
  if (!payload) return null;
  const base64 = payload.buffer.toString("base64");
  return {
    type: "file",
    url: `data:${payload.mediaType};base64,${base64}`,
    mediaType: payload.mediaType,
  };
}

/** Resolve preview content for supported attachments. */
export async function getTenasFilePreview(input: {
  /** File url. */
  url: string;
}): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const filePath = await resolveTenasFilePath(input.url);
  if (!filePath) return null;
  const lowerPath = filePath.toLowerCase();
  // PDF 直接返回原文件内容，图片继续压缩预览。
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

/** Load image buffer from tenas-file url. */
export async function loadTenasImageBuffer(input: {
  /** File url. */
  url: string;
  /** Media type override. */
  mediaType?: string;
}): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const filePath = await resolveTenasFilePath(input.url);
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

/** Replace tenas-file parts with data urls. */
export async function replaceTenasFileParts(messages: UIMessage[]): Promise<UIMessage[]> {
  const next: UIMessage[] = [];
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    const replaced: any[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        replaced.push(part);
        continue;
      }
      if ((part as any).type !== "file") {
        replaced.push(part);
        continue;
      }
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url || !url.startsWith("tenas-file://")) {
        replaced.push(part);
        continue;
      }
      const mediaType =
        typeof (part as any).mediaType === "string" ? (part as any).mediaType : undefined;
      try {
        const filePart = await buildFilePartFromTenasUrl({ url, mediaType });
        if (filePart) replaced.push(filePart);
      } catch {
        // 读取或压缩失败时直接跳过该图片，避免阻断对话。
      }
    }
    next.push({ ...message, parts: replaced } as UIMessage);
  }
  return next;
}
