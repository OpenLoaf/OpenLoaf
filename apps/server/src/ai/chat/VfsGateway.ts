import type { Workspace } from "@tenas-ai/api/types/workspace";

export interface VfsGateway {
  /** Get the active workspace config. */
  getActiveWorkspace(): Workspace;
  /** Get workspace config by id. */
  getWorkspaceById(workspaceId: string): Workspace | null;
  /** Resolve active workspace root path on disk. */
  getWorkspaceRootPath(): string;
  /** Resolve workspace root path by id. */
  getWorkspaceRootPathById(workspaceId: string): string | null;
  /** Resolve project root path by project id. */
  getProjectRootPath(projectId: string, workspaceId?: string): string | null;
}
