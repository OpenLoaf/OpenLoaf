import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getEnvString } from "@teatime-ai/config";

type WorkspaceConfig = {
  /** Workspace id. */
  id: string;
  /** Workspace display name. */
  name: string;
  /** Workspace type. */
  type: "local" | "cloud";
  /** Active workspace marker. */
  isActive: boolean;
  /** Workspace root URI. */
  rootUri: string;
  /** Project map of { projectId: rootUri }. */
  projects?: Record<string, string>;
};

type TeatimeConfig = {
  /** Workspace list. */
  workspaces: WorkspaceConfig[];
  /** Legacy root URI (deprecated). */
  workspaceRootUri?: string;
};

const PROJECT_META_DIR = ".teatime";
const PROJECT_META_FILE = "project.json";

/** Resolve the config file path from environment. */
function getTeatimeConfigPath(): string {
  const confPath = getEnvString(process.env, "TEATIME_CONF_PATH", { required: true });
  return confPath!;
}

/** Normalize a local path or file:// URI into a file:// URI. */
function normalizeFileUri(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("file://")) return trimmed;
  return pathToFileURL(path.resolve(trimmed)).href;
}

/** Normalize project map into file:// URIs. */
function normalizeProjects(projects?: Record<string, string>): Record<string, string> {
  if (!projects) return {};
  const normalized: Record<string, string> = {};
  for (const [projectId, projectUri] of Object.entries(projects)) {
    if (!projectId || !projectUri) continue;
    normalized[projectId] = normalizeFileUri(projectUri);
  }
  return normalized;
}

/** Load Teatime config from disk and normalize workspace roots. */
function loadTeatimeConfig(): TeatimeConfig {
  const confPath = getTeatimeConfigPath();
  if (!existsSync(confPath)) {
    throw new Error("Teatime config not found. Please create teatime.conf first.");
  }
  const raw = JSON.parse(readFileSync(confPath, "utf-8")) as TeatimeConfig;
  const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : [];
  if (workspaces.length === 0) {
    throw new Error("workspaces is required in teatime.conf.");
  }
  const fallbackRoot = typeof raw.workspaceRootUri === "string" ? raw.workspaceRootUri : "";
  const normalizedWorkspaces = workspaces.map((workspace) => {
    const rootUriRaw = String(workspace.rootUri ?? fallbackRoot ?? "").trim();
    if (!rootUriRaw) {
      throw new Error("workspace.rootUri is required in teatime.conf.");
    }
    return {
      ...workspace,
      rootUri: normalizeFileUri(rootUriRaw),
      projects: normalizeProjects(workspace.projects),
    };
  });
  return { workspaces: normalizedWorkspaces };
}

/** Read raw config file as a mutable payload. */
function readTeatimeConfigFile(): Record<string, unknown> {
  const confPath = getTeatimeConfigPath();
  if (!existsSync(confPath)) {
    throw new Error("Teatime config not found. Please create teatime.conf first.");
  }
  return JSON.parse(readFileSync(confPath, "utf-8")) as Record<string, unknown>;
}

/** Write raw config file payload back to disk. */
function writeTeatimeConfigFile(payload: Record<string, unknown>): void {
  const confPath = getTeatimeConfigPath();
  writeFileSync(confPath, JSON.stringify(payload, null, 2), "utf-8");
}

/** Get the active workspace config. */
export function getActiveWorkspace(): WorkspaceConfig {
  const config = loadTeatimeConfig();
  const active = config.workspaces.find((workspace) => workspace.isActive) ?? config.workspaces[0];
  if (!active) {
    throw new Error("Active workspace not found.");
  }
  return active;
}

/** Get workspace root URI from active workspace. */
export function getWorkspaceRootUri(): string {
  return getActiveWorkspace().rootUri;
}

/** Get workspace root path on disk and ensure it exists. */
export function getWorkspaceRootPath(): string {
  const rootPath = fileURLToPath(getWorkspaceRootUri());
  // 中文注释：启动时确保目录存在，避免后续读写失败。
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

/** Get project root URI by project id. */
function readProjectConfigProjects(rootUri: string): {
  projectId?: string;
  projects?: Record<string, string>;
} | null {
  try {
    const rootPath = resolveFilePathFromUri(rootUri);
    const metaPath = path.join(rootPath, PROJECT_META_DIR, PROJECT_META_FILE);
    if (!existsSync(metaPath)) return null;
    const raw = JSON.parse(readFileSync(metaPath, "utf-8")) as {
      projectId?: string;
      projects?: Record<string, string>;
    };
    return raw;
  } catch {
    return null;
  }
}

export function getProjectRootUri(projectId: string): string | null {
  const workspace = getActiveWorkspace();
  const direct = workspace.projects?.[projectId];
  if (direct) return direct;

  const queue = Object.values(workspace.projects ?? {});
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (visited.has(current)) continue;
    visited.add(current);
    const meta = readProjectConfigProjects(current);
    if (!meta) continue;
    if (meta.projectId === projectId) return current;
    const children = Object.values(meta.projects ?? {});
    for (const childUri of children) {
      if (!visited.has(childUri)) queue.push(childUri);
    }
  }
  return null;
}

/** Get project root path by project id. */
export function getProjectRootPath(projectId: string): string | null {
  const rootUri = getProjectRootUri(projectId);
  if (!rootUri) return null;
  return fileURLToPath(rootUri);
}

/** Upsert project root URI into active workspace config. */
export function upsertActiveWorkspaceProject(projectId: string, rootUri: string): void {
  const raw = readTeatimeConfigFile();
  const config = loadTeatimeConfig();
  const activeIndex = config.workspaces.findIndex((workspace) => workspace.isActive);
  const targetIndex = activeIndex >= 0 ? activeIndex : 0;
  const active = config.workspaces[targetIndex];
  if (!active) {
    throw new Error("Active workspace not found.");
  }
  const nextProjects = {
    ...(active.projects ?? {}),
    [projectId]: normalizeFileUri(rootUri),
  };
  const nextWorkspaces = config.workspaces.map((workspace, index) =>
    index === targetIndex ? { ...workspace, projects: nextProjects } : workspace
  );
  // 中文注释：保留未知字段，仅更新 workspaces 与项目映射。
  const payload = { ...raw, workspaces: nextWorkspaces };
  if ("workspaceRootUri" in payload) {
    delete (payload as { workspaceRootUri?: string }).workspaceRootUri;
  }
  writeTeatimeConfigFile(payload);
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

/** Resolve a URI and ensure it stays inside the active workspace or projects. */
export function resolveWorkspacePathFromUri(uri: string): string {
  const targetPath = path.resolve(resolveFilePathFromUri(uri));
  const activeWorkspace = getActiveWorkspace();
  const rootUris = [activeWorkspace.rootUri, ...Object.values(activeWorkspace.projects ?? {})];
  for (const rootUri of rootUris) {
    const rootPath = path.resolve(resolveFilePathFromUri(rootUri));
    if (targetPath === rootPath) return targetPath;
    if (targetPath.startsWith(rootPath + path.sep)) return targetPath;
  }
  throw new Error("Path escapes workspace roots.");
}
