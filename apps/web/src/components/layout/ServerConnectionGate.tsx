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

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import {
  SERVER_RESTART_REQUESTED_EVENT,
  ServerCrashScreen,
  type CrashInfo,
} from "@/components/layout/ServerCrashScreen";

// 健康检查持续失败超过此阈值后，切到「后台失联」全屏页（不再无限 loading）。
// 选择 10s：能跳过 prod 启动正常的 1-3s 等待和 dev 启动 5-8s 冷启动，又能在 server 真挂掉后及时反馈。
const DISCONNECT_THRESHOLD_MS = 10_000;

export default function ServerConnectionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [crashInfo, setCrashInfo] = useState<CrashInfo | null>(null);
  const [showDisconnected, setShowDisconnected] = useState(false);
  // 第一次成功连通后置位；之后哪怕短暂掉线也立刻可触发 disconnected 提示，
  // 避免初始启动期被误判。
  const everConnectedRef = useRef(false);

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
        reason: "crashed",
      });
    };
    window.addEventListener("openloaf:server-crash", handler);
    return () => window.removeEventListener("openloaf:server-crash", handler);
  }, []);

  // 健康检查软超时：连通失败超过阈值后，显示「后台失联」页面。
  useEffect(() => {
    if (isSuccess) {
      everConnectedRef.current = true;
      setShowDisconnected(false);
      return;
    }
    // 初次启动给 prod 1.5x 阈值缓冲，避免误报。
    const grace = everConnectedRef.current
      ? DISCONNECT_THRESHOLD_MS
      : DISCONNECT_THRESHOLD_MS * 1.5;
    const timer = window.setTimeout(() => setShowDisconnected(true), grace);
    return () => window.clearTimeout(timer);
  }, [isSuccess]);

  // 用户从 ServerCrashScreen 触发重启 server 后，清空错误状态并立即重试 health。
  useEffect(() => {
    const handler = () => {
      setCrashInfo(null);
      setShowDisconnected(false);
      queryClient.invalidateQueries({ queryKey: trpc.health.queryKey() });
    };
    window.addEventListener(SERVER_RESTART_REQUESTED_EVENT, handler);
    return () => window.removeEventListener(SERVER_RESTART_REQUESTED_EVENT, handler);
  }, [queryClient]);

  // 崩溃 / 失联时显示全屏错误页
  if (crashInfo) {
    return <ServerCrashScreen crashInfo={crashInfo} />;
  }
  if (showDisconnected && !isSuccess) {
    return (
      <ServerCrashScreen
        crashInfo={{
          error: "Health check timed out",
          reason: "disconnected",
        }}
      />
    );
  }

  // 服务未连通或 basic config 未加载完时持续显示同一个 LoadingScreen
  if (!isSuccess || configLoading) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
