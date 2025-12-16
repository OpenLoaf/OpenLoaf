"use client";

import * as React from "react";
import { useTabs } from "@/hooks/use_tabs";
import { cn } from "@/lib/utils";
import { TabScene } from "./TabScene";

export const MainContent: React.FC<{ className?: string }> = ({ className }) => {
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
      {tabs
        .filter((tab) => mounted[tab.id])
        .map((tab) => (
          <TabScene key={tab.id} tabId={tab.id} active={tab.id === activeTabId} />
        ))}
    </div>
  );
};

