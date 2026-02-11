import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Normalize a local path or file:// URI into a file:// URI. */
export function normalizeFileUri(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("file://")) return trimmed;
  return pathToFileURL(path.resolve(trimmed)).href;
}

/** Convert a local path to file:// URI. */
export function toFileUri(targetPath: string): string {
  return pathToFileURL(targetPath).href;
}

/** Convert a local path to file:// URI without URL encoding. */
export function toFileUriWithoutEncoding(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const normalized = resolved.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return `file://${normalized}`;
  return `file:///${normalized}`;
}

/** Resolve a file:// URI into a local path. */
export function resolveFilePathFromUri(uri: string): string {
  const url = new URL(uri);
  if (url.protocol !== "file:") {
    throw new Error("Only file:// URIs are supported.");
  }
  return fileURLToPath(url);
}
