"use client";

import { useEffect, useMemo } from "react";
import { useTabs } from "@/hooks/use-tabs";
import type { ChatSessionListItem } from "@/hooks/use-chat-sessions";

type UseSessionTitlesInput = {
  tabId?: string;
  sessions: ChatSessionListItem[];
};

/** Sync session titles into tab state for stable rendering. */
export function useSessionTitles(input: UseSessionTitlesInput) {
  const activeTabId = useTabs((s) => s.activeTabId);
  const setTabSessionTitles = useTabs((s) => s.setTabSessionTitles);
  const resolvedTabId = input.tabId ?? activeTabId ?? undefined;
  const titles = useMemo(() => {
    const next: Record<string, string> = {};
    for (const session of input.sessions) {
      if (!session?.id) continue;
      const title = String(session.title ?? "").trim();
      next[session.id] = title || "新对话";
    }
    return next;
  }, [input.sessions]);

  useEffect(() => {
    if (!resolvedTabId) return;
    if (Object.keys(titles).length === 0) return;
    setTabSessionTitles(resolvedTabId, titles);
  }, [resolvedTabId, setTabSessionTitles, titles]);
}
