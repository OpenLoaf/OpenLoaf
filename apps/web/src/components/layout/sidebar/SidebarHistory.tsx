"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SidebarHistoryItem, SidebarHistorySort } from "@openloaf/api";
import { ArrowUpDown, FolderOpen, MessageSquare, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIsInView } from "@/hooks/use-is-in-view";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { trpc } from "@/utils/trpc";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@openloaf/ui/sidebar";

const SIDEBAR_HISTORY_PAGE_SIZE = 30;
const LOAD_MORE_IN_VIEW_MARGIN = "240px 0px";

type SidebarHistoryProps = {
  /** Filter rows to the current project when rendering inside project shell. */
  projectId?: string;
};

/** Sidebar history loading skeleton. */
function SidebarHistorySkeleton() {
  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 pt-3">
      <SidebarGroupLabel className="px-2">
        <div className="h-3 w-18 rounded-3xl bg-muted-foreground/15" />
      </SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-1">
        <SidebarMenuSkeleton
          showIcon
          className="h-12 [&_[data-sidebar=menu-skeleton-icon]]:bg-muted-foreground/15 [&_[data-sidebar=menu-skeleton-text]]:bg-muted-foreground/15"
        />
        <SidebarMenuSkeleton
          showIcon
          className="h-12 [&_[data-sidebar=menu-skeleton-icon]]:bg-muted-foreground/15 [&_[data-sidebar=menu-skeleton-text]]:bg-muted-foreground/15"
        />
        <SidebarMenuSkeleton
          showIcon
          className="h-12 [&_[data-sidebar=menu-skeleton-icon]]:bg-muted-foreground/15 [&_[data-sidebar=menu-skeleton-text]]:bg-muted-foreground/15"
        />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Resolve a safe display title for the history row. */
function resolveHistoryItemTitle(item: SidebarHistoryItem, t: (key: string) => string): string {
  const trimmed = item.title.trim();
  if (trimmed) return trimmed;
  if (item.entityType === "project") return t("projectListPage.untitled");
  if (item.entityType === "board") return t("canvasList.untitled");
  return t("chat");
}

/** Format the visit time shown on the trailing edge of the history row. */
function formatHistoryItemVisitedAt(value: Date, locale?: string): string {
  const now = new Date();
  const sameDay =
    value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(value);
  }

  const sameYear = value.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

/** Resolve the active timestamp shown for the current history sort mode. */
function resolveHistoryItemVisitedAt(
  item: SidebarHistoryItem,
  sortBy: SidebarHistorySort,
): Date {
  return sortBy === "lastVisitedAt" ? new Date(item.lastVisitedAt) : new Date(item.firstVisitedAt);
}

/** Resolve the board entity id from runtime base params. */
function resolveBoardEntityId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const normalized = value.trim().replace(/\/+$/u, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Render a stable icon for one history row. */
function renderHistoryItemIcon(item: SidebarHistoryItem) {
  if (item.entityType === "project") {
    if (item.icon?.trim()) {
      return (
        <span className="flex h-4 w-4 shrink-0 self-center items-center justify-center text-sm leading-none">
          {item.icon}
        </span>
      );
    }
    return <FolderOpen className="h-4 w-4 shrink-0 self-center text-foreground/60" />;
  }
  if (item.entityType === "chat") {
    return <MessageSquare className="h-4 w-4 shrink-0 self-center text-foreground/60" />;
  }
  return <Palette className="h-4 w-4 shrink-0 self-center text-foreground/60" />;
}

export function SidebarHistory({ projectId }: SidebarHistoryProps) {
  const { t, i18n } = useTranslation("nav");
  const { t: tCommon } = useTranslation("common");
  const nav = useSidebarNavigation();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const normalizedProjectId = projectId?.trim() || undefined;
  const [sortBy, setSortBy] = useState<SidebarHistorySort>("firstVisitedAt");
  const nextSortBy = sortBy === "firstVisitedAt" ? "lastVisitedAt" : "firstVisitedAt";
  const sortButtonLabel = sortBy === "firstVisitedAt"
    ? t("historySortByLastVisit")
    : t("historySortByFirstVisit");

  const historyQuery = useInfiniteQuery({
    ...trpc.visit.listSidebarHistory.infiniteQueryOptions(
      {
        pageSize: SIDEBAR_HISTORY_PAGE_SIZE,
        projectId: normalizedProjectId,
        sortBy,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    ),
  });

  const rawItems = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [historyQuery.data],
  );
  const items = useMemo(
    () =>
      rawItems.filter(
        (item) =>
          item.entityType !== "project"
          && (!normalizedProjectId || item.projectId === normalizedProjectId),
      ),
    [normalizedProjectId, rawItems],
  );

  const hasMore = Boolean(historyQuery.hasNextPage);
  const isFetchingNextPage = historyQuery.isFetchingNextPage;
  const { ref: loadMoreInViewRef, isInView: isLoadMoreInView } = useIsInView(loadMoreRef, {
    inView: hasMore,
    inViewMargin: LOAD_MORE_IN_VIEW_MARGIN,
  });

  useEffect(() => {
    if (!hasMore || !isLoadMoreInView || isFetchingNextPage) {
      return;
    }
    void historyQuery.fetchNextPage();
  }, [hasMore, historyQuery, isFetchingNextPage, isLoadMoreInView]);

  const chatSessionId = useAppView((state) => state.chatSessionId);
  const projectShell = useAppView((state) => state.projectShell);
  const activeBase = useLayoutState((state) => state.base);

  const isItemActive = useCallback(
    (item: SidebarHistoryItem) => {
      if (item.entityType === "chat") {
        return chatSessionId === item.chatId;
      }
      if (item.entityType === "project") {
        return (
          activeBase?.id === `project:${item.projectId}`
          || projectShell?.projectId === item.projectId
        );
      }
      const boardEntityId = resolveBoardEntityId(activeBase?.params?.boardFolderUri);
      const explicitBoardId =
        typeof activeBase?.params?.boardId === "string"
          ? activeBase.params.boardId.trim()
          : "";
      return (
        activeBase?.component === "board-viewer"
        && (boardEntityId === item.entityId || explicitBoardId === item.boardId)
      );
    },
    [activeBase, chatSessionId, projectShell?.projectId],
  );

  const handleHistoryItemClick = useCallback(
    (item: SidebarHistoryItem) => {
      if (item.entityType === "project") {
        nav.openProject({
          projectId: item.entityId,
          title: resolveHistoryItemTitle(item, t),
          rootUri: item.rootUri,
          icon: item.icon,
        });
        return;
      }
      if (item.entityType === "chat") {
        nav.openChat(item.chatId, resolveHistoryItemTitle(item, t), {
          projectId: item.projectId,
        });
        return;
      }
      nav.openBoard({
        boardId: item.boardId,
        title: resolveHistoryItemTitle(item, t),
        folderUri: item.folderUri,
        rootUri: item.rootUri,
        projectId: item.projectId,
      });
    },
    [nav, t],
  );

  if (historyQuery.isPending && items.length === 0) {
    return <SidebarHistorySkeleton />;
  }

  return (
    <SidebarGroup className="group flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 pt-3">
      <SidebarGroupLabel asChild>
        <div className="pr-2">
          <span className="flex-1">{t("historySection")}</span>
          <button
            type="button"
            aria-label={sortButtonLabel}
            title={sortButtonLabel}
            className={
              sortBy === "lastVisitedAt"
                ? "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-3xl bg-sidebar-accent/20 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/30 hover:text-sidebar-foreground/85"
                : "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-3xl text-sidebar-foreground/35 transition-colors hover:bg-sidebar-accent/20 hover:text-sidebar-foreground/60"
            }
            onClick={() => setSortBy(nextSortBy)}
          >
            <ArrowUpDown className="h-2.5 w-2.5" />
          </button>
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground/70">
            {t("historyEmpty")}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.recordId}>
                  <SidebarMenuButton
                    type="button"
                    isActive={isItemActive(item)}
                    className="h-10 items-center gap-3 px-2.5 py-2"
                    onClick={() => handleHistoryItemClick(item)}
                  >
                    {renderHistoryItemIcon(item)}
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {resolveHistoryItemTitle(item, t)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/60 tabular-nums">
                      {formatHistoryItemVisitedAt(
                        resolveHistoryItemVisitedAt(item, sortBy),
                        i18n.resolvedLanguage || i18n.language,
                      )}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            {hasMore ? (
              <div
                ref={loadMoreInViewRef}
                className="flex h-10 items-center justify-center text-xs text-muted-foreground/60"
                aria-hidden="true"
              >
                {isFetchingNextPage ? tCommon("loading") : null}
              </div>
            ) : null}
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
