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
