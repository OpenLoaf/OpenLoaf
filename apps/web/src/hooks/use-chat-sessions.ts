"use client";

import { useMemo } from "react";
import { skipToken, useQuery, type QueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { useTabView } from "@/hooks/use-tab-view";

/** Session list item used by chat UI. */
export type ChatSessionListItem = {
  /** Session id. */
  id: string;
  /** Session title. */
  title: string;
  /** Session created time. */
  createdAt: string | Date;
  /** Session updated time. */
  updatedAt: string | Date;
  /** Whether the session is pinned. */
  isPin: boolean;
  /** Whether the title is renamed by user. */
  isUserRename: boolean;
  /** Error message for last failed request. */
  errorMessage: string | null;
  /** Project id bound to session. */
  projectId: string | null;
  /** Project name resolved from tree. */
  projectName: string | null;
  /** Session message count. */
  messageCount: number;
};

/** Max sessions shown in recent section. */
const RECENT_SESSION_LIMIT = 3;

/** Chat session list scope input. */
export type UseChatSessionsInput = {
  /** Current tab id. */
  tabId?: string;
};

/** Normalize optional id value. */
function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Convert a date-like value into timestamp. */
function toTime(value: string | Date): number {
  return new Date(value).getTime();
}

/** Build recent sessions list from session list. */
function buildRecentSessions(sessions: ChatSessionListItem[]): ChatSessionListItem[] {
  if (sessions.length <= RECENT_SESSION_LIMIT) return sessions;
  // 最近会话按更新时间排序，避免置顶影响“最近”展示。
  const sorted = [...sessions].sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
  return sorted.slice(0, RECENT_SESSION_LIMIT);
}

/** Fetch chat sessions for list + header + recent usage. */
export function useChatSessions(input?: UseChatSessionsInput) {
  const activeTabId = useTabs((s) => s.activeTabId);
  const resolvedTabId = input?.tabId ?? activeTabId ?? undefined;
  const tab = useTabView(resolvedTabId);
  const workspaceId = normalizeOptionalId(tab?.workspaceId);
  // 只有项目页才按项目范围过滤会话。
  const isProjectTab = tab?.base?.component === "plant-page";
  const scopedProjectId = isProjectTab
    ? normalizeOptionalId((tab?.chatParams as Record<string, unknown> | undefined)?.projectId)
    : undefined;
  const listInput = useMemo(() => {
    if (!workspaceId) return undefined;
    // 逻辑：聊天面板仅展示未绑定 board 的会话。
    return scopedProjectId
      ? { workspaceId, projectId: scopedProjectId, boardId: null }
      : { workspaceId, boardId: null };
  }, [scopedProjectId, workspaceId]);

  const query = useQuery({
    ...trpc.chat.listSessions.queryOptions(listInput ?? skipToken),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const sessions = (query.data ?? []) as ChatSessionListItem[];
  const recentSessions = useMemo(() => buildRecentSessions(sessions), [sessions]);

  return {
    sessions,
    recentSessions,
    scopeProjectId: scopedProjectId,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/** Invalidate session list cache. */
export function invalidateChatSessions(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: trpc.chat.listSessions.pathKey() });
}
