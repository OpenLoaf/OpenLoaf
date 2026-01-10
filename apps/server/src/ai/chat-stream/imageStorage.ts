import { Buffer } from "node:buffer";
import path from "node:path";
import type { GeneratedFile } from "ai";
import { readBasicConf, readS3Providers } from "@/modules/settings/teatimeConfStore";
import { createS3StorageService, resolveS3ProviderConfig } from "@/modules/storage/s3StorageService";
import { saveChatImageAttachment } from "./attachmentResolver";

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

/** 保存生成图片到磁盘并返回落库 parts。 */
export async function saveGeneratedImages(input: {
  /** Generated image files from provider. */
  images: GeneratedFile[];
  /** Workspace id for storage scoping. */
  workspaceId: string;
  /** Chat session id for storage scoping. */
  sessionId: string;
  /** Optional project id for storage scoping. */
  projectId?: string;
}): Promise<Array<{ type: "file"; url: string; mediaType: string }>> {
  const parts: Array<{ type: "file"; url: string; mediaType: string }> = [];
  for (const [index, image] of input.images.entries()) {
    const mediaType = image.mediaType || "image/png";
    const buffer = Buffer.from(image.uint8Array);
    const fileName = buildImageFileName(index, mediaType);
    const saved = await saveChatImageAttachment({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      fileName,
      mediaType,
      buffer,
    });
    parts.push({ type: "file", url: saved.url, mediaType: saved.mediaType });
  }
  return parts;
}

/** 构建图片文件名。 */
function buildImageFileName(index: number, mediaType: string): string {
  const ext = resolveImageExtension(mediaType);
  return `image-${index + 1}.${ext}`;
}
