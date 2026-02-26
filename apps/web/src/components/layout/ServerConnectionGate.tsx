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
import { LoadingScreen } from "@/components/layout/LoadingScreen";

export default function ServerConnectionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSuccess } = useQuery({
    ...trpc.health.queryOptions(),
    meta: { silent: true },
    retry: Number.POSITIVE_INFINITY,
    retryDelay: 2000,
    staleTime: 0,
    gcTime: 0,
  });

  if (!isSuccess) return <LoadingScreen label="Waiting for server..." />;
  return <>{children}</>;
}
