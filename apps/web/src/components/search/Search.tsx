"use client";

import * as React from "react";
import {
  CommandDialog,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@tenas-ai/ui/command";
import { Kbd, KbdGroup } from "@tenas-ai/ui/kbd";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabView } from "@/hooks/use-tab-view";
import { useProjects } from "@/hooks/use-projects";
import { useDebounce } from "@/hooks/use-debounce";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { AI_CHAT_TAB_INPUT } from "@tenas-ai/api/common";
import { trpc } from "@/utils/trpc";
import { useQueries, skipToken, useQuery } from "@tanstack/react-query";
import { CalendarDays, Inbox, LayoutTemplate, Sparkles } from "lucide-react";
import { SearchInput } from "./SearchInput";
import { getEntryVisual } from "@/components/project/filesystem/components/FileSystemEntryVisual";
import { openFilePreview } from "@/components/file/lib/open-file";
import { isBoardFolderName } from "@/lib/file-name";
import {
  formatSize,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  getRecentOpens,
  RECENT_OPEN_EVENT,
  type RecentOpenItem,
} from "@/components/file/lib/recent-open";

type SearchFileResult = {
  entry: FileSystemEntry;
  projectId: string;
  projectTitle: string;
  relativePath: string;
};

const padTwoDigits = (value: number) => value.toString().padStart(2, "0");

const formatSearchTimestamp = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear() % 100;
  const month = padTwoDigits(date.getMonth() + 1);
  const day = padTwoDigits(date.getDate());
  const hour = padTwoDigits(date.getHours());
  const minute = padTwoDigits(date.getMinutes());
  return `${padTwoDigits(year)}-${month}-${day} ${hour}:${minute}`;
};

export function Search({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspace: activeWorkspace } = useWorkspace();
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const setTabBaseParams = useTabRuntime((s) => s.setTabBaseParams);
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeTab = useTabView(activeTabId ?? undefined);
  const { data: projects = [] } = useProjects();
  /** 当前搜索框输入值。 */
  const [searchValue, setSearchValue] = React.useState("");
  /** 输入法合成状态。 */
  const [isComposing, setIsComposing] = React.useState(false);
  /** 已确认的搜索文本（用于请求）。 */
  const [committedSearchValue, setCommittedSearchValue] = React.useState("");
  /** 当前项目最近打开列表。 */
  const [recentProjectItems, setRecentProjectItems] = React.useState<RecentOpenItem[]>([]);
  /** 工作区最近打开列表。 */
  const [recentWorkspaceItems, setRecentWorkspaceItems] = React.useState<RecentOpenItem[]>([]);
  /** 防抖搜索关键字。 */
  const debouncedSearchValue = useDebounce(committedSearchValue.trim(), 200);
  /** 当前搜索范围的项目 id。 */
  const [scopedProjectId, setScopedProjectId] = React.useState<string | null>(null);
  /** 标记用户是否手动清除了项目范围。 */
  const [projectCleared, setProjectCleared] = React.useState(false);
  /** 关闭动画期间保持内容渲染，避免先消失列表。 */
  const [isClosing, setIsClosing] = React.useState(false);
  const closeResetTimerRef = React.useRef<number | null>(null);
  const projectHierarchy = React.useMemo(
    () => buildProjectHierarchyIndex(projects),
    [projects],
  );
  /** Refresh recent open lists for workspace and project scopes. */
  const refreshRecentItems = React.useCallback(() => {
    if (!activeWorkspace?.id) {
      setRecentProjectItems([]);
      setRecentWorkspaceItems([]);
      return;
    }
    // 逻辑：只在弹层打开时刷新最近打开数据，避免无意义读写。
    const recent = getRecentOpens({
      workspaceId: activeWorkspace.id,
      projectId: scopedProjectId,
      limit: 5,
    });
    setRecentProjectItems(recent.project);
    setRecentWorkspaceItems(recent.workspace);
  }, [activeWorkspace?.id, scopedProjectId]);
  /** 当前激活 Tab 的面板参数。 */
  const activeBaseParams = activeTab?.base?.params as Record<string, unknown> | undefined;
  /** 当前激活 Tab 的聊天参数。 */
  const activeChatParams = activeTab?.chatParams as Record<string, unknown> | undefined;
  const activeProjectId = React.useMemo(() => {
    const baseProjectId =
      typeof activeBaseParams?.projectId === "string" ? activeBaseParams.projectId : null;
    const chatProjectId =
      typeof activeChatParams?.projectId === "string" ? activeChatParams.projectId : null;
    return baseProjectId ?? chatProjectId ?? null;
  }, [activeBaseParams, activeChatParams]);
  const scopedProjectTitle = React.useMemo(() => {
    if (!scopedProjectId) return null;
    return projectHierarchy.projectById.get(scopedProjectId)?.title ?? "未命名项目";
  }, [projectHierarchy, scopedProjectId]);
  const scopedProjectRootUri = React.useMemo(() => {
    if (!scopedProjectId) return null;
    return projectHierarchy.rootUriById.get(scopedProjectId) ?? null;
  }, [projectHierarchy, scopedProjectId]);
  /** 是否触发搜索查询。 */
  const searchEnabled = Boolean(debouncedSearchValue);
  /** 缓存搜索结果，避免请求中列表闪烁。 */
  const [cachedFileResults, setCachedFileResults] = React.useState<SearchFileResult[]>([]);
  /** 项目范围内的搜索结果。 */
  const projectSearchQuery = useQuery({
    ...trpc.fs.search.queryOptions(
      searchEnabled && scopedProjectId && scopedProjectRootUri && activeWorkspace?.id
        ? {
            workspaceId: activeWorkspace.id,
            projectId: scopedProjectId,
            rootUri: scopedProjectRootUri,
            query: debouncedSearchValue,
            includeHidden: false,
            limit: 20,
            maxDepth: 12,
          }
        : skipToken,
    ),
  });
  /** 工作区范围内的搜索结果。 */
  const workspaceSearchQuery = useQuery({
    ...trpc.fs.searchWorkspace.queryOptions(
      searchEnabled && !scopedProjectId && activeWorkspace?.id
        ? {
            workspaceId: activeWorkspace.id,
            query: debouncedSearchValue,
            includeHidden: false,
            limit: 20,
            maxDepth: 12,
          }
        : skipToken,
    ),
  });
  /** 当前搜索最新返回的结果集合。 */
  const latestFileResults = React.useMemo((): SearchFileResult[] => {
    if (!searchEnabled) return [];
    if (scopedProjectId) {
      const results = projectSearchQuery.data?.results ?? [];
      return results.map((entry) => ({
        entry,
        projectId: scopedProjectId,
        projectTitle: scopedProjectTitle ?? "未命名项目",
        relativePath: entry.uri,
      }));
    }
    return workspaceSearchQuery.data?.results ?? [];
  }, [
    projectSearchQuery.data?.results,
    scopedProjectId,
    scopedProjectTitle,
    searchEnabled,
    workspaceSearchQuery.data?.results,
  ]);
  /** 当前搜索是否在请求中。 */
  const isSearchFetching = Boolean(
    searchEnabled &&
      (scopedProjectId ? projectSearchQuery.isFetching : workspaceSearchQuery.isFetching),
  );
  /** 实际渲染用的结果集合。 */
  const visibleFileResults = isSearchFetching ? cachedFileResults : latestFileResults;

  React.useEffect(() => {
    // 逻辑：搜索未开始时清空缓存，避免旧结果残留。
    if (!searchEnabled) {
      setCachedFileResults([]);
      return;
    }
    if (isSearchFetching) return;
    setCachedFileResults(latestFileResults);
  }, [isSearchFetching, latestFileResults, searchEnabled]);
  const dispatchOverlay = React.useCallback((nextOpen: boolean) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("tenas:overlay", {
        detail: { id: "search", open: nextOpen },
      }),
    );
  }, []);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      dispatchOverlay(nextOpen);
      onOpenChange(nextOpen);
    },
    [dispatchOverlay, onOpenChange],
  );
  const handleClearProject = React.useCallback(() => {
    // 逻辑：仅清除项目范围，保留已输入的搜索文本。
    setScopedProjectId(null);
    setProjectCleared(true);
  }, []);
  const keepAllFilter = React.useCallback(() => 1, []);
  const openSingletonTab = React.useCallback(
    (input: { baseId: string; component: string; title: string; icon: string }) => {
      if (!activeWorkspace) return;

      const state = useTabs.getState();
      const runtimeByTabId = useTabRuntime.getState().runtimeByTabId;
      const existing = state.tabs.find((tab) => {
        if (tab.workspaceId !== activeWorkspace.id) return false;
        if (runtimeByTabId[tab.id]?.base?.id === input.baseId) return true;
        // ai-chat 的 base 会在 store 层被归一化为 undefined，因此需要用 title 做单例去重。
        if (input.component === "ai-chat" && !runtimeByTabId[tab.id]?.base && tab.title === input.title) return true;
        return false;
      });
      if (existing) {
        React.startTransition(() => {
          setActiveTab(existing.id);
        });
        handleOpenChange(false);
        return;
      }

      addTab({
        workspaceId: activeWorkspace.id,
        createNew: true,
        title: input.title,
        icon: input.icon,
        leftWidthPercent: 70,
        base: {
          id: input.baseId,
          component: input.component,
        },
      });
      handleOpenChange(false);
    },
    [activeWorkspace, addTab, handleOpenChange, setActiveTab],
  );
  /** Trigger AI chat with current search query. */
  const handleAiFallback = React.useCallback(() => {
    const query = committedSearchValue.trim() || searchValue.trim();
    if (!query) return;
    openSingletonTab(AI_CHAT_TAB_INPUT);
    // 逻辑：等待 ChatInput 挂载后再触发发送。
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("tenas:chat-send-message", { detail: { text: query } })
      );
    }, 180);
  }, [committedSearchValue, openSingletonTab, searchValue]);
  /** 打开项目的文件系统定位到指定目录。 */
  const handleOpenProjectFileSystem = React.useCallback(
    (projectId: string, projectTitle: string, rootUri: string, targetUri: string) => {
      if (!activeWorkspace?.id) return;
      const baseId = `project:${projectId}`;
      const runtimeByTabId = useTabRuntime.getState().runtimeByTabId;
      const existing = useTabs
        .getState()
        .tabs.find(
          (tab) =>
            tab.workspaceId === activeWorkspace.id &&
            runtimeByTabId[tab.id]?.base?.id === baseId,
        );
      if (existing) {
        React.startTransition(() => {
          setActiveTab(existing.id);
        });
        setTabBaseParams(existing.id, {
          projectTab: "files",
          fileUri: targetUri,
        });
        handleOpenChange(false);
        return;
      }
      addTab({
        workspaceId: activeWorkspace.id,
        createNew: true,
        title: projectTitle || "未命名项目",
        icon: projectHierarchy.projectById.get(projectId)?.icon ?? undefined,
        leftWidthPercent: 90,
        base: {
          id: baseId,
          component: "plant-page",
          params: { projectId, rootUri, projectTab: "files", fileUri: targetUri },
        },
        chatParams: { projectId },
      });
      handleOpenChange(false);
    },
    [
      activeWorkspace?.id,
      addTab,
      handleOpenChange,
      projectHierarchy.projectById,
      setActiveTab,
      setTabBaseParams,
    ],
  );

  React.useEffect(() => {
    dispatchOverlay(open);
    return () => {
      if (open) dispatchOverlay(false);
    };
  }, [dispatchOverlay, open]);
  React.useEffect(() => {
    if (!open) return;
    refreshRecentItems();
  }, [open, refreshRecentItems]);
  React.useEffect(() => {
    if (!open) return;
    const handleRecentEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
      if (detail?.workspaceId && detail.workspaceId !== activeWorkspace?.id) return;
      refreshRecentItems();
    };
    window.addEventListener(RECENT_OPEN_EVENT, handleRecentEvent);
    return () => {
      window.removeEventListener(RECENT_OPEN_EVENT, handleRecentEvent);
    };
  }, [activeWorkspace?.id, open, refreshRecentItems]);
  React.useEffect(() => {
    if (!open) {
      // 逻辑：等弹窗关闭动画结束后再清理状态，避免列表先消失导致闪断。
      if (closeResetTimerRef.current) {
        window.clearTimeout(closeResetTimerRef.current);
      }
      setIsClosing(true);
      closeResetTimerRef.current = window.setTimeout(() => {
        setSearchValue("");
        setCommittedSearchValue("");
        setIsComposing(false);
        setScopedProjectId(null);
        setProjectCleared(false);
        setIsClosing(false);
        closeResetTimerRef.current = null;
      }, 200);
      return;
    }
    if (closeResetTimerRef.current) {
      window.clearTimeout(closeResetTimerRef.current);
      closeResetTimerRef.current = null;
    }
    if (isClosing) {
      setIsClosing(false);
    }
    if (projectCleared) return;
    // 逻辑：搜索开启时同步当前项目范围。
    setScopedProjectId(activeProjectId);
  }, [activeProjectId, isClosing, open, projectCleared]);
  React.useEffect(() => {
    return () => {
      if (closeResetTimerRef.current) {
        window.clearTimeout(closeResetTimerRef.current);
      }
    };
  }, []);

  /** 是否展示空结果提示。 */
  const showEmptyState = searchEnabled && !isSearchFetching && visibleFileResults.length === 0;
  /** AI 搜索兜底项的命令值。 */
  const aiFallbackValue = React.useMemo(
    () => `ai ${committedSearchValue}`,
    [committedSearchValue],
  );
  /** 当前 AI 兜底展示的搜索文本。 */
  const aiFallbackQuery = React.useMemo(() => {
    const rawValue = searchValue.trim() || committedSearchValue.trim();
    if (!rawValue) return "";
    // 逻辑：展示部分输入，过长时截断避免占满行。
    const maxLength = 18;
    return rawValue.length > maxLength
      ? `${rawValue.slice(0, maxLength)}…`
      : rawValue;
  }, [committedSearchValue, searchValue]);
  /** 搜索期间隐藏快捷入口。 */
  const showQuickOpen = (open || isClosing) && !searchValue.trim();
  /** Build display results for recent open lists. */
  const buildRecentResults = React.useCallback(
    (items: RecentOpenItem[]): SearchFileResult[] => {
      return items.flatMap((item) => {
        if (!item.projectId) return [];
        if (!projectHierarchy.rootUriById.get(item.projectId)) return [];
        const entry: FileSystemEntry = {
          uri: item.fileUri,
          name: item.fileName,
          kind: item.kind,
          ext: item.ext ?? undefined,
        };
        const projectTitle =
          projectHierarchy.projectById.get(item.projectId)?.title ?? "未命名项目";
        return [
          {
            entry,
            projectId: item.projectId,
            projectTitle,
            relativePath: item.fileUri,
          },
        ];
      });
    },
    [projectHierarchy.projectById, projectHierarchy.rootUriById],
  );
  /** 当前项目最近打开结果。 */
  const recentProjectResults = React.useMemo(
    () => buildRecentResults(recentProjectItems),
    [buildRecentResults, recentProjectItems],
  );
  /** 工作区最近打开结果。 */
  const recentWorkspaceResults = React.useMemo(
    () => buildRecentResults(recentWorkspaceItems),
    [buildRecentResults, recentWorkspaceItems],
  );
  /** 需要请求缩略图的结果集合。 */
  const thumbnailTargets = React.useMemo(() => {
    if (searchEnabled) return visibleFileResults;
    if (scopedProjectId) return recentProjectResults;
    return recentWorkspaceResults;
  }, [
    recentProjectResults,
    recentWorkspaceResults,
    scopedProjectId,
    searchEnabled,
    visibleFileResults,
  ]);
  /** 按项目分组构建缩略图请求列表。 */
  const thumbnailGroups = React.useMemo(() => {
    if (!activeWorkspace?.id) return [];
    const grouped = new Map<string, string[]>();
    for (const result of thumbnailTargets) {
      if (result.entry.kind !== "file") continue;
      const list = grouped.get(result.projectId) ?? [];
      list.push(result.entry.uri);
      grouped.set(result.projectId, list);
    }
    return Array.from(grouped.entries()).map(([projectId, uris]) => ({
      projectId,
      uris: Array.from(new Set(uris)).slice(0, 50),
    }));
  }, [activeWorkspace?.id, thumbnailTargets]);
  /** 请求可见文件的缩略图数据。 */
  const thumbnailQueries = useQueries({
    queries: thumbnailGroups.map((group) => {
      const queryOptions = trpc.fs.thumbnails.queryOptions(
        group.uris.length && activeWorkspace?.id
          ? { workspaceId: activeWorkspace.id, projectId: group.projectId, uris: group.uris }
          : skipToken,
      );
      return {
        ...(queryOptions as unknown as Record<string, unknown>),
        queryKey: queryOptions.queryKey,
        queryFn: queryOptions.queryFn,
        enabled: Boolean(group.uris.length) && Boolean(activeWorkspace?.id),
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
      };
    }),
  });
  /** 建立缩略图查询结果索引。 */
  const thumbnailByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    thumbnailQueries.forEach((query, index) => {
      const group = thumbnailGroups[index];
      if (!group || !query?.data) return;
      const items = (query.data as { items?: Array<{ uri: string; dataUrl: string }> }).items;
      for (const item of items ?? []) {
        map.set(`${group.projectId}:${item.uri}`, item.dataUrl);
      }
    });
    return map;
  }, [thumbnailGroups, thumbnailQueries]);
  /** 渲染文件搜索结果条目。 */
  const renderFileResult = React.useCallback(
    (
      result: SearchFileResult,
      options?: {
        /** 是否隐藏项目名称。 */
        hideProjectTitle?: boolean;
      },
    ) => {
      const projectTitle = result.projectTitle || "未命名项目";
      const rootUri = projectHierarchy.rootUriById.get(result.projectId) ?? "";
      const displayPath = result.relativePath || result.entry.uri;
      const handleSelect = () => {
        if (result.entry.kind === "folder" && !isBoardFolderName(result.entry.name)) {
          handleOpenProjectFileSystem(result.projectId, projectTitle, rootUri, result.entry.uri);
          return;
        }
        if (!activeTabId) return;
        openFilePreview({
          entry: result.entry,
          tabId: activeTabId,
          projectId: result.projectId,
          rootUri,
          mode: "stack",
        });
        handleOpenChange(false);
      };
      const itemValue = `${result.entry.name} ${displayPath} ${projectTitle}`;
      const thumbnailSrc = thumbnailByKey.get(`${result.projectId}:${result.entry.uri}`);
      const subtitle = options?.hideProjectTitle
        ? displayPath
        : `${projectTitle} / ${displayPath}`;
      const sizeLabel =
        result.entry.kind === "file" && result.entry.size !== undefined
          ? formatSize(result.entry.size)
          : null;
      const updatedLabel = formatSearchTimestamp(result.entry.updatedAt);
      const metaParts = [sizeLabel, updatedLabel].filter(Boolean);
      const metaLabel = metaParts.length > 0 ? metaParts.join(" · ") : null;
      return (
        <CommandItem
          key={`${result.projectId}:${result.entry.uri}`}
          value={itemValue}
          onSelect={handleSelect}
        >
          <div className="flex shrink-0 items-center justify-center [&>div]:!h-6 [&>div]:!w-6 [&>div]:!aspect-square [&>svg]:!h-6 [&>svg]:!w-6 [&_img]:!object-cover">
            {getEntryVisual({
              kind: result.entry.kind,
              name: result.entry.name,
              ext: result.entry.ext,
              isEmpty: result.entry.isEmpty,
              thumbnailSrc,
              sizeClassName: "h-6 w-6",
              thumbnailIconClassName: "h-full w-full p-1 text-muted-foreground",
              forceSquare: true,
            })}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0 flex-1 truncate">{result.entry.name}</div>
              {metaLabel ? (
                <div className="shrink-0 text-[11px] text-muted-foreground/70">{metaLabel}</div>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
          </div>
        </CommandItem>
      );
    },
    [
      activeTabId,
      handleOpenChange,
      handleOpenProjectFileSystem,
      projectHierarchy.rootUriById,
      thumbnailByKey,
    ],
  );
  /** 当前项目最近打开的标题。 */
  const recentProjectHeading = React.useMemo(() => {
    if (scopedProjectTitle?.trim()) return scopedProjectTitle;
    if (recentProjectResults[0]?.projectTitle) return recentProjectResults[0].projectTitle;
    return "当前项目";
  }, [recentProjectResults, scopedProjectTitle]);
  /** 搜索输入更新：输入法组合时只更新展示值，不触发查询。 */
  const handleSearchValueChange = React.useCallback(
    (nextValue: string) => {
      setSearchValue(nextValue);
      if (isComposing) return;
      setCommittedSearchValue(nextValue);
    },
    [isComposing],
  );
  const handleCompositionStart = React.useCallback(() => {
    setIsComposing(true);
  }, []);
  const handleCompositionEnd = React.useCallback(
    (event: React.CompositionEvent<HTMLInputElement>) => {
      const nextValue = event.currentTarget.value;
      setSearchValue(nextValue);
      setCommittedSearchValue(nextValue);
      setIsComposing(false);
    },
    [],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="搜索"
      description="搜索并快速打开功能"
      className="top-[25%] max-h-[70vh] translate-y-0 sm:max-w-xl tenas-thinking-border tenas-thinking-border-on border-transparent"
      showCloseButton={false}
      overlayClassName="backdrop-blur-sm bg-black/60"
      commandProps={{
        shouldFilter: false,
        filter: keepAllFilter,
        value: showEmptyState ? aiFallbackValue : undefined,
      }}
    >
      <SearchInput
        value={searchValue}
        onValueChange={handleSearchValueChange}
        placeholder="搜索…"
        projectTitle={scopedProjectTitle}
        onClearProject={handleClearProject}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
      <CommandList className="flex-1 min-h-0 max-h-[60vh] overflow-y-auto show-scrollbar">
        {showEmptyState ? (
          <CommandGroup>
            <CommandItem
              value={aiFallbackValue}
              onSelect={handleAiFallback}
            >
              <Sparkles className="h-5 w-5" />
              {aiFallbackQuery ? `让 AI 回答「${aiFallbackQuery}」` : "让 AI 回答"}
              <CommandShortcut>
                <Kbd>↵</Kbd>
              </CommandShortcut>
            </CommandItem>
          </CommandGroup>
        ) : null}
        {visibleFileResults.length > 0 ? (
          <CommandGroup heading="文件">
            {visibleFileResults.map((result) => renderFileResult(result))}
          </CommandGroup>
        ) : null}
        {showQuickOpen ? (
          <>
            <CommandGroup heading="快速打开">
              <CommandItem
                value="calendar"
                onSelect={() =>
                  openSingletonTab({
                    baseId: "base:calendar",
                    component: "calendar-page",
                    title: "日历",
                    icon: "🗓️",
                  })
                }
              >
                <CalendarDays className="h-5 w-5" />
                <span>日历</span>
                <CommandShortcut>
                  <KbdGroup className="gap-1">
                    <Kbd>⌘</Kbd>
                    <Kbd>L</Kbd>
                  </KbdGroup>
                </CommandShortcut>
              </CommandItem>
              <CommandItem
                value="inbox"
                onSelect={() =>
                  openSingletonTab({
                    baseId: "base:inbox",
                    component: "inbox-page",
                    title: "收集箱",
                    icon: "📥",
                  })
                }
              >
                <Inbox className="h-5 w-5" />
                <span>收集箱</span>
                <CommandShortcut>
                  <KbdGroup className="gap-1">
                    <Kbd>⌘</Kbd>
                    <Kbd>I</Kbd>
                  </KbdGroup>
                </CommandShortcut>
              </CommandItem>
              <CommandItem value="ai" onSelect={() => openSingletonTab(AI_CHAT_TAB_INPUT)}>
                <Sparkles className="h-5 w-5" />
                <span>AI助手</span>
                <CommandShortcut>
                  <KbdGroup className="gap-1">
                    <Kbd>⌘</Kbd>
                    <Kbd>J</Kbd>
                  </KbdGroup>
                </CommandShortcut>
              </CommandItem>
              <CommandItem
                value="template"
                onSelect={() =>
                  openSingletonTab({
                    baseId: "base:template",
                    component: "template-page",
                    title: "模版",
                    icon: "📄",
                  })
                }
              >
                <LayoutTemplate className="h-5 w-5" />
                <span>模版</span>
                <CommandShortcut>
                  <KbdGroup className="gap-1">
                    <Kbd>⌘</Kbd>
                    <Kbd>T</Kbd>
                  </KbdGroup>
                </CommandShortcut>
              </CommandItem>
            </CommandGroup>
            {recentProjectResults.length > 0 ? (
              <CommandGroup heading={`最近打开（${recentProjectHeading}）`}>
                {recentProjectResults.map((result) =>
                  renderFileResult(result, { hideProjectTitle: true }),
                )}
              </CommandGroup>
            ) : null}
            {!scopedProjectId && recentWorkspaceResults.length > 0 ? (
              <CommandGroup heading="最近打开（工作区）">
                {recentWorkspaceResults.map((result) => renderFileResult(result))}
              </CommandGroup>
            ) : null}
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
