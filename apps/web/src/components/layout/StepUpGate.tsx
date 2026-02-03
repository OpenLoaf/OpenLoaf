"use client";

import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { useBasicConfig } from "@/hooks/use-basic-config";

/** Gate app content until step-up initialization completes. */
export default function StepUpGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useBasicConfig();

  // 临时：跳过 step-up 初始化流程，不再自动跳转或阻塞主界面。
  if (isLoading) {
    return <LoadingScreen label="Loading app..." />;
  }

  return <>{children}</>;
}
