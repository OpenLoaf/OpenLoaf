"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { useSetting } from "@/hooks/use-settings";
import { WebSettingDefs } from "@/lib/setting-defs";

/** Step-up flow route path. */
const STEP_UP_ROUTE = "/step-up" as Route;

/** Determine whether the route targets the step-up flow. */
function isStepUpRoute(pathname: string) {
  return pathname === STEP_UP_ROUTE || pathname.startsWith(`${STEP_UP_ROUTE}/`);
}

/** Gate app content until step-up initialization completes. */
export default function StepUpGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { value: stepUpInitialized, loaded } = useSetting(
    WebSettingDefs.StepUpInitialized,
  );
  const onStepUpRoute = isStepUpRoute(pathname);

  useEffect(() => {
    if (!loaded) return;
    if (stepUpInitialized) return;
    if (onStepUpRoute) return;
    // 流程：等待设置加载完成 -> 未初始化且非初始化路由时跳转，避免重复进入主界面。
    router.replace(STEP_UP_ROUTE);
  }, [loaded, stepUpInitialized, onStepUpRoute, router]);

  if (!loaded) {
    return <LoadingScreen label="Checking setup..." />;
  }

  if (!stepUpInitialized && !onStepUpRoute) {
    return <LoadingScreen label="Redirecting to setup..." />;
  }

  return <>{children}</>;
}
