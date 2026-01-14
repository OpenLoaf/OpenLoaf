import path from "node:path";
import { getProjectId } from "@/ai/chat-stream/requestContext";
import { getProjectRootPath } from "@tenas-ai/api/services/vfsService";

/** Project path resolution result. */
export type ResolvedProjectPath = {
  /** Current project id from request context. */
  projectId: string;
  /** Absolute project root path. */
  rootPath: string;
  /** Absolute resolved target path. */
  absPath: string;
  /** Project-relative target path. */
  relativePath: string;
};

/** tenas-file protocol marker. */
const TENAS_FILE_PROTOCOL = "tenas-file:";

/** Resolve project root path from request context. */
export function resolveProjectRootPath(): { projectId: string; rootPath: string } {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("projectId is required.");
  }
  const rootPath = getProjectRootPath(projectId);
  if (!rootPath) {
    throw new Error("project root not found.");
  }
  return { projectId, rootPath: path.resolve(rootPath) };
}

/** Resolve a tenas-file uri into absolute path within the project. */
function resolveTenasFilePath(input: {
  uri: string;
  projectId: string;
  rootPath: string;
}): string {
  let parsed: URL;
  try {
    parsed = new URL(input.uri);
  } catch {
    throw new Error("Invalid tenas-file uri.");
  }
  if (parsed.protocol !== TENAS_FILE_PROTOCOL) {
    throw new Error("Invalid tenas-file protocol.");
  }
  const ownerId = parsed.hostname.trim();
  // 逻辑：允许 tenas-file://{projectId}/... 或 tenas-file://./...，禁止跨项目访问。
  if (ownerId && ownerId !== "." && ownerId !== input.projectId) {
    throw new Error("tenas-file projectId mismatch.");
  }
  const relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  return path.resolve(input.rootPath, relativePath || ".");
}

/** Resolve a raw path or tenas-file uri into a project-bound absolute path. */
export function resolveProjectPath(raw: string): ResolvedProjectPath {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("path is required.");
  }

  // 逻辑：用户输入可能携带 @tenas-file 前缀，解析前先去掉 @。
  const normalized = trimmed.startsWith("@tenas-file://") ? trimmed.slice(1) : trimmed;
  const { projectId, rootPath } = resolveProjectRootPath();

  let absPath = normalized;
  if (normalized.startsWith("tenas-file://")) {
    absPath = resolveTenasFilePath({ uri: normalized, projectId, rootPath });
  } else if (!path.isAbsolute(normalized)) {
    absPath = path.resolve(rootPath, normalized);
  } else {
    absPath = path.resolve(normalized);
  }

  const resolvedRoot = rootPath;
  // 逻辑：必须限制在项目根目录内，避免路径穿越。
  if (absPath !== resolvedRoot && !absPath.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Path is outside project root.");
  }

  const relativePath = path.relative(resolvedRoot, absPath) || ".";
  return { projectId, rootPath: resolvedRoot, absPath, relativePath };
}
