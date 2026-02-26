/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

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
