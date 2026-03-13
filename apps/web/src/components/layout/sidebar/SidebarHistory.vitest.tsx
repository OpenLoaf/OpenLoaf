/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SidebarHistoryPage } from "@openloaf/api";
import { SidebarHistory } from "./SidebarHistory";

const translationMap: Record<string, string> = {
  historySection: "History",
  historyEmpty: "No history yet",
  historySortByFirstVisit: "Sort by first visit",
  historySortByLastVisit: "Sort by recent visit",
  historyToday: "Today",
  historyYesterday: "Yesterday",
  historyLast7Days: "Last 7 Days",
  historyEarlier: "Earlier",
  project: "Project",
  chat: "Chat",
  canvas: "Canvas",
  "projectListPage.untitled": "Untitled Project",
  "canvasList.untitled": "Untitled Canvas",
  loading: "Loading…",
};

const openChatMock = vi.fn();
const openProjectMock = vi.fn();
const openBoardMock = vi.fn();
const fetchNextPageMock = vi.fn();
const useInfiniteQueryMock = vi.fn();
const useIsInViewMock = vi.fn();

const appViewState = {
  chatSessionId: "",
  chatParams: {},
  projectShell: null,
};

const layoutState = {
  base: undefined as { id?: string; component?: string; params?: Record<string, unknown> } | undefined,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translationMap[key] ?? key,
    i18n: {
      resolvedLanguage: "en-US",
      language: "en-US",
    },
  }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useInfiniteQuery: (...args: unknown[]) => useInfiniteQueryMock(...args),
  };
});

vi.mock("@/utils/trpc", () => ({
  trpc: {
    visit: {
      listSidebarHistory: {
        infiniteQueryOptions: (input: unknown) => ({
          queryKey: ["visit", "listSidebarHistory", input],
          queryFn: vi.fn(),
        }),
      },
    },
  },
}));

vi.mock("@/hooks/use-is-in-view", () => ({
  useIsInView: (...args: unknown[]) => useIsInViewMock(...args),
}));

vi.mock("@/hooks/use-sidebar-navigation", () => ({
  useSidebarNavigation: () => ({
    openChat: openChatMock,
    openProject: openProjectMock,
    openBoard: openBoardMock,
  }),
}));

vi.mock("@/hooks/use-app-view", () => ({
  useAppView: (selector: (state: typeof appViewState) => unknown) => selector(appViewState),
}));

vi.mock("@/hooks/use-layout-state", () => ({
  useLayoutState: (selector: (state: typeof layoutState) => unknown) => selector(layoutState),
}));

vi.mock("@openloaf/ui/sidebar", () => ({
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupAction: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  SidebarMenuSkeleton: () => <div>Skeleton</div>,
}));

function buildHistoryPage(items: SidebarHistoryPage["items"]): SidebarHistoryPage {
  return {
    items,
    nextCursor: null,
    pageSize: 30,
    hasMore: false,
  };
}

function formatVisitedAtForTest(value: Date): string {
  const now = new Date();
  const sameDay =
    value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(value);
  }

  const sameYear = value.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

describe("SidebarHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T12:00:00.000Z"));
    openChatMock.mockReset();
    openProjectMock.mockReset();
    openBoardMock.mockReset();
    fetchNextPageMock.mockReset();
    useIsInViewMock.mockReturnValue({ ref: vi.fn(), isInView: false });
    useInfiniteQueryMock.mockReturnValue({
      data: {
        pages: [buildHistoryPage([])],
      },
      isPending: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: fetchNextPageMock,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders flat history rows and hides project records", () => {
    const chatVisitedAt = new Date("2026-03-11T11:30:00.000Z");
    const boardVisitedAt = new Date("2026-03-01T08:00:00.000Z");
    useInfiniteQueryMock.mockReturnValue({
      data: {
        pages: [buildHistoryPage([
          {
            recordId: "visit_chat",
            entityType: "chat",
            entityId: "chat_alpha",
            chatId: "chat_alpha",
            title: "Alpha Chat",
            projectId: "proj_alpha",
            projectTitle: "Attached Project",
            dateKey: "2026-03-11",
            firstVisitedAt: chatVisitedAt,
            lastVisitedAt: chatVisitedAt,
          },
          {
            recordId: "visit_project",
            entityType: "project",
            entityId: "proj_alpha",
            projectId: "proj_alpha",
            title: "Alpha Project",
            icon: "📁",
            rootUri: "file:///project-root/projects/alpha",
            dateKey: "2026-03-10",
            firstVisitedAt: new Date("2026-03-10T10:00:00.000Z"),
            lastVisitedAt: new Date("2026-03-10T10:00:00.000Z"),
          },
          {
            recordId: "visit_board",
            entityType: "board",
            entityId: "board_alpha",
            boardId: "board_alpha",
            title: "Alpha Board",
            folderUri: ".openloaf/boards/board_alpha/",
            rootUri: "file:///project-space",
            projectId: null,
            projectTitle: null,
            dateKey: "2026-03-01",
            firstVisitedAt: boardVisitedAt,
            lastVisitedAt: boardVisitedAt,
          },
        ])],
      },
      isPending: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: fetchNextPageMock,
    });

    render(<SidebarHistory />);

    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
    expect(screen.queryByText("Earlier")).not.toBeInTheDocument();
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Canvas")).not.toBeInTheDocument();
    expect(screen.queryByText("Attached Project")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alpha Project/i })).not.toBeInTheDocument();
    expect(screen.getByText(formatVisitedAtForTest(chatVisitedAt))).toBeInTheDocument();
    expect(screen.getByText(formatVisitedAtForTest(boardVisitedAt))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Alpha Chat/i }));
    expect(openChatMock).toHaveBeenCalledWith("chat_alpha", "Alpha Chat", {
      projectId: "proj_alpha",
    });

    fireEvent.click(screen.getByRole("button", { name: /Alpha Board/i }));
    expect(openBoardMock).toHaveBeenCalledWith({
      boardId: "board_alpha",
      title: "Alpha Board",
      folderUri: ".openloaf/boards/board_alpha/",
      rootUri: "file:///project-space",
      projectId: null,
    });
  });

  it("fetches the next page when the sentinel enters view", async () => {
    useIsInViewMock.mockReturnValue({ ref: vi.fn(), isInView: true });
    useInfiniteQueryMock.mockReturnValue({
      data: {
        pages: [buildHistoryPage([
          {
            recordId: "visit_chat",
            entityType: "chat",
            entityId: "chat_alpha",
            chatId: "chat_alpha",
            title: "Alpha Chat",
            projectId: null,
            projectTitle: null,
            dateKey: "2026-03-11",
            firstVisitedAt: new Date("2026-03-11T11:30:00.000Z"),
            lastVisitedAt: new Date("2026-03-11T11:30:00.000Z"),
          },
        ])],
      },
      isPending: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: fetchNextPageMock,
    });

    render(<SidebarHistory />);

    await Promise.resolve();
    expect(fetchNextPageMock).toHaveBeenCalledTimes(1);
  });

  it("toggles history sorting to last visit time from the header action", () => {
    const defaultPage = buildHistoryPage([
      {
        recordId: "visit_chat_beta",
        entityType: "chat",
        entityId: "chat_beta",
        chatId: "chat_beta",
        title: "Beta Chat",
        projectId: null,
        projectTitle: null,
        dateKey: "2026-03-11",
        firstVisitedAt: new Date("2026-03-11T09:00:00.000Z"),
        lastVisitedAt: new Date("2026-03-11T09:00:00.000Z"),
      },
      {
        recordId: "visit_chat_alpha",
        entityType: "chat",
        entityId: "chat_alpha",
        chatId: "chat_alpha",
        title: "Alpha Chat",
        projectId: null,
        projectTitle: null,
        dateKey: "2026-03-11",
        firstVisitedAt: new Date("2026-03-11T08:00:00.000Z"),
        lastVisitedAt: new Date("2026-03-11T10:00:00.000Z"),
      },
    ]);
    const lastVisitedPage = buildHistoryPage([
      {
        recordId: "visit_chat_alpha",
        entityType: "chat",
        entityId: "chat_alpha",
        chatId: "chat_alpha",
        title: "Alpha Chat",
        projectId: null,
        projectTitle: null,
        dateKey: "2026-03-11",
        firstVisitedAt: new Date("2026-03-11T08:00:00.000Z"),
        lastVisitedAt: new Date("2026-03-11T10:00:00.000Z"),
      },
      {
        recordId: "visit_chat_beta",
        entityType: "chat",
        entityId: "chat_beta",
        chatId: "chat_beta",
        title: "Beta Chat",
        projectId: null,
        projectTitle: null,
        dateKey: "2026-03-11",
        firstVisitedAt: new Date("2026-03-11T09:00:00.000Z"),
        lastVisitedAt: new Date("2026-03-11T09:00:00.000Z"),
      },
    ]);

    useInfiniteQueryMock.mockImplementation((options: { queryKey?: unknown[] }) => {
      const input = options.queryKey?.[2] as { sortBy?: string } | undefined;
      const page = input?.sortBy === "lastVisitedAt" ? lastVisitedPage : defaultPage;
      return {
        data: { pages: [page] },
        isPending: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: fetchNextPageMock,
      };
    });

    render(<SidebarHistory />);

    expect(useInfiniteQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ["visit", "listSidebarHistory", expect.objectContaining({ sortBy: "firstVisitedAt" })],
      }),
    );
    expect(screen.getByText(formatVisitedAtForTest(new Date("2026-03-11T09:00:00.000Z")))).toBeInTheDocument();
    expect(screen.queryByText(formatVisitedAtForTest(new Date("2026-03-11T10:00:00.000Z")))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sort by recent visit" }));

    expect(useInfiniteQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ["visit", "listSidebarHistory", expect.objectContaining({ sortBy: "lastVisitedAt" })],
      }),
    );
    expect(screen.getByText(formatVisitedAtForTest(new Date("2026-03-11T10:00:00.000Z")))).toBeInTheDocument();
  });

  it("keeps only chat and board records when rendering project sidebar history", () => {
    useInfiniteQueryMock.mockReturnValue({
      data: {
        pages: [buildHistoryPage([
          {
            recordId: "visit_project",
            entityType: "project",
            entityId: "proj_alpha",
            projectId: "proj_alpha",
            title: "Alpha Project",
            icon: "📁",
            rootUri: "file:///project-root/projects/alpha",
            dateKey: "2026-03-11",
            firstVisitedAt: new Date("2026-03-11T11:30:00.000Z"),
            lastVisitedAt: new Date("2026-03-11T11:30:00.000Z"),
          },
          {
            recordId: "visit_chat",
            entityType: "chat",
            entityId: "chat_alpha",
            chatId: "chat_alpha",
            title: "Alpha Chat",
            projectId: "proj_alpha",
            projectTitle: "Alpha Project",
            dateKey: "2026-03-11",
            firstVisitedAt: new Date("2026-03-11T11:00:00.000Z"),
            lastVisitedAt: new Date("2026-03-11T11:00:00.000Z"),
          },
        ])],
      },
      isPending: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: fetchNextPageMock,
    });

    render(<SidebarHistory projectId="proj_alpha" />);

    expect(screen.queryByRole("button", { name: /Alpha Project/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alpha Chat/i })).toBeInTheDocument();
  });
});
