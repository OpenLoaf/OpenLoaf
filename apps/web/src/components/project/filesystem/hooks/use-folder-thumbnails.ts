"use client";

import { useMemo } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";

type UseFolderThumbnailsParams = {
  currentUri?: string | null;
  includeHidden?: boolean;
  projectId?: string;
};

/** Fetch folder thumbnails and normalize them into a map. */
function useFolderThumbnails({
  currentUri,
  includeHidden,
  projectId,
}: UseFolderThumbnailsParams) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const shouldFetch = currentUri !== null && currentUri !== undefined && Boolean(workspaceId);
  const thumbnailsQuery = useQuery(
    trpc.fs.folderThumbnails.queryOptions(
      shouldFetch
        ? { workspaceId, projectId, uri: currentUri, includeHidden }
        : skipToken
    )
  );
  const thumbnailByUri = useMemo(() => {
    const map = new Map<string, string>();
    // 缓存缩略图结果，提升文件网格渲染稳定性。
    for (const item of thumbnailsQuery.data?.items ?? []) {
      map.set(item.uri, item.dataUrl);
    }
    return map;
  }, [thumbnailsQuery.data?.items]);

  return { thumbnailByUri };
}

export { useFolderThumbnails };
