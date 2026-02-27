/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";
import JSZip from "jszip";

/** Supported image extensions mapped to media types. */
const IMAGE_MEDIA_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".tiff", "image/tiff"],
]);

type ZipImageEntry = {
  /** Original file name inside the archive. */
  fileName: string;
  /** Image buffer. */
  buffer: Buffer;
  /** Media type. */
  mediaType: string;
  /** Buffer byte length. */
  bytes: number;
};

type ZipImageExtractResult = {
  /** Extracted image entries. */
  images: ZipImageEntry[];
  /** Whether extraction was truncated by limits. */
  truncated: boolean;
};

/** Normalize folder prefix for zip entries. */
function normalizeFolderPrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/** Resolve image media type from extension. */
function resolveImageMediaType(ext: string): string | null {
  return IMAGE_MEDIA_TYPES.get(ext) ?? null;
}

/**
 * Extract image buffers from a zip archive under a specific folder prefix.
 */
export async function extractZipImages(input: {
  /** Zip file buffer. */
  buffer: Buffer;
  /** Folder prefix inside zip (e.g. word/media or xl/media). */
  folderPrefix: string;
  /** Max image count. */
  maxImages: number;
  /** Max total bytes for all images. */
  maxTotalBytes: number;
}): Promise<ZipImageExtractResult> {
  const zip = await JSZip.loadAsync(input.buffer);
  const prefix = normalizeFolderPrefix(input.folderPrefix);
  const images: ZipImageEntry[] = [];
  let truncated = false;
  let totalBytes = 0;

  const files = Object.values(zip.files).filter(
    (file) => !file.dir && (!prefix || file.name.startsWith(prefix)),
  );

  for (const file of files) {
    if (images.length >= input.maxImages) {
      truncated = true;
      break;
    }
    const ext = path.extname(file.name).toLowerCase();
    const mediaType = resolveImageMediaType(ext);
    if (!mediaType) continue;
    let buffer: Buffer;
    try {
      buffer = await file.async("nodebuffer");
    } catch {
      continue;
    }
    if (totalBytes + buffer.length > input.maxTotalBytes) {
      // 逻辑：超过总字节上限立即停止，避免写入过量文件。
      truncated = true;
      break;
    }
    totalBytes += buffer.length;
    images.push({
      fileName: path.basename(file.name),
      buffer,
      mediaType,
      bytes: buffer.length,
    });
  }

  return { images, truncated };
}
