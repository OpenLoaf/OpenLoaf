import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { GeneratedFile } from "ai";
import {
  getProjectRootPath,
  getWorkspaceRootPathById,
  resolveFilePathFromUri,
} from "@tenas-ai/api/services/vfsService";
import { readBasicConf, readS3Providers } from "@/modules/settings/tenasConfStore";
import { createS3StorageService, resolveS3ProviderConfig } from "@/modules/storage/s3StorageService";
import type { TenasImageMetadataV1 } from "@tenas-ai/api/types/image";
import {
  injectPngMetadata,
  resolveMetadataSidecarPath,
  saveChatImageAttachment,
  serializeImageMetadata,
} from "./attachmentResolver";

/** Resolve active S3 storage service. */
export function resolveActiveS3Storage() {
  const basic = readBasicConf();
  const activeId = basic.activeS3Id;
  if (!activeId) return null;
  const provider = readS3Providers().find((entry) => entry.id === activeId);
  if (!provider) return null;
  return createS3StorageService(resolveS3ProviderConfig(provider));
}

/** Normalize filename for S3 object keys. */
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Strip extension from a file name. */
function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[a-zA-Z0-9]+$/, "");
}

/** Resolve media type from data url. */
export function resolveMediaTypeFromDataUrl(value: string): string {
  const match = value.match(/^data:([^;]+);/);
  return match?.[1]?.toLowerCase() ?? "";
}

/** Resolve base name from url path. */
export function resolveBaseNameFromUrl(value: string, fallback: string): string {
  if (value.startsWith("data:")) return fallback;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    const baseName = stripFileExtension(path.basename(value));
    const sanitized = sanitizeFileName(baseName);
    return sanitized || fallback;
  }
  try {
    const parsed = new URL(value);
    const fileName = decodeURIComponent(parsed.pathname);
    const baseName = stripFileExtension(path.basename(fileName));
    const sanitized = sanitizeFileName(baseName);
    return sanitized || fallback;
  } catch {
    return fallback;
  }
}

/** Resolve extension from media type. */
export function resolveImageExtension(mediaType: string): string {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

/** Supported image extensions for directory inference. */
const IMAGE_SAVE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** Check whether extension is a known image extension. */
function isImageSaveExtension(ext: string): boolean {
  return IMAGE_SAVE_EXTENSIONS.has(ext.toLowerCase());
}

/** Normalize a target path into a directory. */
async function normalizeImageSaveDirectory(targetPath: string): Promise<string> {
  try {
    const stat = await fs.stat(targetPath);
    // 已存在文件时使用其所在目录，避免覆盖文件。
    if (stat.isFile()) return path.dirname(targetPath);
    return targetPath;
  } catch {
    const ext = path.extname(targetPath).toLowerCase();
    // 兼容传入文件路径时自动取目录。
    if (isImageSaveExtension(ext)) return path.dirname(targetPath);
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

/** Resolve local directory from image_save_dir input. */
export async function resolveImageSaveDirectory(input: {
  /** Raw image save directory uri. */
  imageSaveDir: string;
  /** Optional workspace id fallback. */
  workspaceId?: string | null;
  /** Optional project id fallback. */
  projectId?: string | null;
}): Promise<string | null> {
  const raw = input.imageSaveDir.trim();
  if (!raw) return null;

  if (raw.startsWith("file://")) {
    try {
      const filePath = resolveFilePathFromUri(raw);
      return normalizeImageSaveDirectory(filePath);
    } catch {
      return null;
    }
  }

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    const dirPath = resolveRelativeSaveDirectory({
      path: raw,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
    if (!dirPath) return null;
    return normalizeImageSaveDirectory(dirPath);
  }

  return null;
}

/** Save generated images into a local directory. */
export async function saveGeneratedImagesToDirectory(input: {
  /** Generated image files from provider. */
  images: GeneratedFile[];
  /** Target directory path. */
  directory: string;
  /** Optional image metadata. */
  metadata?: TenasImageMetadataV1;
}): Promise<string[]> {
  const savedPaths: string[] = [];
  await fs.mkdir(input.directory, { recursive: true });
  const baseTime = Date.now();
  for (const [index, image] of input.images.entries()) {
    const mediaType = image.mediaType || "image/png";
    const buffer = Buffer.from(image.uint8Array);
    const fileName = buildImageFileName(index, mediaType, baseTime);
    const filePath = path.join(input.directory, fileName);
    // 逻辑：metadata 写入 PNG iTXt，并落 sidecar JSON。
    const metadataPayload = input.metadata ? serializeImageMetadata(input.metadata) : null;
    const outputBuffer =
      mediaType === "image/png" && metadataPayload
        ? injectPngMetadata(buffer, metadataPayload.chunkJson)
        : buffer;
    await fs.writeFile(filePath, outputBuffer);
    if (metadataPayload) {
      const sidecarPath = resolveMetadataSidecarPath(filePath);
      await fs.writeFile(sidecarPath, metadataPayload.fullJson, "utf8");
    }
    savedPaths.push(filePath);
  }
  return savedPaths;
}

/** Save generated images and return persisted parts. */
export async function saveGeneratedImages(input: {
  /** Generated image files from provider. */
  images: GeneratedFile[];
  /** Workspace id for storage scoping. */
  workspaceId: string;
  /** Chat session id for storage scoping. */
  sessionId: string;
  /** Optional project id for storage scoping. */
  projectId?: string;
  /** Optional image metadata. */
  metadata?: TenasImageMetadataV1;
}): Promise<Array<{ type: "file"; url: string; mediaType: string }>> {
  const parts: Array<{ type: "file"; url: string; mediaType: string }> = [];
  const baseTime = Date.now();
  for (const [index, image] of input.images.entries()) {
    const mediaType = image.mediaType || "image/png";
    const buffer = Buffer.from(image.uint8Array);
    const fileName = buildImageFileName(index, mediaType, baseTime);
    const saved = await saveChatImageAttachment({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      fileName,
      mediaType,
      buffer,
      metadata: input.metadata,
    });
    parts.push({ type: "file", url: saved.url, mediaType: saved.mediaType });
  }
  return parts;
}

/** Build image file name. */
function buildImageFileName(index: number, mediaType: string, baseTime: number): string {
  const ext = resolveImageExtension(mediaType);
  const base = formatTimestampBaseName(new Date(baseTime));
  const suffix = index > 0 ? `_${String(index + 1).padStart(2, "0")}` : "";
  return `${base}${suffix}.${ext}`;
}

/** Format timestamp base name as YYYYMMDD_HHmmss_SSS. */
function formatTimestampBaseName(date: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}`;
}
