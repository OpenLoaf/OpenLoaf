"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

type ProjectsQueryOptions = ReturnType<typeof trpc.project.list.queryOptions>;
type ProjectsQueryOverrides = Omit<ProjectsQueryOptions, "queryKey" | "queryFn">;

/** Get the shared query key for the projects list. */
export function getProjectsQueryKey() {
  return trpc.project.list.queryOptions().queryKey;
}

/** Fetch the projects list with shared defaults. */
export function useProjects(overrides?: ProjectsQueryOverrides) {
  const queryOptions = trpc.project.list.queryOptions();
  return useQuery({
    ...queryOptions,
    ...overrides,
    queryKey: queryOptions.queryKey,
    queryFn: queryOptions.queryFn,
  });
}
