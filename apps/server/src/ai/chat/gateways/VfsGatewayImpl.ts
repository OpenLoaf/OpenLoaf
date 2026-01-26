import type { VfsGateway } from "@/ai/chat/VfsGateway";
import {
  getActiveWorkspace,
  getProjectRootPath,
  getWorkspaceById,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from "@tenas-ai/api/services/vfsService";
import type { Workspace } from "@tenas-ai/api/types/workspace";

export class VfsGatewayImpl implements VfsGateway {
  /** Get the active workspace config. */
  getActiveWorkspace(): Workspace {
    return getActiveWorkspace();
  }

  /** Get workspace config by id. */
  getWorkspaceById(workspaceId: string): Workspace | null {
    return getWorkspaceById(workspaceId);
  }

  /** Resolve active workspace root path on disk. */
  getWorkspaceRootPath(): string {
    return getWorkspaceRootPath();
  }

  /** Resolve workspace root path by id. */
  getWorkspaceRootPathById(workspaceId: string): string | null {
    return getWorkspaceRootPathById(workspaceId);
  }

  /** Resolve project root path by project id. */
  getProjectRootPath(projectId: string, workspaceId?: string): string | null {
    return getProjectRootPath(projectId, workspaceId);
  }
}
