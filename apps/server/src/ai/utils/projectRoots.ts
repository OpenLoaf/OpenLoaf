import { prisma } from "@tenas-ai/db";
import { resolveProjectAncestorRootUris } from "@tenas-ai/api/services/projectDbService";
import { resolveFilePathFromUri } from "@tenas-ai/api/services/vfsService";
import { logger } from "@/common/logger";

/** Resolve parent project root paths from database. */
export async function resolveParentProjectRootPaths(projectId?: string): Promise<string[]> {
  const normalizedId = projectId?.trim() ?? "";
  if (!normalizedId) return [];
  try {
    const parentRootUris = await resolveProjectAncestorRootUris(prisma, normalizedId);
    // 逻辑：父项目 rootUri 需转成本地路径，过滤掉无效 URI。
    return parentRootUris
      .map((rootUri) => {
        try {
          return resolveFilePathFromUri(rootUri);
        } catch {
          return null;
        }
      })
      .filter((rootPath): rootPath is string => Boolean(rootPath));
  } catch (error) {
    logger.warn({ err: error, projectId: normalizedId }, "[chat] resolve parent project roots");
    return [];
  }
}
