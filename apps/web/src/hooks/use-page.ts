"use client";

import { useCallback, useMemo } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";

export function usePage(pageId?: string) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  const pageTreeQueryKey = useMemo(() => {
    if (!workspace?.id) return undefined;
    return trpc.pageCustom.getAll.queryOptions({ workspaceId: workspace.id })
      .queryKey;
  }, [workspace?.id]);

  const invalidatePage = useCallback(async () => {
    if (!workspace || !pageId) return;
    const queryKey = trpc.page.findUniquePage.queryOptions({ where: { id: pageId } })
      .queryKey;
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, workspace, pageId]);

  const invalidatePageTree = useCallback(async () => {
    if (!pageTreeQueryKey) return;
    await queryClient.invalidateQueries({ queryKey: pageTreeQueryKey });
  }, [queryClient, pageTreeQueryKey]);

  const pageQuery = useQuery(
    trpc.page.findUniquePage.queryOptions(
      workspace && pageId ? { where: { id: pageId } } : skipToken
    )
  );

  return {
    ...pageQuery,
    invalidatePage,
    invalidatePageTree,
  };
}
