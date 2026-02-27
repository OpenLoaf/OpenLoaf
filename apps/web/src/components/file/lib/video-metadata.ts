/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { trpcClient } from "@/utils/trpc";
import { parseScopedProjectPath, normalizeProjectRelativePath } from "@/components/project/filesystem/utils/file-system-utils";

export type VideoMetadata = {
  width: number;
  height: number;
};

/** Fetch video dimensions from the server. */
export async function fetchVideoMetadata(input: {
  workspaceId: string;
  projectId?: string;
  uri: string;
}): Promise<VideoMetadata | null> {
  const trimmed = input.uri.trim();
  if (!input.workspaceId || !trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  // 逻辑：统一解析 scoped/相对路径，避免后端无法定位文件。
  const parsed = parseScopedProjectPath(trimmed);
  const relativePath = parsed?.relativePath ?? normalizeProjectRelativePath(trimmed);
  if (!relativePath) return null;
  const projectId = parsed?.projectId ?? input.projectId;
  try {
    const result = await trpcClient.fs.videoMetadata.query({
      workspaceId: input.workspaceId,
      projectId,
      uri: relativePath,
    });
    if (!result?.width || !result?.height) return null;
    return { width: result.width, height: result.height };
  } catch {
    return null;
  }
}
