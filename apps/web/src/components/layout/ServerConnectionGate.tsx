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

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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

  // 监听 Electron 主进程推送的 server crash 事件（生产模式下 app:// 协议方案）。
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ error?: string }>).detail;
      const message = detail?.error || "Server process crashed unexpectedly";
      toast.error("Server failed to start", {
        description: message.length > 200 ? `${message.slice(0, 200)}...` : message,
        duration: Number.POSITIVE_INFINITY,
      });
    };
    window.addEventListener("openloaf:server-crash", handler);
    return () => window.removeEventListener("openloaf:server-crash", handler);
  }, []);

  if (!isSuccess) return <LoadingScreen label="Waiting for server..." />;
  return <>{children}</>;
}
