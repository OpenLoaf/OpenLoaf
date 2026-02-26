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

import * as React from "react";
import { useTabs } from "@/hooks/use-tabs";
import { cn } from "@/lib/utils";
import { TabLayout } from "./TabLayout";

export const MainContent: React.FC<{ className?: string }> = ({ className }) => {
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabs = useTabs((s) => s.tabs);
  // 运行期 keep-alive：只要某个 tab scene 曾经挂载过，就一直保留 DOM/组件树，
  // 以确保“像浏览器 Tab 一样”切回来 UI 状态完全一致（滚动/输入/展开等都不丢）。
  const [mounted, setMounted] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!activeTabId) return;
    // 惰性挂载：初始仅挂载 active tab；用户切换到某 tab 时才首次挂载它，
    // 避免刷新后一次性挂载多个 tab 导致卡顿/副作用过多。
    setMounted((prev) => (prev[activeTabId] ? prev : { ...prev, [activeTabId]: true }));
  }, [activeTabId]);

  React.useEffect(() => {
    const present = new Set(tabs.map((tab) => tab.id));
    setMounted((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};

      for (const [tabId, isMounted] of Object.entries(prev)) {
        if (!isMounted) continue;
        // tab 被关闭时清理 mounted，释放对应 scene（否则会一直占用内存）
        if (!present.has(tabId)) {
          changed = true;
          continue;
        }
        next[tabId] = true;
      }

      if (activeTabId && present.has(activeTabId) && !next[activeTabId]) {
        // 兜底：如果 activeTabId 还存在但 mounted 未标记，补上
        next[activeTabId] = true;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [tabs, activeTabId]);

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
