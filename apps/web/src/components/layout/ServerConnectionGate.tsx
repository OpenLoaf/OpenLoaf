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

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import {
  ServerCrashScreen,
  type CrashInfo,
} from "@/components/layout/ServerCrashScreen";
export default function ServerConnectionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [crashInfo, setCrashInfo] = useState<CrashInfo | null>(null);

  const { isSuccess } = useQuery({
    ...trpc.health.queryOptions(),
    meta: { silent: true },
    retry: Number.POSITIVE_INFINITY,
    retryDelay: 2000,
    staleTime: 0,
    gcTime: 0,
  });

  // 服务连通后预取 basic config，避免 StepUpGate 挂载第二个 LoadingScreen 导致动画重置。
  const { isLoading: configLoading } = useQuery({
    ...trpc.settings.getBasic.queryOptions(),
    enabled: isSuccess,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // 监听 Electron 主进程推送的 server crash 事件
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          error?: string;
          isUpdatedServer?: boolean;
          crashedVersion?: string;
          rolledBack?: boolean;
        }>
      ).detail;
      setCrashInfo({
        error: detail?.error || "Server process crashed unexpectedly",
        isUpdatedServer: detail?.isUpdatedServer,
        crashedVersion: detail?.crashedVersion,
        rolledBack: detail?.rolledBack,
      });
    };
    window.addEventListener("openloaf:server-crash", handler);
    return () => window.removeEventListener("openloaf:server-crash", handler);
  }, []);

  // 崩溃时显示全屏错误页
  if (crashInfo) return <ServerCrashScreen crashInfo={crashInfo} />;

  // 服务未连通或 basic config 未加载完时持续显示同一个 LoadingScreen
  if (!isSuccess || configLoading) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
