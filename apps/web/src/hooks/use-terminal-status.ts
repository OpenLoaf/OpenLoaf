"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

/** Resolve terminal feature availability from the server. */
export function useTerminalStatus() {
  const query = useQuery({
    ...trpc.terminal.getStatus.queryOptions(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    enabled: Boolean(query.data?.enabled),
    isLoading: query.isLoading,
  };
}
