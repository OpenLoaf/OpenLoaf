/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { GeneratedFile } from "ai";
import { getOpenLoafRootDir } from "@openloaf/config";
import { resolveSaveDirectory } from "@/ai/services/mediaStorageShared";
import { readBasicConf, readS3Providers } from "@/modules/settings/openloafConfStore";
import { createS3StorageService, resolveS3ProviderConfig } from "@/modules/storage/s3StorageService";
import type { OpenLoafImageMetadataV1 } from "@openloaf/api/types/image";
import { downloadImageData } from "@/ai/shared/util";
import {
  injectPngMetadata,
  loadProjectImageBuffer,
  resolveMetadataSidecarPath,
  saveChatImageAttachment,
  serializeImageMetadata,
} from "./attachmentResolver";

/** Resolve active S3 storage service. */
function resolveActiveS3Storage() {
  const basic = readBasicConf();
  const activeId = basic.activeS3Id;
  if (!activeId) return null;
  const provider = readS3Providers().find((entry) => entry.id === activeId);
  if (!provider) return null;
  return createS3StorageService(resolveS3ProviderConfig(provider));
}

/** Format current timestamp as YYYYMMDDHHmmss. */
function nowTimestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}

/** Normalize filename for S3 object keys: timestamp + 16-char MD5. */
export function sanitizeFileName(fileName: string): string {
  return `${nowTimestamp()}_${createHash("md5").update(fileName).digest("hex").slice(0, 16)}`;
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

/** Check whether the input string is a relative path. */
function isRelativePath(value: string): boolean {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/** Resolve image input into buffer + meta for upload. */
export async function resolveImageInputBuffer(input: {
  /** Raw input data. */
  data: string | Buffer | Uint8Array | ArrayBuffer;
  /** Optional media type hint. */
  mediaType?: string;
  /** Fallback base name for storage. */
  fallbackName: string;
  /** Optional project id for local resolution. */
  projectId?: string;
  /** Optional abort signal. */
  abortSignal?: AbortSignal;
}): Promise<{ buffer: Buffer; mediaType: string; baseName: string }> {
  const mediaTypeHint = input.mediaType?.trim() || "";
  const fallbackName = sanitizeFileName(input.fallbackName);
  if (typeof input.data === "string") {
    const raw = input.data.trim();
    const dataUrlType = raw.startsWith("data:") ? resolveMediaTypeFromDataUrl(raw) : "";
    const resolvedType = dataUrlType || mediaTypeHint || "image/png";
    if (isRelativePath(raw)) {
      const payload = await loadProjectImageBuffer({
        path: raw,
        projectId: input.projectId,
        mediaType: resolvedType,
      });
      if (!payload) {
        throw new Error("图片读取失败");
      }
      return {
        buffer: payload.buffer,
        mediaType: payload.mediaType,
        baseName: resolveBaseNameFromUrl(raw, fallbackName),
      };
    }
    const bytes = await downloadImageData(raw, input.abortSignal);
    return {
      buffer: Buffer.from(bytes),
      mediaType: resolvedType,
      baseName: resolveBaseNameFromUrl(raw, fallbackName),
    };
  }
  if (Buffer.isBuffer(input.data)) {
    return {
      buffer: input.data,
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  if (input.data instanceof Uint8Array) {
    return {
      buffer: Buffer.from(input.data),
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  if (input.data instanceof ArrayBuffer) {
    return {
      buffer: Buffer.from(input.data),
      mediaType: mediaTypeHint || "image/png",
      baseName: fallbackName,
    };
  }
  throw new Error("图片输入格式不支持");
}

/** Supported image extensions for directory inference. */
const IMAGE_SAVE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** Check whether extension is a known image extension. */
function isImageSaveExtension(ext: string): boolean {
  return IMAGE_SAVE_EXTENSIONS.has(ext.toLowerCase());
}

// Re-export from appConfigService for backward compat (videoStorage imports from here).
export { getResolvedTempStorageDir } from "@openloaf/api/services/appConfigService";

/** Resolve local directory from imageSaveDir input. */
export async function resolveImageSaveDirectory(input: {
  /** Raw image save directory uri. */
  imageSaveDir: string;
  /** Optional project id fallback. */
  projectId?: string | null;
}): Promise<string | null> {
  return resolveSaveDirectory({
    saveDir: input.imageSaveDir,
    projectId: input.projectId,
    isKnownExtension: isImageSaveExtension,
  });
}

/** Download image urls and save into a local directory. */
export async function saveImageUrlsToDirectory(input: {
  /** Image urls from SaaS result. */
  urls: string[];
  /** Target directory path. */
  directory: string;
}): Promise<string[]> {
  const savedPaths: string[] = [];
  await fs.mkdir(input.directory, { recursive: true });
  const baseTime = Date.now();
  for (const [index, url] of input.urls.entries()) {
    let mediaType = "image/png";
    let buffer: Buffer;
    if (url.startsWith("data:")) {
      mediaType = resolveMediaTypeFromDataUrl(url) || mediaType;
      const bytes = await downloadImageData(url);
      buffer = Buffer.from(bytes);
    } else {
      const response = await fetch(url);
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`下载图片失败: ${response.status} ${text}`.trim());
      }
      mediaType = response.headers.get("content-type") || mediaType;
      buffer = Buffer.from(await response.arrayBuffer());
    }
    const fileName = buildImageFileName(index, mediaType, baseTime);
    const filePath = path.join(input.directory, fileName);
    // 逻辑：SaaS 结果不写 metadata，直接落盘原图。
    await fs.writeFile(filePath, buffer);
    savedPaths.push(filePath);
  }
  return savedPaths;
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
