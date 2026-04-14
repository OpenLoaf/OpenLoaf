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

import { useMemo } from "react";
import { skipToken, useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import type { AutoTestVerdict } from "@openloaf/api";
import { trpc } from "@/utils/trpc";
import { useAppState } from "@/hooks/use-app-state";

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
  /** Project icon resolved from tree. */
  projectIcon: string | null;
  /** Session message count. */
  messageCount: number;
  /** chat-probe 自动测试标记，来自 session.json。 */
  autoTest?: boolean;
  /** 自动测试评审聚合分数（EVALUATION.json aggregate.score），未评审为 null。 */
  autoTestScore?: number | null;
  /** 自动测试评审聚合裁决（EVALUATION.json aggregate.verdict），未评审为 null。 */
  autoTestVerdict?: AutoTestVerdict | null;
};

/** Max sessions shown in recent section. */
const RECENT_SESSION_LIMIT = 3;
const EMPTY_SESSIONS: ChatSessionListItem[] = [];

/** Chat session list scope input. */
export type UseChatSessionsInput = {
  /** Current tab id. */
  tabId?: string;
  /** Whether the query is enabled (defaults to true). */
  enabled?: boolean;
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
  // 最近会话按更新时间排序，避免置顶影响"最近"展示。
  const sorted = [...sessions].sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
  return sorted.slice(0, RECENT_SESSION_LIMIT);
}

/** Fetch chat sessions for list + header + recent usage. */
export function useChatSessions(_input?: UseChatSessionsInput) {
  const tab = useAppState();
  const boardBaseParams =
    tab?.base?.component === "board-viewer"
      ? (tab.base.params as Record<string, unknown> | undefined)
      : undefined;
  const scopedBoardId = normalizeOptionalId(boardBaseParams?.boardId)
    ?? normalizeOptionalId((tab?.chatParams as Record<string, unknown> | undefined)?.boardId);
  // 有 chatParams.projectId 的 tab（项目聊天、plant-page 等）按项目范围过滤会话。
  const scopedProjectId = normalizeOptionalId(
    boardBaseParams?.projectId
      ?? (tab?.chatParams as Record<string, unknown> | undefined)?.projectId,
  );
  const listInput = useMemo(() => {
    if (scopedBoardId) {
      return scopedProjectId
        ? { projectId: scopedProjectId, boardId: scopedBoardId }
        : { boardId: scopedBoardId };
    }
    // 逻辑：普通聊天面板仅展示未绑定 board 的会话；board tab 则改为只读自己的 board session。
    return scopedProjectId
      ? { projectId: scopedProjectId, boardId: null }
      : { boardId: null };
  }, [scopedBoardId, scopedProjectId]);

  const enabled = _input?.enabled ?? true;

  const query = useInfiniteQuery({
    ...trpc.chat.listSessions.infiniteQueryOptions(
      enabled ? (listInput ?? skipToken) : skipToken,
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const sessions = useMemo(
    () => (query.data?.pages.flatMap((p) => p.items) ?? EMPTY_SESSIONS) as ChatSessionListItem[],
    [query.data],
  );
  const recentSessions = useMemo(() => buildRecentSessions(sessions), [sessions]);

  return {
    sessions,
    recentSessions,
    scopeProjectId: scopedProjectId,
    isLoading: query.isLoading,
    refetch: query.refetch,
    hasMore: Boolean(query.hasNextPage),
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

/** Invalidate session list cache. */
export function invalidateChatSessions(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: trpc.chat.listSessions.pathKey() });
  queryClient.invalidateQueries({ queryKey: trpc.chat.listSidebarSessions.pathKey() });
}
