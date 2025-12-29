import { useCallback, useMemo } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

/** Fetch project metadata by root URI. */
export function useProject(rootUri?: string) {
  const queryClient = useQueryClient();

  const projectQueryKey = useMemo(() => {
    if (!rootUri) return undefined;
    return trpc.project.get.queryOptions({ rootUri }).queryKey;
  }, [rootUri]);

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
    trpc.project.get.queryOptions(rootUri ? { rootUri } : skipToken)
  );

  return {
    ...projectQuery,
    invalidateProject,
    invalidateProjectList,
  };
}
