import { useCallback, useMemo } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

/** Fetch project metadata by project id. */
export function useProject(projectId?: string) {
  const queryClient = useQueryClient();

  const projectQueryKey = useMemo(() => {
    if (!projectId) return undefined;
    return trpc.project.get.queryOptions({ projectId }).queryKey;
  }, [projectId]);

  const projectListQueryKey = useMemo(() => {
    return trpc.project.list.queryOptions().queryKey;
  }, []);

  const invalidateProject = useCallback(async () => {
    if (!projectQueryKey) return;
    await queryClient.invalidateQueries({ queryKey: projectQueryKey });
  }, [queryClient, projectQueryKey]);

  const invalidateProjectList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: projectListQueryKey });
  }, [queryClient, projectListQueryKey]);

  const projectQuery = useQuery(
    trpc.project.get.queryOptions(projectId ? { projectId } : skipToken)
  );

  return {
    ...projectQuery,
    invalidateProject,
    invalidateProjectList,
  };
}
