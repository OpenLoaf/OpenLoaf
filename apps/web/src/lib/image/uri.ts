import { resolveServerUrl } from "@/utils/server-url";

/** Resolve preview endpoint for a project-relative path. */
export function getPreviewEndpoint(
  path: string,
  options?: { projectId?: string; maxBytes?: number }
) {
  const apiBase = resolveServerUrl();
  const encodedPath = encodeURIComponent(path);
  const projectParam = options?.projectId ? `&projectId=${encodeURIComponent(options.projectId)}` : "";
  const maxBytesParam = options?.maxBytes ? `&maxBytes=${options.maxBytes}` : "";
  return apiBase
    ? `${apiBase}/chat/attachments/preview?path=${encodedPath}${projectParam}${maxBytesParam}`
    : `/chat/attachments/preview?path=${encodedPath}${projectParam}${maxBytesParam}`;
}

/** Check whether a uri is a relative path. */
function isRelativePath(uri: string) {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
}

/** Fetch a Blob from any supported uri. */
export async function fetchBlobFromUri(
  uri: string,
  options?: { projectId?: string; maxBytes?: number }
) {
  const endpoint = isRelativePath(uri) ? getPreviewEndpoint(uri, options) : uri;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error("preview failed");
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
