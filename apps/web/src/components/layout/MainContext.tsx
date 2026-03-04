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

import * as React from "react";
import { useNavigation } from "@/hooks/use-navigation";
import { cn } from "@/lib/utils";
import { PageLayout } from "./PageLayout";

export const MainContent: React.FC<{ className?: string }> = ({ className }) => {
  // 新导航系统
  const activeView = useNavigation((s) => s.activeView);

  if (!activeView) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-muted-foreground",
          className,
        )}
      >
        请选择一个视图
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      <PageLayout />
    </div>
  );
};
