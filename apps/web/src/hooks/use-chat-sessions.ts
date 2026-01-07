"use client";

import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

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
};

/** Session list input shared by list and recent views. */
const SESSION_LIST_INPUT = {
  where: { deletedAt: null },
  orderBy: [{ isPin: "desc" }, { updatedAt: "desc" }],
  select: {
    id: true,
    title: true,
    createdAt: true,
    updatedAt: true,
    isPin: true,
    isUserRename: true,
  },
} as const;

/** Session list query options. */
const SESSION_LIST_QUERY = trpc.chatsession.findManyChatSession.queryOptions(
  SESSION_LIST_INPUT as any
) as any;

/** Max sessions shown in recent section. */
const RECENT_SESSION_LIMIT = 3;

/** Convert a date-like value into timestamp. */
function toTime(value: string | Date): number {
  return new Date(value).getTime();
}

/** Build recent sessions list from session list. */
function buildRecentSessions(sessions: ChatSessionListItem[]): ChatSessionListItem[] {
  if (sessions.length <= RECENT_SESSION_LIMIT) return sessions;
  // 中文注释：最近会话按更新时间排序，避免置顶影响“最近”展示。
  const sorted = [...sessions].sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
  return sorted.slice(0, RECENT_SESSION_LIMIT);
}

/** Fetch chat sessions for list + header + recent usage. */
export function useChatSessions() {
  const query = useQuery({
    ...SESSION_LIST_QUERY,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const sessions = (query.data ?? []) as ChatSessionListItem[];
  const recentSessions = useMemo(() => buildRecentSessions(sessions), [sessions]);

  return {
    sessions,
    recentSessions,
    isLoading: query.isLoading,
  };
}

/** Invalidate session list cache. */
export function invalidateChatSessions(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: SESSION_LIST_QUERY.queryKey });
}
