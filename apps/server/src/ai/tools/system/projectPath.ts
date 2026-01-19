import path from "node:path";
import { getProjectId } from "@/ai/shared/context/requestContext";
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

/** Scoped project path matcher like [projectId]/path/to/file. */
const PROJECT_SCOPE_REGEX = /^\[([^\]]+)\]\/(.+)$/;

/** Resolve project root path from request context or an explicit project id. */
export function resolveProjectRootPath(projectIdOverride?: string): {
  projectId: string;
  rootPath: string;
} {
  const projectId = projectIdOverride?.trim() || getProjectId();
  if (!projectId) {
    throw new Error("projectId is required.");
  }
  const rootPath = getProjectRootPath(projectId);
  if (!rootPath) {
    throw new Error("project root not found.");
  }
  return { projectId, rootPath: path.resolve(rootPath) };
}

/** Parse a scoped project path string. */
function parseScopedProjectPath(raw: string): { projectId?: string; relativePath: string } {
  // 逻辑：支持 [projectId]/path 形式的跨项目路径输入。
  const match = raw.match(PROJECT_SCOPE_REGEX);
  if (!match) return { relativePath: raw };
  return { projectId: match[1]?.trim(), relativePath: match[2] ?? "" };
}

/** Resolve a raw path into a project-bound absolute path. */
export function resolveProjectPath(raw: string): ResolvedProjectPath {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("path is required.");
  }

  // 逻辑：用户输入可能携带 @ 前缀，解析前先去掉。
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const scoped = parseScopedProjectPath(normalized);
  const { projectId, rootPath } = resolveProjectRootPath(scoped.projectId);

  let absPath = scoped.relativePath;
  if (!path.isAbsolute(scoped.relativePath)) {
    absPath = path.resolve(rootPath, scoped.relativePath);
  } else {
    absPath = path.resolve(scoped.relativePath);
  }

  const resolvedRoot = rootPath;
  // 逻辑：必须限制在项目根目录内，避免路径穿越。
  if (absPath !== resolvedRoot && !absPath.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Path is outside project root.");
  }

  const relativePath = path.relative(resolvedRoot, absPath) || ".";
  return { projectId, rootPath: resolvedRoot, absPath, relativePath };
}
