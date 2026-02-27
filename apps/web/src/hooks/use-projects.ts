/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";

type ProjectsQueryOptions = ReturnType<typeof trpc.project.list.queryOptions>;
type ProjectsQueryOverrides = Partial<Omit<ProjectsQueryOptions, "queryKey" | "queryFn">>;

/** Get the shared query key for the projects list. */
export function getProjectsQueryKey() {
  return trpc.project.list.queryOptions().queryKey;
}

/** Fetch the projects list with shared defaults. */
export function useProjects(overrides?: ProjectsQueryOverrides): UseQueryResult<ProjectNode[]> {
  const queryOptions = trpc.project.list.queryOptions();
  return useQuery({
    ...(queryOptions as unknown as Record<string, unknown>),
    ...(overrides ?? {}),
    queryKey: queryOptions.queryKey,
    queryFn: queryOptions.queryFn,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  }) as UseQueryResult<ProjectNode[]>;
}
