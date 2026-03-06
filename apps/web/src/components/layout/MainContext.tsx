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
import { useTabs } from "@/hooks/use-tabs";
import { useNavigation } from "@/hooks/use-navigation";
import { cn } from "@/lib/utils";
import { TabLayout } from "./TabLayout";
import { PageLayout } from "./PageLayout";

// 功能开关：启用新的导航系统（PageLayout 尚未完整实现，默认关闭）
const USE_NEW_NAVIGATION = process.env.NEXT_PUBLIC_USE_NEW_NAVIGATION === "true";

export const MainContent: React.FC<{ className?: string }> = ({ className }) => {
  // 新导航系统
  const activeView = useNavigation((s) => s.activeView);

  // Tab 系统
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabs = useTabs((s) => s.tabs);
  const [mounted, setMounted] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!activeTabId) return;
    setMounted((prev) => (prev[activeTabId] ? prev : { ...prev, [activeTabId]: true }));
  }, [activeTabId]);

  React.useEffect(() => {
    const present = new Set(tabs.map((tab) => tab.id));
    setMounted((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};

      for (const [tabId, isMounted] of Object.entries(prev)) {
        if (!isMounted) continue;
        if (!present.has(tabId)) {
          changed = true;
          continue;
        }
        next[tabId] = true;
      }

      if (activeTabId && present.has(activeTabId) && !next[activeTabId]) {
        next[activeTabId] = true;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [tabs, activeTabId]);

  // 使用新导航系统
  if (USE_NEW_NAVIGATION) {
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
  }

  // 使用 Tab 系统（默认）
  if (!activeTabId) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-muted-foreground",
          className,
        )}
      >
        No active tab
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      <TabLayout
        tabs={tabs.filter((tab) => mounted[tab.id] || tab.id === activeTabId)}
        activeTabId={activeTabId}
      />
    </div>
  );
};
