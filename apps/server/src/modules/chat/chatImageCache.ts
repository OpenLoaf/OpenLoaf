import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { getWorkspaceRootPath } from "@teatime-ai/api/services/vfsService";

/** Relative path for image cache. */
const IMAGE_CACHE_BASE = ".teatime_cache";
/** Maximum edge size for model input images. */
const MAX_IMAGE_SIZE = 1024;

/** Build image cache directory path. */
function getImageCacheDir(workspaceId: string, projectId?: string): string {
  const rootPath = getWorkspaceRootPath();
  const cacheDir = projectId
    ? path.join(rootPath, IMAGE_CACHE_BASE, workspaceId, projectId, "image")
    : path.join(rootPath, IMAGE_CACHE_BASE, workspaceId, "image");
  // 中文注释：按 workspace 分目录；有项目 ID 再细分。
  mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
}

/** Compute sha256 hash for file cache key. */
function computeImageHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Resolve file extension from name. */
function resolveImageExtension(fileName?: string): string {
  if (!fileName) return "";
  const ext = path.extname(fileName).replace(/^\./, "").trim().toLowerCase();
  return ext;
}

/** Save raw image buffer to cache and return hash. */
export function saveChatImageToCache(input: {
  buffer: Buffer;
  workspaceId: string;
  projectId?: string;
  fileName?: string;
}): { hash: string; filePath: string; imagePath: string } {
  const hash = computeImageHash(input.buffer);
  const ext = resolveImageExtension(input.fileName);
  const fileName = ext ? `${hash}.${ext}` : hash;
  const cacheDir = getImageCacheDir(input.workspaceId, input.projectId);
  const filePath = path.join(cacheDir, fileName);
  if (!existsSync(filePath)) {
    // 中文注释：只在首次写入，避免重复写盘。
    writeFileSync(filePath, input.buffer);
  }
  const imagePath = input.projectId
    ? `${IMAGE_CACHE_BASE}/${input.workspaceId}/${input.projectId}/image/${fileName}`
    : `${IMAGE_CACHE_BASE}/${input.workspaceId}/image/${fileName}`;
  return { hash, filePath, imagePath };
}

/** Load raw image buffer from path. */
export function loadChatImageFromPath(imagePath: string): Buffer | null {
  if (!imagePath) return null;
  const rootPath = getWorkspaceRootPath();
  const resolved = path.resolve(rootPath, imagePath);
  if (!resolved.startsWith(rootPath + path.sep)) return null;
  if (!existsSync(resolved)) return null;
  return readFileSync(resolved);
}

/** Compress image to max 1024px while keeping aspect ratio. */
export async function compressChatImageForModel(buffer: Buffer): Promise<Buffer> {
  // 中文注释：限制最长边 1024，避免过大图片占用 token/带宽。
  return sharp(buffer)
    .resize({ width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE, fit: "inside", withoutEnlargement: true })
    .toBuffer();
}

/** Load and compress image buffer for model input. */
export async function loadChatImageForModelFromPath(imagePath: string): Promise<Buffer | null> {
  const raw = loadChatImageFromPath(imagePath);
  if (!raw) return null;
  return compressChatImageForModel(raw);
}
