"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

type ProjectStorageRootResult = { rootUri: string; tempRootUri: string };
type ProjectStorageRootQueryOptions = ReturnType<typeof trpc.settings.getProjectStorageRoot.queryOptions>;
type ProjectStorageRootOverrides = Partial<
  Omit<ProjectStorageRootQueryOptions, "queryKey" | "queryFn">
>;

/** Get the shared query key for the default project storage root. */
export function getProjectStorageRootQueryKey() {
  return trpc.settings.getProjectStorageRoot.queryOptions().queryKey;
}

/** Fetch the default project storage root URI without touching legacy compat queries. */
export function useProjectStorageRootQuery(
  overrides?: ProjectStorageRootOverrides,
): UseQueryResult<ProjectStorageRootResult> {
  const queryOptions = trpc.settings.getProjectStorageRoot.queryOptions();
  return useQuery({
    ...(queryOptions as unknown as Record<string, unknown>),
    ...(overrides ?? {}),
    queryKey: queryOptions.queryKey,
    queryFn: queryOptions.queryFn,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  }) as UseQueryResult<ProjectStorageRootResult>;
}

/** Read the default project storage root URI with a lightweight shared hook. */
export function useProjectStorageRootUri() {
  const query = useProjectStorageRootQuery();
  return query.data?.rootUri;
}

/** Read the temp storage root URI for unbound boards. */
export function useTempStorageRootUri() {
  const query = useProjectStorageRootQuery();
  return query.data?.tempRootUri;
}
