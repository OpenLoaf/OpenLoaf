/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sanitizeFileName } from "@/ai/services/image/imageStorage";
import { resolveSaveDirectory } from "@/ai/services/mediaStorageShared";

/** Supported video extensions for directory inference. */
const VIDEO_SAVE_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv"]);
/** Supported audio extensions. */
const AUDIO_SAVE_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".flac", ".opus"]);

/** Check whether extension is a known video or audio extension. */
function isMediaSaveExtension(ext: string): boolean {
  const lower = ext.toLowerCase();
  return VIDEO_SAVE_EXTENSIONS.has(lower) || AUDIO_SAVE_EXTENSIONS.has(lower);
}

/** Resolve local directory from video save directory input. */
export async function resolveVideoSaveDirectory(input: {
  /** Raw save directory uri. */
  saveDir: string;
  /** Optional project id fallback. */
  projectId?: string | null;
}): Promise<string | null> {
  return resolveSaveDirectory({
    saveDir: input.saveDir,
    projectId: input.projectId,
    isKnownExtension: isMediaSaveExtension,
  });
}

/** Resolve extension from media type or url. */
function resolveMediaExtension(input: { mediaType: string; url: string }): string {
  const mediaType = input.mediaType.toLowerCase();
  // video
  if (mediaType.includes("webm")) return "webm";
  if (mediaType.includes("quicktime")) return "mov";
  if (mediaType.includes("mp4")) return "mp4";
  // audio
  if (mediaType.includes("audio/mpeg")) return "mp3";
  if (mediaType.includes("audio/wav") || mediaType.includes("audio/x-wav")) return "wav";
  if (mediaType.includes("audio/ogg")) return "ogg";
  if (mediaType.includes("audio/flac")) return "flac";
  if (mediaType.includes("audio/opus")) return "opus";
  try {
    const parsed = new URL(input.url);
    const ext = path.extname(parsed.pathname).toLowerCase().replace(".", "");
    if (ext && isMediaSaveExtension(`.${ext}`)) return ext;
  } catch {
    // ignore invalid url
  }
  // default based on media type prefix
  if (mediaType.startsWith("audio/")) return "mp3";
  return "mp4";
}

/** Download a video and save to directory. */
export async function saveGeneratedVideoFromUrl(input: {
  /** Source url. */
  url: string;
  /** Target directory path. */
  directory: string;
  /** Base file name (without extension). */
  fileNameBase: string;
}): Promise<{ filePath: string; fileName: string; mediaType: string }> {
  const response = await fetch(input.url);
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`下载视频失败: ${response.status} ${text}`);
  }
  const mediaType = response.headers.get("content-type") || "video/mp4";
  const ext = resolveMediaExtension({ mediaType, url: input.url });
  const safeBase = sanitizeFileName(input.fileNameBase) || "video";
  const fileName = `${safeBase}.${ext}`;
  const filePath = path.join(input.directory, fileName);
  await fs.mkdir(input.directory, { recursive: true });
  const stream = Readable.fromWeb(response.body as any);
  await pipeline(stream, createWriteStream(filePath));
  return { filePath, fileName, mediaType };
}
