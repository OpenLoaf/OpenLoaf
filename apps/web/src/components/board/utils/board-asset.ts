/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  buildChildUri,
  getUniqueName,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  AUDIO_EXTS,
  VIDEO_EXTS,
  IMAGE_EXTS,
  CODE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  DOC_EXTS,
  SPREADSHEET_EXTS,
  isTextFallbackExt,
} from "@/components/project/filesystem/components/FileSystemEntryVisual";
import type { FilePreviewViewer } from "@/components/file/lib/file-preview-types";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { trpcClient } from "@/utils/trpc";
import { fileToBase64 } from "./base64";

/** Compute a fitted size that preserves the original aspect ratio. */
export function fitSize(
  width: number,
  height: number,
  maxDimension: number,
): [number, number] {
  const maxSide = Math.max(width, height);
  if (maxSide <= maxDimension) {
    return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
  }
  const scale = maxDimension / maxSide;
  return [
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  ];
}

/** Check if a file is a video by MIME type or extension. */
export function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.has(ext);
}

/** Check if a file is an audio by MIME type or extension. */
export function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTS.has(ext);
}

/** Check if a file is an image by MIME type or extension. */
export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

/** Persist a file to the board's asset folder, returning the board-relative path. */
export async function saveBoardAssetFile(input: {
  file: File;
  fallbackName: string;
  projectId?: string;
  boardId?: string;
  boardFolderUri?: string;
}): Promise<string> {
  const { file, fallbackName, projectId, boardId, boardFolderUri } = input;
  const assetsFolderUri = boardId
    ? BOARD_ASSETS_DIR_NAME
    : boardFolderUri
      ? buildChildUri(boardFolderUri, BOARD_ASSETS_DIR_NAME)
      : "";
  if (!assetsFolderUri) return "";
  await trpcClient.fs.mkdir.mutate({
    projectId,
    boardId,
    uri: assetsFolderUri,
    recursive: true,
  });
  const existing = await trpcClient.fs.list.query({
    projectId,
    boardId,
    uri: assetsFolderUri,
  });
  const existingNames = new Set(
    (existing.entries ?? []).map((entry) => entry.name),
  );
  const safeName =
    (file.name || fallbackName).replace(/[\\/]/g, "-") || fallbackName;
  const uniqueName = getUniqueName(safeName, existingNames);
  const targetUri = boardId
    ? `${BOARD_ASSETS_DIR_NAME}/${uniqueName}`
    : buildChildUri(assetsFolderUri, uniqueName);
  const contentBase64 = await fileToBase64(file);
  await trpcClient.fs.writeBinary.mutate({
    projectId,
    boardId,
    uri: targetUri,
    contentBase64,
  });
  return `${BOARD_ASSETS_DIR_NAME}/${uniqueName}`;
}

/** Capture a poster frame from a local video file. */
export function buildVideoPosterFromFile(
  file: File,
): Promise<{ posterSrc: string; width: number; height: number } | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    const capture = () => {
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!width || !height) {
        cleanup();
        resolve(null);
        return;
      }
      const [pw, ph] = fitSize(width, height, 640);
      const canvas = document.createElement("canvas");
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(video, 0, 0, pw, ph);
      const posterSrc = ctx ? canvas.toDataURL("image/jpeg", 0.82) : "";
      cleanup();
      resolve({ posterSrc, width, height });
    };
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, video.duration * 0.1 || 0);
    };
    video.onseeked = capture;
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = url;
  });
}

/** Get audio duration in seconds from a local file. */
export function getAudioDuration(file: File): Promise<number | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration =
        Number.isFinite(audio.duration) ? audio.duration : null;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

/** Resolve extension to a FilePreviewViewer type. */
export function resolveViewerType(ext: string): FilePreviewViewer {
  const normalized = ext.toLowerCase();
  if (IMAGE_EXTS.has(normalized)) return "image";
  if (MARKDOWN_EXTS.has(normalized)) return "markdown";
  if (CODE_EXTS.has(normalized) || isTextFallbackExt(normalized))
    return "code";
  if (PDF_EXTS.has(normalized)) return "pdf";
  if (DOC_EXTS.has(normalized)) {
    if (normalized === "docx") return "doc";
    return "file";
  }
  if (SPREADSHEET_EXTS.has(normalized)) return "sheet";
  if (VIDEO_EXTS.has(normalized)) return "video";
  return "file";
}
