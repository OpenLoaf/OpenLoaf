import path from "node:path";
import { getProjectId } from "@/ai/shared/context/requestContext";
import { getProjectRootPath } from "@tenas-ai/api/services/vfsService";

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
