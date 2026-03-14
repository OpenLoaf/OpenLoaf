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
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@openloaf/ui/command";
import { Kbd, KbdGroup } from "@openloaf/ui/kbd";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useAppState } from "@/hooks/use-app-state";
import { useProjects } from "@/hooks/use-projects";
import { useDebounce } from "@/hooks/use-debounce";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { resolveProjectModeProjectShell } from "@/lib/project-mode";
import { openProjectShellTab } from "@/lib/project-shell";
import { WORKBENCH_TAB_INPUT } from "@openloaf/api/common";
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
  const { t } = useTranslation('common');
  const navigate = useAppView((s) => s.navigate);
  const activeTab = useAppState();
  const activeProjectShell = React.useMemo(
    () => resolveProjectModeProjectShell(activeTab?.projectShell),
    [activeTab?.projectShell],
  );
  const projectMode = Boolean(activeProjectShell);
  const { data: projects = [] } = useProjects();
  /** 当前搜索框输入值。 */
  const [searchValue, setSearchValue] = React.useState("");
  /** 输入法合成状态。 */
  const [isComposing, setIsComposing] = React.useState(false);
  /** 已确认的搜索文本（用于请求）。 */
  const [committedSearchValue, setCommittedSearchValue] = React.useState("");
  /** 当前项目最近打开列表。 */
  const [recentProjectItems, setRecentProjectItems] = React.useState<RecentOpenItem[]>([]);
  /** 全局最近打开列表。 */
  const [recentGlobalItems, setRecentGlobalItems] = React.useState<RecentOpenItem[]>([]);
  /** 防抖搜索关键字。 */
  const debouncedSearchValue = useDebounce(committedSearchValue.trim(), 200);
  /** 当前搜索范围的项目 id。 */
  const [scopedProjectId, setScopedProjectId] = React.useState<string | null>(null);
  /** 标记用户是否手动清除了项目范围。 */
  const [projectCleared, setProjectCleared] = React.useState(false);
  /** 关闭动画期间保持内容渲染，避免先消失列表。 */
  const [isClosing, setIsClosing] = React.useState(false);
  const closeResetTimerRef = React.useRef<number | null>(null);
  const prevOpenRef = React.useRef(open);
  const projectHierarchy = React.useMemo(
    () => buildProjectHierarchyIndex(projects),
    [projects],
  );
  /** Refresh recent open lists for global and project scopes. */
  const refreshRecentItems = React.useCallback(() => {
    // 逻辑：只在弹层打开时刷新最近打开数据，避免无意义读写。
    const recent = getRecentOpens({
      projectId: scopedProjectId,
      limit: 5,
    });
    setRecentProjectItems(recent.project);
    setRecentGlobalItems(recent.global);
  }, [scopedProjectId]);
  /** 当前激活 Tab 的面板参数。 */
  const activeBaseParams = activeTab?.base?.params as Record<string, unknown> | undefined;
  /** 当前激活 Tab 的聊天参数。 */
  const activeChatParams = activeTab?.chatParams as Record<string, unknown> | undefined;
  const activeProjectId = React.useMemo(() => {
    const shellProjectId =
      typeof activeProjectShell?.projectId === "string" ? activeProjectShell.projectId : null;
    const baseProjectId =
      typeof activeBaseParams?.projectId === "string" ? activeBaseParams.projectId : null;
    const chatProjectId =
      typeof activeChatParams?.projectId === "string" ? activeChatParams.projectId : null;
    return shellProjectId ?? baseProjectId ?? chatProjectId ?? null;
  }, [activeBaseParams, activeChatParams, activeProjectShell?.projectId]);
  const scopedProjectTitle = React.useMemo(() => {
    if (!scopedProjectId) return null;
    return projectHierarchy.projectById.get(scopedProjectId)?.title;
  }, [projectHierarchy, scopedProjectId]);
  const scopedProjectRootUri = React.useMemo(() => {
    if (!scopedProjectId) return null;
    return (
      projectHierarchy.rootUriById.get(scopedProjectId) ??
      (activeProjectShell?.projectId === scopedProjectId ? activeProjectShell.rootUri : null)
    );
  }, [activeProjectShell?.projectId, activeProjectShell?.rootUri, projectHierarchy, scopedProjectId]);
  /** 是否触发搜索查询。 */
  const searchEnabled = Boolean(debouncedSearchValue);
  /** 缓存搜索结果，避免请求中列表闪烁。 */
  const [cachedFileResults, setCachedFileResults] = React.useState<SearchFileResult[]>([]);
  /** 项目范围内的搜索结果。 */
  const projectSearchQuery = useQuery({
    ...trpc.fs.search.queryOptions(
      searchEnabled && scopedProjectId && scopedProjectRootUri
        ? {
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
  /** 全部项目范围内的搜索结果。 */
  const allProjectsSearchQuery = useQuery({
    ...trpc.fs.searchAllProjects.queryOptions(
      searchEnabled && !scopedProjectId && !projectMode
        ? {
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
        projectTitle: scopedProjectTitle ?? t('untitledProject'),
        relativePath: entry.uri,
      }));
    }
    return allProjectsSearchQuery.data?.results ?? [];
  }, [
    projectSearchQuery.data?.results,
    scopedProjectId,
    scopedProjectTitle,
    searchEnabled,
    allProjectsSearchQuery.data?.results,
  ]);
  /** 当前搜索是否在请求中。 */
  const isSearchFetching = Boolean(
    searchEnabled &&
      (scopedProjectId ? projectSearchQuery.isFetching : allProjectsSearchQuery.isFetching),
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
      new CustomEvent("openloaf:overlay", {
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
    (input: { baseId: string; component: string; title?: string; titleKey?: string; icon: string }) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? '');

      // In single-view mode, check if current base already matches
      const currentBase = useLayoutState.getState().base;
      if (currentBase?.id === input.baseId) {
        handleOpenChange(false);
        return;
      }
      // ai-chat singleton check by title
      const currentTitle = useAppView.getState().title;
      if (input.component === "ai-chat" && !currentBase && currentTitle === tabTitle) {
        handleOpenChange(false);
        return;
      }

      navigate({
        title: tabTitle,
        icon: input.icon,
        leftWidthPercent: 70,
        base: {
          id: input.baseId,
          component: input.component,
        },
      });
      handleOpenChange(false);
    },
    [handleOpenChange, navigate],
  );
  /** Trigger AI chat with current search query. */
  const handleAiFallback = React.useCallback(() => {
    const query = committedSearchValue.trim() || searchValue.trim();
    if (!query) return;
    openSingletonTab(WORKBENCH_TAB_INPUT);
    // 逻辑：等待 ChatInput 挂载后再触发发送。
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("openloaf:chat-send-message", { detail: { text: query } })
      );
    }, 180);
  }, [committedSearchValue, openSingletonTab, searchValue]);
  /** 打开项目的文件系统定位到指定目录。 */
  const handleOpenProjectFileSystem = React.useCallback(
    (projectId: string, projectTitle: string, rootUri: string, targetUri: string) => {
      openProjectShellTab({
        projectId,
        rootUri,
        title: projectTitle || t('untitledProject'),
        icon: projectHierarchy.projectById.get(projectId)?.icon ?? undefined,
        tab: "files",
        baseParams: { fileUri: targetUri },
      });
      handleOpenChange(false);
    },
    [
      handleOpenChange,
      projectHierarchy.projectById,
      t,
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
    const handleRecentEvent = () => {
      refreshRecentItems();
    };
    window.addEventListener(RECENT_OPEN_EVENT, handleRecentEvent);
    return () => {
      window.removeEventListener(RECENT_OPEN_EVENT, handleRecentEvent);
    };
  }, [open, refreshRecentItems]);
  React.useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) {
      // 逻辑：仅在 open→closed 转换时启动关闭动画，避免 isClosing 循环触发。
      if (wasOpen) {
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
      }
      return;
    }
    if (closeResetTimerRef.current) {
      window.clearTimeout(closeResetTimerRef.current);
      closeResetTimerRef.current = null;
    }
    setIsClosing(false);
    if (projectCleared && !projectMode) return;
    // 逻辑：项目模式下全局搜索必须收敛到当前项目，不允许回退到项目空间范围。
    setScopedProjectId(activeProjectId);
  }, [activeProjectId, open, projectCleared, projectMode]);
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
          projectHierarchy.projectById.get(item.projectId)?.title ?? t('untitledProject');
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
  /** 全局最近打开结果。 */
  const recentGlobalResults = React.useMemo(
    () => buildRecentResults(recentGlobalItems),
    [buildRecentResults, recentGlobalItems],
  );
  /** 需要请求缩略图的结果集合。 */
  const thumbnailTargets = React.useMemo(() => {
    if (searchEnabled) return visibleFileResults;
    if (scopedProjectId) return recentProjectResults;
    return recentGlobalResults;
  }, [
    recentGlobalResults,
    recentProjectResults,
    scopedProjectId,
    searchEnabled,
    visibleFileResults,
  ]);
  /** 按项目分组构建缩略图请求列表。 */
  const thumbnailGroups = React.useMemo(() => {
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
  }, [thumbnailTargets]);
  /** 请求可见文件的缩略图数据。 */
  const thumbnailQueries = useQueries({
    queries: thumbnailGroups.map((group) => {
      const queryOptions = trpc.fs.thumbnails.queryOptions(
        group.uris.length
          ? { projectId: group.projectId, uris: group.uris }
          : skipToken,
      );
      return {
        ...(queryOptions as unknown as Record<string, unknown>),
        queryKey: queryOptions.queryKey,
        queryFn: queryOptions.queryFn,
        enabled: Boolean(group.uris.length),
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
      const projectTitle = result.projectTitle;
      const rootUri = projectHierarchy.rootUriById.get(result.projectId) ?? "";
      const displayPath = result.relativePath || result.entry.uri;
      const handleSelect = () => {
        if (result.entry.kind === "folder" && !isBoardFolderName(result.entry.name)) {
          handleOpenProjectFileSystem(result.projectId, projectTitle, rootUri, result.entry.uri);
          return;
        }
        openFilePreview({
          entry: result.entry,
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
    return t('currentProject');
  }, [recentProjectResults, scopedProjectTitle, t]);
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
      title={t('searchTitle')}
      description={t('searchDescription')}
      className="top-[25%] max-h-[70vh] translate-y-0 sm:max-w-xl openloaf-thinking-border openloaf-thinking-border-on border-transparent"
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
        placeholder={t('searchPlaceholder')}
        projectTitle={scopedProjectTitle}
        onClearProject={projectMode ? undefined : handleClearProject}
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
              {aiFallbackQuery ? t('askAiQuery', { query: aiFallbackQuery }) : t('askAi')}
              <CommandShortcut>
                <Kbd>↵</Kbd>
              </CommandShortcut>
            </CommandItem>
          </CommandGroup>
        ) : null}
        {visibleFileResults.length > 0 ? (
          <CommandGroup heading={t('files')}>
            {visibleFileResults.map((result) => renderFileResult(result))}
          </CommandGroup>
        ) : null}
        {showQuickOpen ? (
          <>
            {!projectMode ? (
              <CommandGroup heading={t('quickOpen')}>
                <CommandItem
                  value="calendar"
                  onSelect={() =>
                    openSingletonTab({
                      baseId: "base:calendar",
                      component: "calendar-page",
                      title: t('calendar'),
                      icon: "🗓️",
                    })
                  }
                >
                  <CalendarDays className="h-5 w-5" />
                  <span>{t('calendar')}</span>
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
                      title: t('inbox'),
                      icon: "📥",
                    })
                  }
                >
                  <Inbox className="h-5 w-5" />
                  <span>{t('inbox')}</span>
                  <CommandShortcut>
                    <KbdGroup className="gap-1">
                      <Kbd>⌘</Kbd>
                      <Kbd>I</Kbd>
                    </KbdGroup>
                  </CommandShortcut>
                </CommandItem>
                <CommandItem
                  value="workbench"
                  onSelect={() => openSingletonTab(WORKBENCH_TAB_INPUT)}
                >
                  <Sparkles className="h-5 w-5" />
                  <span>{t('workbench')}</span>
                  <CommandShortcut>
                    <KbdGroup className="gap-1">
                      <Kbd>⌘</Kbd>
                      <Kbd>T</Kbd>
                    </KbdGroup>
                  </CommandShortcut>
                </CommandItem>
                <CommandItem
                  value="template"
                  onSelect={() =>
                    openSingletonTab({
                      baseId: "base:template",
                      component: "template-page",
                      title: t('template'),
                      icon: "📄",
                    })
                  }
                >
                  <LayoutTemplate className="h-5 w-5" />
                  <span>{t('template')}</span>
                  <CommandShortcut>
                    <KbdGroup className="gap-1">
                      <Kbd>⌘</Kbd>
                      <Kbd>J</Kbd>
                    </KbdGroup>
                  </CommandShortcut>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {recentProjectResults.length > 0 ? (
              <CommandGroup heading={t('recentOpenProject', { title: recentProjectHeading })}>
                {recentProjectResults.map((result) =>
                  renderFileResult(result, { hideProjectTitle: true }),
                )}
              </CommandGroup>
            ) : null}
            {!projectMode && !scopedProjectId && recentGlobalResults.length > 0 ? (
              <CommandGroup heading={t('recentOpenProjectSpace')}>
                {recentGlobalResults.map((result) => renderFileResult(result))}
              </CommandGroup>
            ) : null}
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
