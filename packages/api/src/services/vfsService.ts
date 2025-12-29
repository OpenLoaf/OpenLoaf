import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getEnvString } from "@teatime-ai/config";

type TeatimeConfig = {
  workspaceRootUri: string;
};

let cachedWorkspaceRootUri: string | null = null;
let cachedWorkspaceRootPath: string | null = null;

/** Resolve the config file path from environment. */
function getTeatimeConfigPath(): string {
  const confPath = getEnvString(process.env, "TEATIME_CONF_PATH", { required: true });
  return confPath!;
}

/** Normalize workspace root to a file:// URI. */
function normalizeWorkspaceRootUri(raw: string): string {
  if (raw.startsWith("file://")) return raw;
  return pathToFileURL(path.resolve(raw)).href;
}

/** Load Teatime config from disk. */
function loadTeatimeConfig(): TeatimeConfig {
  const confPath = getTeatimeConfigPath();
  if (!existsSync(confPath)) {
    throw new Error("Teatime config not found. Please create teatime.conf first.");
  }
  const raw = JSON.parse(readFileSync(confPath, "utf-8")) as Partial<TeatimeConfig>;
  const workspaceRootUri = String(raw.workspaceRootUri ?? "").trim();
  if (!workspaceRootUri) {
    throw new Error("workspaceRootUri is required in teatime.conf.");
  }
  return { workspaceRootUri: normalizeWorkspaceRootUri(workspaceRootUri) };
}

/** Get workspace root URI from config with in-memory cache. */
export function getWorkspaceRootUri(): string {
  if (cachedWorkspaceRootUri) return cachedWorkspaceRootUri;
  cachedWorkspaceRootUri = loadTeatimeConfig().workspaceRootUri;
  return cachedWorkspaceRootUri;
}

/** Get workspace root path on disk and ensure it exists. */
export function getWorkspaceRootPath(): string {
  if (cachedWorkspaceRootPath) return cachedWorkspaceRootPath;
  const rootPath = fileURLToPath(getWorkspaceRootUri());
  // 中文注释：启动时确保目录存在，避免后续读写失败。
  mkdirSync(rootPath, { recursive: true });
  cachedWorkspaceRootPath = rootPath;
  return cachedWorkspaceRootPath;
}

/** Convert a local path to file:// URI. */
export function toFileUri(targetPath: string): string {
  return pathToFileURL(targetPath).href;
}

/** Resolve a file:// URI into a local path. */
export function resolveFilePathFromUri(uri: string): string {
  const url = new URL(uri);
  if (url.protocol !== "file:") {
    throw new Error("Only file:// URIs are supported.");
  }
  return fileURLToPath(url);
}

/** Resolve a URI and ensure it stays inside the workspace root. */
export function resolveWorkspacePathFromUri(uri: string): string {
  const rootPath = path.resolve(getWorkspaceRootPath());
  const targetPath = path.resolve(resolveFilePathFromUri(uri));
  if (targetPath === rootPath) return targetPath;
  if (targetPath.startsWith(rootPath + path.sep)) return targetPath;
  throw new Error("Path escapes workspace root.");
}
