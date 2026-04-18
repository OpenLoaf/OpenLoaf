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
import { useTranslation } from "react-i18next";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@openloaf/ui/input";
import SessionItem, { type Session } from "./SessionItem";
import { useChatSessions, type ChatSessionListItem } from "@/hooks/use-chat-sessions";
import { useIsInView } from "@/hooks/use-is-in-view";
import {
  Queue,
  QueueItem,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";

interface SessionListProps {
  /** Current tab id for scoping. */
  tabId?: string;
  /** Current active session id. */
  activeSessionId?: string;
  /** Set of session ids already open in tabs (renders blue dot). */
  openSessionIds?: Set<string>;
  /** External sessions list (skips internal useChatSessions hook). */
  externalSessions?: ChatSessionListItem[];
  /** Loading state when using external sessions. */
  externalLoading?: boolean;
  /** Whether more pages are available. */
  hasMore?: boolean;
  /** Whether the next page is currently being fetched. */
  isFetchingNextPage?: boolean;
  /** Callback to load more sessions. */
  onLoadMore?: () => void;
  /** Select handler. */
  onSelect?: (session: Session) => void;
  /** Menu open state callback. */
  onMenuOpenChange?: (open: boolean) => void;
  /** Debounced 搜索关键词变化回调；external 模式下由外部注入到 listSessions.input.query。 */
  onSearchQueryChange?: (query: string) => void;
  /** Custom className. */
  className?: string;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function groupSessions(sessions: Session[]) {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const pinned: Session[] = [];
  const today: Session[] = [];
  const yesterday: Session[] = [];
  const within7: Session[] = [];
  const within30: Session[] = [];
  const byMonth = new Map<string, Session[]>();

  for (const s of sorted) {
    if (s.pinned) {
      pinned.push(s);
      continue;
    }
    const t = new Date(s.createdAt);
    const diffDays = Math.floor(
      (todayStart - startOfDay(t).getTime()) / oneDay
    );
    if (diffDays === 0) today.push(s);
    else if (diffDays === 1) yesterday.push(s);
    else if (diffDays < 7) within7.push(s);
    else if (diffDays < 30) within30.push(s);
    else {
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      const list = byMonth.get(key) ?? [];
      list.push(s);
      byMonth.set(key, list);
    }
  }

  const groups: { key: string; labelKey: string; sessions: Session[] }[] = [];
  if (pinned.length)
    groups.push({ key: "pinned", labelKey: "session.groupLabel.pinned", sessions: pinned });
  if (today.length)
    groups.push({ key: "today", labelKey: "session.groupLabel.today", sessions: today });
  if (yesterday.length)
    groups.push({ key: "yesterday", labelKey: "session.groupLabel.yesterday", sessions: yesterday });
  if (within7.length)
    groups.push({ key: "within7", labelKey: "session.groupLabel.within7", sessions: within7 });
  if (within30.length)
    groups.push({ key: "within30", labelKey: "session.groupLabel.within30", sessions: within30 });

  for (const [key, list] of byMonth) {
    groups.push({ key, labelKey: key, sessions: list });
  }

  return groups;
}

type SessionDisplayNameInput = {
  /** Session title. */
  title: string;
  /** Project id bound to session. */
  projectId: string | null;
  /** Project name resolved from tree. */
  projectName: string | null;
  /** Current project id for scoping. */
  currentProjectId?: string;
};

/** Build display name with project prefix when needed. */
function buildSessionDisplayName(input: SessionDisplayNameInput): string {
  const title = input.title.trim();
  if (!input.currentProjectId) return title;
  if (!input.projectId || input.projectId === input.currentProjectId) return title;
  const projectName = String(input.projectName ?? "").trim();
  if (!projectName) return title;
  // 非当前项目会话在标题前拼接项目名。
  return title ? `${projectName} / ${title}` : projectName;
}

const LOAD_MORE_IN_VIEW_MARGIN = "200px 0px";
const SEARCH_DEBOUNCE_MS = 220;

export default function SessionList({
  tabId,
  activeSessionId,
  openSessionIds,
  externalSessions,
  externalLoading,
  hasMore: externalHasMore,
  isFetchingNextPage: externalIsFetchingNextPage,
  onLoadMore,
  onSelect,
  onMenuOpenChange,
  onSearchQueryChange,
  className,
}: SessionListProps) {
  const { t } = useTranslation('ai');
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === debouncedQuery) return;
    const timer = window.setTimeout(() => setDebouncedQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, debouncedQuery]);

  React.useEffect(() => {
    onSearchQueryChange?.(debouncedQuery);
  }, [debouncedQuery, onSearchQueryChange]);

  const internal = useChatSessions(
    externalSessions ? undefined : { tabId, query: debouncedQuery },
  );
  const chatSessions = externalSessions ?? internal.sessions;
  const isLoading = externalSessions ? (externalLoading ?? false) : internal.isLoading;
  const scopeProjectId = externalSessions ? undefined : internal.scopeProjectId;
  const hasMore = externalSessions ? (externalHasMore ?? false) : internal.hasMore;
  const isFetchingNextPage = externalSessions
    ? (externalIsFetchingNextPage ?? false)
    : internal.isFetchingNextPage;
  const handleLoadMore = externalSessions
    ? onLoadMore
    : () => void internal.fetchNextPage();

  const sessions: Session[] = React.useMemo(() => {
    const showProjectLabel = !scopeProjectId;
    return chatSessions.map((s) => ({
      id: s.id,
      name: s.title,
      displayName: buildSessionDisplayName({
        title: s.title,
        projectId: s.projectId,
        projectName: s.projectName,
        currentProjectId: scopeProjectId,
      }),
      // 逻辑：未绑定项目的 tab 才展示项目名称标签。
      projectLabel: showProjectLabel
        ? String(s.projectName ?? "").trim() || undefined
        : undefined,
      projectIcon: s.projectIcon ?? undefined,
      createdAt: s.createdAt,
      pinned: s.isPin,
      hasAssets: s.hasAssets ?? false,
      autoTest: s.autoTest ?? false,
      autoTestScore: s.autoTestScore ?? null,
      autoTestVerdict: s.autoTestVerdict ?? null,
    }));
  }, [chatSessions, scopeProjectId]);

  const groups = React.useMemo(() => groupSessions(sessions), [sessions]);

  // Infinite scroll sentinel
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const { ref: loadMoreInViewRef, isInView: isLoadMoreInView } = useIsInView(loadMoreRef, {
    inView: hasMore,
    inViewMargin: LOAD_MORE_IN_VIEW_MARGIN,
  });

  React.useEffect(() => {
    if (!hasMore || !isLoadMoreInView || isFetchingNextPage) return;
    handleLoadMore?.();
  }, [handleLoadMore, hasMore, isFetchingNextPage, isLoadMoreInView]);

  const hasQuery = debouncedQuery.length > 0;
  const showEmpty = !isLoading && sessions.length === 0 && !hasQuery;
  const showNoMatch = !isLoading && sessions.length === 0 && hasQuery;

  return (
    <div
      className={`flex w-full flex-col max-h-[min(80svh,var(--radix-popover-content-available-height))] min-h-0 ${className ?? ""}`}
    >
      <div className="shrink-0 pb-1.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("session.searchPlaceholder")}
            className="h-8 rounded-full pl-8 pr-8 text-sm"
            aria-label={t("session.searchPlaceholder")}
          />
          {query.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDebouncedQuery("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={t("session.clearSearch", { defaultValue: "Clear" })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto show-scrollbar touch-auto">
        {isLoading ? null : showEmpty ? (
          <Queue className="border-none bg-transparent px-0 py-1 shadow-none">
            <div className="px-2 py-3 text-sm text-muted-foreground">{t('session.empty')}</div>
          </Queue>
        ) : showNoMatch ? (
          <Queue className="border-none bg-transparent px-0 py-1 shadow-none">
            <div className="px-2 py-3 text-sm text-muted-foreground">{t('session.noMatches')}</div>
          </Queue>
        ) : (
          <Queue className="border-none bg-transparent px-0 py-1 shadow-none">
            {groups.map((g) => (
              <QueueSection key={g.key} defaultOpen>
                <QueueSectionTrigger className="rounded-3xl px-2 py-1.5 text-xs font-medium">
                  <QueueSectionLabel label={t(g.labelKey, { defaultValue: g.labelKey })} count={g.sessions.length} />
                </QueueSectionTrigger>
                <QueueSectionContent className="mt-1">
                  <ul className="space-y-0.5">
                    {g.sessions.map((s) => (
                      <QueueItem key={s.id} className="px-0 py-0 hover:bg-transparent">
                        <SessionItem
                          session={s}
                          isActive={Boolean(activeSessionId && s.id === activeSessionId)}
                          isOpenInTab={openSessionIds?.has(s.id)}
                          onSelect={onSelect}
                          onMenuOpenChange={onMenuOpenChange}
                        />
                      </QueueItem>
                    ))}
                  </ul>
                </QueueSectionContent>
              </QueueSection>
            ))}
            {hasMore ? <div ref={loadMoreInViewRef} className="h-4 w-full" aria-hidden="true" /> : null}
            {isFetchingNextPage ? (
              <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              </div>
            ) : null}
          </Queue>
        )}
      </div>
    </div>
  );
}
