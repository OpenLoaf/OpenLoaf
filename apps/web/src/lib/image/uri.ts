/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { resolveServerUrl } from "@/utils/server-url";

export type PreviewEndpointOptions = {
  /** Project scope for preview resolution. */
  projectId?: string;
  /** Max preview payload size. */
  maxBytes?: number;
  /** Board id — when present, uses board attachment endpoint for board-relative paths. */
  boardId?: string;
};

export type BoardPreviewEndpointOptions = {
  /** Board id for resolving board asset path. */
  boardId: string;
  /** Project scope for preview resolution. */
  projectId?: string;
  /** Max preview payload size. */
  maxBytes?: number;
};

export type PreviewTooLargeError = Error & {
  /** Error code for preview size limit. */
  code: "PREVIEW_TOO_LARGE";
  /** Actual file size in bytes. */
  sizeBytes?: number;
  /** Max preview size in bytes. */
  maxBytes?: number;
};

/** Resolve preview endpoint for a project-relative path. */
export function getPreviewEndpoint(
  path: string,
  options?: PreviewEndpointOptions
) {
  const apiBase = resolveServerUrl();
  const encodedPath = encodeURIComponent(path);
  const projectParam = options?.projectId ? `&projectId=${encodeURIComponent(options.projectId)}` : "";
  const maxBytesParam = options?.maxBytes ? `&maxBytes=${options.maxBytes}` : "";
  return apiBase
    ? `${apiBase}/chat/attachments/preview?path=${encodedPath}${projectParam}${maxBytesParam}`
    : `/chat/attachments/preview?path=${encodedPath}${projectParam}${maxBytesParam}`;
}

/** Resolve board-scoped preview endpoint. Accepts a board-relative file path (e.g. "asset/foo.jpg"). */
export function getBoardPreviewEndpoint(
  file: string,
  options: BoardPreviewEndpointOptions,
) {
  const apiBase = resolveServerUrl();
  const encodedFile = encodeURIComponent(file);
  const encodedBoardId = encodeURIComponent(options.boardId);
  const projectParam = options.projectId ? `&projectId=${encodeURIComponent(options.projectId)}` : "";
  const maxBytesParam = options.maxBytes ? `&maxBytes=${options.maxBytes}` : "";
  const base = apiBase || "";
  return `${base}/board/attachments/preview?boardId=${encodedBoardId}&file=${encodedFile}${projectParam}${maxBytesParam}`;
}

/** Check whether a uri is a relative path. */
function isRelativePath(uri: string) {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
}

/** Check whether an error is a preview-too-large error. */
export function isPreviewTooLargeError(error: unknown): error is PreviewTooLargeError {
  return (
    error instanceof Error &&
    (error as PreviewTooLargeError).code === "PREVIEW_TOO_LARGE"
  );
}

/** Fetch a Blob from any supported uri. */
export async function fetchBlobFromUri(
  uri: string,
  options?: PreviewEndpointOptions
) {
  let endpoint: string;
  if (!isRelativePath(uri)) {
    endpoint = uri;
  } else if (options?.boardId) {
    endpoint = getBoardPreviewEndpoint(uri, {
      boardId: options.boardId,
      projectId: options.projectId,
      maxBytes: options.maxBytes,
    });
  } else {
    endpoint = getPreviewEndpoint(uri, options);
  }
  const res = await fetch(endpoint);
  if (!res.ok) {
    if (res.status === 413) {
      // 逻辑：预览被拦截时解析体积信息，供前端提示。
      const payload = await res.json().catch(() => null);
      const error = new Error("preview too large") as PreviewTooLargeError;
      error.code = "PREVIEW_TOO_LARGE";
      error.sizeBytes = payload?.sizeBytes;
      error.maxBytes = payload?.maxBytes;
      throw error;
    }
    throw new Error("preview failed");
  }
  return res.blob();
}

/** Load an Image element from a blob. */
export async function loadImageFromBlob(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
    });
    img.src = objectUrl;
    return await loaded;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Load an Image element from a uri. */
export async function loadImageFromUri(uri: string, options?: { projectId?: string }) {
  const blob = await fetchBlobFromUri(uri, options);
  return loadImageFromBlob(blob);
}

/** Extract file extension from media type. */
function getExtensionFromMediaType(mediaType?: string) {
  if (!mediaType) return "";
  const normalized = mediaType.toLowerCase();
  if (!normalized.includes("/")) return "";
  const ext = normalized.split("/")[1]?.split(";")[0] ?? "";
  if (ext === "jpeg") return "jpg";
  if (ext === "svg+xml") return "svg";
  return ext;
}

/** Extract media type from a data url. */
function getMediaTypeFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match?.[1]?.toLowerCase() ?? "";
}

/** Resolve a filename from uri. */
export function resolveFileName(uri: string, mediaType?: string) {
  if (!uri) return "image.png";
  if (uri.startsWith("data:")) {
    const dataType = getMediaTypeFromDataUrl(uri) || mediaType;
    const ext = getExtensionFromMediaType(dataType) || "png";
    return `image.${ext}`;
  }
  const raw = uri.split("/").pop() || "image";
  const clean = raw.split("?")[0]?.split("#")[0] || "image";
  const decoded = decodeURIComponent(clean);
  if (decoded.includes(".")) return decoded;
  const ext = getExtensionFromMediaType(mediaType);
  if (ext) return `${decoded || "image"}.${ext}`;
  return `${decoded || "image"}.png`;
}

/** Resolve the base name without extension. */
export function resolveBaseName(fileName: string) {
  const clean = fileName.split("?")[0]?.split("#")[0] || fileName;
  const trimmed = clean.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\.[a-zA-Z0-9]+$/, "");
}
