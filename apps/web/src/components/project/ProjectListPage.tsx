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

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Plus,
  Edit2,
  Trash2,
  MoreHorizontal,
  Search,
  Square,
  X,
  Star,
  GitBranch,
  Layers3,
  Filter,
  FolderSearch,
} from "lucide-react";
import { useInfiniteQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { getCachedAccessToken } from "@/lib/saas-auth";

import { useIsInView } from "@/hooks/use-is-in-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useProjectOpen } from "@/hooks/use-project-open";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import type { ProjectListItem } from "@openloaf/api/services/projectTreeService";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@openloaf/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openloaf/ui/tooltip";

const CARD_GRADIENTS = [
  "from-sky-100 to-blue-50 dark:from-sky-900/40 dark:to-blue-900/30",
  "from-violet-100 to-purple-50 dark:from-violet-900/40 dark:to-purple-900/30",
  "from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/30",
  "from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/30",
  "from-rose-100 to-pink-50 dark:from-rose-900/40 dark:to-pink-900/30",
  "from-teal-100 to-cyan-50 dark:from-teal-900/40 dark:to-cyan-900/30",
  "from-indigo-100 to-blue-50 dark:from-indigo-900/40 dark:to-blue-900/30",
  "from-lime-100 to-yellow-50 dark:from-lime-900/40 dark:to-yellow-900/30",
];

const PROJECT_TYPE_ORDER = [
  "general",
  "code",
  "document",
  "data",
  "design",
  "research",
] as const;
const PROJECT_PAGE_SIZE = 48;
const LOAD_MORE_IN_VIEW_MARGIN = "640px 0px";

type ProjectTypeKey = (typeof PROJECT_TYPE_ORDER)[number];

interface GroupedProjectSection {
  key: ProjectTypeKey;
  projects: ProjectListItem[];
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Normalize project type into supported filter/group values. */
function normalizeProjectType(projectType?: string): ProjectTypeKey {
  if (PROJECT_TYPE_ORDER.includes(projectType as ProjectTypeKey)) {
    return projectType as ProjectTypeKey;
  }
  return "general";
}

/** Group projects by normalized project type while preserving type order. */
function groupProjectsByType(
  projects: ProjectListItem[],
): GroupedProjectSection[] {
  const grouped = new Map<ProjectTypeKey, ProjectListItem[]>();

  for (const project of projects) {
    const projectType = normalizeProjectType(project.projectType);
    const bucket = grouped.get(projectType);
    if (bucket) {
      bucket.push(project);
      continue;
    }
    grouped.set(projectType, [project]);
  }

  return PROJECT_TYPE_ORDER.flatMap((projectType) => {
    const items = grouped.get(projectType);
    if (!items?.length) return [];
    return [{ key: projectType, projects: items }];
  });
}

interface ProjectListPageProps {
  tabId: string;
  panelKey: string;
}

export default function ProjectListPage({ tabId }: ProjectListPageProps) {
  const { t } = useTranslation("nav");
  const { t: tSettings } = useTranslation("settings");

  const layoutBase = useLayoutState((s) => s.base);
  const openProject = useProjectOpen();
  const canOpenProjectWindow =
    typeof window !== "undefined" &&
    Boolean(window.openloafElectron?.openProjectWindow);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterProjectType, setFilterProjectType] = useState<string>("__all__");
  const [groupByType, setGroupByType] = useState(true);
  const [renameTarget, setRenameTarget] = useState<{
    projectId: string;
    title: string;
    nextTitle: string;
  } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  /** "create" = new empty project, "git" = clone from git, null = mode selection screen. */
  const [addMode, setAddMode] = useState<"create" | "git" | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createFolderPath, setCreateFolderPath] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [gitUrl, setGitUrl] = useState("");
  const [gitTargetDir, setGitTargetDir] = useState("");
  const [gitProgress, setGitProgress] = useState<string[]>([]);
  const [gitDone, setGitDone] = useState(false);
  const gitSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const pagedProjectsInput = useMemo(
    () => ({
      pageSize: PROJECT_PAGE_SIZE,
      ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
      ...(filterProjectType !== "__all__"
        ? { projectType: filterProjectType as ProjectTypeKey }
        : {}),
    }),
    [filterProjectType, searchQuery],
  );

  const projectsQuery = useInfiniteQuery({
    ...trpc.project.listPaged.infiniteQueryOptions(pagedProjectsInput, {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    }),
    placeholderData: keepPreviousData,
  });

  const filteredProjects = useMemo(
    () => projectsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [projectsQuery.data],
  );

  const groupedProjects = useMemo(
    () =>
      groupByType && filteredProjects.length > 0
        ? groupProjectsByType(filteredProjects)
        : [],
    [filteredProjects, groupByType],
  );

  const totalProjects = projectsQuery.data?.pages[0]?.total ?? 0;
  const hasMoreProjects = Boolean(projectsQuery.hasNextPage);
  const isFetchingNextProjects = projectsQuery.isFetchingNextPage;
  const fetchNextProjects = projectsQuery.fetchNextPage;
  const { ref: loadMoreInViewRef, isInView: isLoadMoreInView } = useIsInView(loadMoreRef, {
    inView: hasMoreProjects,
    inViewMargin: LOAD_MORE_IN_VIEW_MARGIN,
  });

  useEffect(() => {
    if (!hasMoreProjects || !isLoadMoreInView || isFetchingNextProjects) {
      return;
    }
    void fetchNextProjects();
  }, [fetchNextProjects, hasMoreProjects, isFetchingNextProjects, isLoadMoreInView]);

  const invalidateProjects = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: trpc.project.pathKey() });
  }, []);

  const updateMutation = useMutation(
    trpc.project.update.mutationOptions({
      onSuccess: () => {
        invalidateProjects();
        setRenameTarget(null);
      },
    }),
  );

  const removeMutation = useMutation(
    trpc.project.remove.mutationOptions({
      onSuccess: () => {
        invalidateProjects();
      },
    }),
  );

  const toggleFavoriteMutation = useMutation(
    trpc.project.toggleFavorite.mutationOptions({
      onSuccess: () => {
        invalidateProjects();
      },
    }),
  );

  const createMutation = useMutation(
    trpc.project.create.mutationOptions(),
  );

  /** Open the add-project dialog with a clean state. */
  const openAddDialog = useCallback(() => {
    setAddMode(null);
    setCreateTitle("");
    setCreateFolderPath("");
    setGitUrl("");
    setGitTargetDir("");
    setGitProgress([]);
    setGitDone(false);
    setIsCreateOpen(true);
  }, []);

  /** Pick a directory from system dialog (Electron only). */
  const pickDirectory = async (initialValue?: string) => {
    const api = window.openloafElectron;
    if (api?.pickDirectory) {
      const result = await api.pickDirectory(
        initialValue ? { defaultPath: initialValue } : undefined,
      );
      if (result?.ok && result.path) return result.path;
    }
    if (initialValue) return initialValue;
    return null;
  };

  /** Submit handler for creating a project at the selected folder. */
  const handleCreateProject = useCallback(async () => {
    const title = createTitle.trim();
    const folderPath = createFolderPath.trim();
    if (!folderPath) return;
    try {
      setIsBusy(true);
      const result = await trpcClient.project.checkPath.query({ dirPath: folderPath });
      const autoIcon = (result.isCodeProject && !result.hasIcon) ? "💻" : undefined;
      const res = await createMutation.mutateAsync({
        ...(title ? { title } : {}),
        rootUri: folderPath,
        enableVersionControl: true,
        icon: autoIcon,
      });
      invalidateProjects();
      setIsCreateOpen(false);
      setCreateTitle("");
      setCreateFolderPath("");
      // Fire-and-forget: infer project type via auxiliary model.
      if (res.project?.projectId) {
        trpcClient.settings.inferProjectType
          .mutate({ projectId: res.project.projectId, saasAccessToken: getCachedAccessToken() ?? undefined })
          .then(() => invalidateProjects())
          .catch(() => {});
      }
    } catch (err: any) {
      toast.error(err?.message ?? t("projectListPage.createFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [createTitle, createFolderPath, createMutation, invalidateProjects, t]);

  /** Start git clone via SSE subscription. */
  const handleCloneFromGit = useCallback(() => {
    const url = gitUrl.trim();
    if (!url) return;
    setIsBusy(true);
    setGitProgress([]);
    setGitDone(false);
    const sub = trpcClient.project.cloneFromGit.subscribe(
      { url, targetDir: gitTargetDir || undefined },
      {
        onData(data: any) {
          if (data.type === "progress") {
            setGitProgress((prev) => [...prev, data.message]);
          }
          if (data.type === "done") {
            setGitDone(true);
            setIsBusy(false);
            gitSubRef.current = null;
            invalidateProjects();
            // Fire-and-forget: infer project type via auxiliary model.
            if (data.projectId) {
              trpcClient.settings.inferProjectType
                .mutate({ projectId: data.projectId, saasAccessToken: getCachedAccessToken() ?? undefined })
                .then(() => invalidateProjects())
                .catch(() => {});
            }
          }
          if (data.type === "error") {
            toast.error(data.message);
            setIsBusy(false);
            gitSubRef.current = null;
          }
        },
        onError(err: any) {
          toast.error(err?.message ?? t("sidebar.cloneError"));
          setIsBusy(false);
          gitSubRef.current = null;
        },
      },
    );
    gitSubRef.current = sub;
  }, [gitUrl, gitTargetDir, invalidateProjects, t]);

  /** Abort a running git clone. */
  const handleAbortClone = useCallback(() => {
    gitSubRef.current?.unsubscribe();
    gitSubRef.current = null;
    setIsBusy(false);
  }, []);

  const handleProjectClick = useCallback(
    (project: ProjectListItem) => {
      openProject({
        projectId: project.projectId,
        title: project.title || t("projectListPage.untitled"),
        rootUri: project.rootUri,
        icon: project.icon ?? undefined,
      });
    },
    [openProject, t],
  );

  const handleProjectOpenInSidebar = useCallback(
    (project: ProjectListItem) => {
      openProject(
        {
          projectId: project.projectId,
          title: project.title || t("projectListPage.untitled"),
          rootUri: project.rootUri,
          icon: project.icon ?? undefined,
        },
        { mode: "sidebar" },
      );
    },
    [openProject, t],
  );

  const handleProjectOpenInWindow = useCallback(
    (project: ProjectListItem) => {
      openProject(
        {
          projectId: project.projectId,
          title: project.title || t("projectListPage.untitled"),
          rootUri: project.rootUri,
          icon: project.icon ?? undefined,
        },
        { mode: "window" },
      );
    },
    [openProject, t],
  );

  const handleRenameSave = useCallback(() => {
    if (!renameTarget || !renameTarget.nextTitle.trim()) return;
    updateMutation.mutate({
      projectId: renameTarget.projectId,
      title: renameTarget.nextTitle.trim(),
    });
  }, [renameTarget, updateMutation]);

  const handleRemove = useCallback(
    (projectId: string) => {
      if (confirm(t("projectListPage.confirmRemove"))) {
        removeMutation.mutate({ projectId });
      }
    },
    [removeMutation, t],
  );

  const handleToggleFavorite = useCallback(
    (projectId: string, currentFavorite: boolean) => {
      toggleFavoriteMutation.mutate({
        projectId,
        isFavorite: !currentFavorite,
      });
    },
    [toggleFavoriteMutation],
  );

  const activeProjectBaseId =
    layoutBase?.component === "plant-page" ? layoutBase.id : undefined;
  const isInitialLoading = projectsQuery.isPending && filteredProjects.length === 0;
  const hasActiveFilter =
    Boolean(searchQuery.trim()) || filterProjectType !== "__all__";

  const renderProjectCard = useCallback(
    (
      project: ProjectListItem,
      index: number,
    ) => {
      const baseId = `project:${project.projectId}`;
      const isActive = activeProjectBaseId === baseId;
      const gradientIndex =
        hashCode(project.projectId) % CARD_GRADIENTS.length;
      const displayPath = getDisplayPathFromUri(project.rootUri);
      const childCount = project.childCount;

      return (
        <ContextMenu key={project.projectId}>
          <ContextMenuTrigger asChild>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
              className={`group relative flex flex-col overflow-hidden rounded-2xl ol-glass-float cursor-pointer shadow-none transition-colors duration-200 hover:border-ol-blue/60 dark:bg-background/30 ${
                isActive
                  ? "border-ol-blue bg-ol-blue/[0.04] dark:bg-ol-blue/[0.08]"
                  : "border-border/70"
              }`}
              onClick={() => handleProjectClick(project)}
            >
              {/* Preview area */}
              <div
                className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${CARD_GRADIENTS[gradientIndex]}`}
              >
                <div className="flex flex-col items-center gap-2.5 opacity-40">
                  {project.icon ? (
                    <span className="text-4xl leading-none">{project.icon}</span>
                  ) : (
                    <FolderOpen className="h-8 w-8" />
                  )}
                  <div className="flex gap-1">
                    <div className="h-1.5 w-6 rounded-full bg-current opacity-30" />
                    <div className="h-1.5 w-4 rounded-full bg-current opacity-20" />
                    <div className="h-1.5 w-8 rounded-full bg-current opacity-25" />
                  </div>
                </div>

                {/* Badges */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  {project.isFavorite && (
                    <span className="inline-flex items-center rounded-md bg-ol-amber p-1 text-white">
                      <Star className="h-2.5 w-2.5 fill-current" />
                    </span>
                  )}
                  {project.isGitProject && (
                    <span className="inline-flex items-center rounded-md bg-black/50 p-1 text-white dark:bg-foreground/20">
                      <GitBranch className="h-2.5 w-2.5" />
                    </span>
                  )}
                  {project.depth > 0 && (
                    <span className="inline-flex items-center rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-foreground/15">
                      L{project.depth}
                    </span>
                  )}
                </div>

                {/* Dropdown menu overlay */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-6 w-6 rounded-md ol-glass-float shadow-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProjectOpenInSidebar(project);
                        }}
                      >
                        <FolderOpen className="mr-2 h-4 w-4" />
                        {t("projectTree.open")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!canOpenProjectWindow}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProjectOpenInWindow(project);
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {t("projectListPage.openInNewWindow")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!window.openloafElectron?.openPath}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.openloafElectron?.openPath?.({ uri: project.rootUri });
                        }}
                      >
                        <FolderSearch className="mr-2 h-4 w-4" />
                        {t("projectTree.openInFileManager")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget({
                            projectId: project.projectId,
                            title: project.title,
                            nextTitle: project.title,
                          });
                        }}
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        {t("chatHistoryList.contextMenu.rename")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(
                            project.projectId,
                            !!project.isFavorite,
                          );
                        }}
                      >
                        <Star
                          className={`mr-2 h-4 w-4 ${project.isFavorite ? "fill-ol-amber text-ol-amber" : ""}`}
                        />
                        {project.isFavorite
                          ? t("projectTree.unfavorite")
                          : t("projectTree.favorite")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(project.projectId);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("projectTree.remove")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Info area */}
              <div className="flex flex-col gap-1 px-3.5 py-2.5">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {project.icon && (
                    <span className="text-sm leading-none shrink-0">
                      {project.icon}
                    </span>
                  )}
                  {project.title || t("projectListPage.untitled")}
                </span>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{displayPath}</span>
                  {childCount > 0 && (
                    <span className="shrink-0">
                      {t("projectListPage.childCount", { count: childCount })}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onSelect={() => handleProjectOpenInSidebar(project)}>
              <FolderOpen className="mr-2 h-4 w-4" />
              {t("projectTree.open")}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canOpenProjectWindow}
              onSelect={() => handleProjectOpenInWindow(project)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("projectListPage.openInNewWindow")}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!window.openloafElectron?.openPath}
              onSelect={() => {
                window.openloafElectron?.openPath?.({ uri: project.rootUri });
              }}
            >
              <FolderSearch className="mr-2 h-4 w-4" />
              {t("projectTree.openInFileManager")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() =>
                setRenameTarget({
                  projectId: project.projectId,
                  title: project.title,
                  nextTitle: project.title,
                })
              }
            >
              <Edit2 className="mr-2 h-4 w-4" />
              {t("chatHistoryList.contextMenu.rename")}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                handleToggleFavorite(project.projectId, !!project.isFavorite)
              }
            >
              <Star
                className={`mr-2 h-4 w-4 ${project.isFavorite ? "fill-ol-amber text-ol-amber" : ""}`}
              />
              {project.isFavorite
                ? t("projectTree.unfavorite")
                : t("projectTree.favorite")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => handleRemove(project.projectId)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("projectTree.remove")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    },
    [
      canOpenProjectWindow,
      activeProjectBaseId,
      handleProjectClick,
      handleProjectOpenInSidebar,
      handleProjectOpenInWindow,
      handleToggleFavorite,
      handleRemove,
      t,
    ],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative max-w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("search")}
              className="h-8 pl-8 pr-7 text-sm rounded-md bg-muted/40 border-transparent focus:border-border"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select
            value={filterProjectType}
            onValueChange={setFilterProjectType}
          >
            <SelectTrigger className="h-8 w-auto max-w-40 gap-1.5 rounded-md border-transparent bg-muted/40 px-3 text-sm focus:border-border [&>svg]:h-3.5 [&>svg]:w-3.5">
              <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">
                {t("projectListPage.allProjectTypes")}
              </SelectItem>
              {PROJECT_TYPE_ORDER.map((projectType) => (
                <SelectItem key={projectType} value={projectType}>
                  {tSettings(`project.typeLabel.${projectType}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("projectListPage.totalCount", {
              count: totalProjects,
            })}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={groupByType ? "secondary" : "ghost"}
                size="icon"
                className={`h-8 w-8 rounded-md ${groupByType ? "bg-ol-blue/10 text-ol-blue" : ""}`}
                onClick={() => setGroupByType((value) => !value)}
              >
                <Layers3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("projectListPage.groupByProjectType")}
            </TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md bg-ol-blue/10 text-ol-blue hover:bg-ol-blue/20"
            onClick={openAddDialog}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("projectListPage.addProject")}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isInitialLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card/70"
              >
                <div className="h-36 animate-pulse bg-muted/60" />
                <div className="space-y-2 px-3.5 py-2.5">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted/50" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col h-60 items-center justify-center gap-3 text-muted-foreground">
            <FolderOpen className="h-10 w-10 opacity-30" />
            <p className="text-sm">
              {hasActiveFilter
                ? t("projectListPage.emptyFiltered")
                : t("projectListPage.empty")}
            </p>
          </div>
        ) : groupByType ? (
          <div className="space-y-6">
            {groupedProjects.map((group) => (
              <div key={group.key}>
                <div className="mb-3 px-1">
                  <h3 className="text-xs font-medium text-muted-foreground/70">
                    {tSettings(`project.typeLabel.${group.key}`)}
                  </h3>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
                  {group.projects.map((project, i) =>
                    renderProjectCard(project, i),
                  )}
                </div>
              </div>
            ))}
            {hasMoreProjects ? (
              <div
                ref={loadMoreInViewRef}
                className="flex h-12 w-full items-center justify-center"
                aria-hidden="true"
              >
                {isFetchingNextProjects ? (
                  <div className="h-6 w-6 rounded-full border-2 border-border/60 border-t-ol-blue animate-spin" />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
              {filteredProjects.map((project, i) =>
                renderProjectCard(project, i),
              )}
            </div>
            {hasMoreProjects ? (
              <div
                ref={loadMoreInViewRef}
                className="flex h-12 w-full items-center justify-center"
                aria-hidden="true"
              >
                {isFetchingNextProjects ? (
                  <div className="h-6 w-6 rounded-full border-2 border-border/60 border-t-ol-blue animate-spin" />
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Rename dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("projectListPage.renameTitle")}</DialogTitle>
            <DialogDescription>
              {t("projectListPage.renameDesc")}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameTarget?.nextTitle ?? ""}
            onChange={(e) =>
              setRenameTarget((prev) =>
                prev ? { ...prev, nextTitle: e.target.value } : prev,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSave();
            }}
            className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="ghost"
                className="rounded-md text-muted-foreground shadow-none transition-colors duration-150"
              >
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="ghost"
              className="rounded-md bg-ol-blue/10 text-ol-blue hover:bg-ol-blue/20 shadow-none transition-colors duration-150"
              onClick={handleRenameSave}
              disabled={updateMutation.isPending}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Create project dialog (3 options: new / import / git clone) */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (open) { openAddDialog(); } else if (!isBusy) { setIsCreateOpen(false); }
        }}
      >
        <DialogContent
          className="max-w-[420px] overflow-hidden rounded-2xl border border-border/60 bg-background p-0 shadow-ol-float"
          onInteractOutside={(e) => { if (isBusy) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isBusy) e.preventDefault(); }}
        >
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle className="text-[16px] font-semibold">{t("projectListPage.addProjectTitle")}</DialogTitle>
          </DialogHeader>

          {/* Mode selection */}
          {!addMode && (
            <div className="flex gap-2.5 px-6 pt-3 pb-7">
              <button
                type="button"
                className="group flex flex-1 flex-col items-center gap-2.5 rounded-xl border border-ol-blue/20 bg-ol-blue-bg px-4 py-4 text-center transition-colors duration-150 hover:border-ol-blue/30 hover:bg-ol-blue-bg-hover"
                onClick={() => setAddMode("create")}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ol-blue-bg text-ol-blue">
                  <FolderPlus className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{t("sidebar.newProject")}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{t("sidebar.newProjectDescription")}</div>
                </div>
              </button>
              <button
                type="button"
                className="group flex flex-1 flex-col items-center gap-2.5 rounded-xl border border-ol-purple/20 bg-ol-purple-bg px-4 py-4 text-center transition-colors duration-150 hover:border-ol-purple/30 hover:bg-ol-purple-bg-hover"
                onClick={() => setAddMode("git")}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ol-purple-bg text-ol-purple">
                  <GitBranch className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{t("sidebar.cloneFromGit")}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{t("sidebar.cloneFromGitDescription")}</div>
                </div>
              </button>
            </div>
          )}

          {/* New project form */}
          {addMode === "create" && (
            <div className="flex min-w-0 flex-col gap-3 px-6 pt-3 pb-3">
              <div>
                <Label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("sidebar.storageLocation")}
                </Label>
                <button
                  type="button"
                  className="flex h-9 w-full items-center rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
                  onClick={async () => {
                    const dir = await pickDirectory(createFolderPath || undefined);
                    if (dir) {
                      setCreateFolderPath(dir);
                      if (!createTitle.trim()) {
                        const folderName = dir.split(/[/\\]/).filter(Boolean).pop() ?? "";
                        setCreateTitle(folderName);
                      }
                    }
                  }}
                >
                  <FolderOpen className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span dir="rtl" className="truncate text-left">
                    {createFolderPath || t("sidebar.selectFolder")}
                  </span>
                </button>
              </div>
              <div>
                <Label htmlFor="add-project-title" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("sidebar.projectName")}
                </Label>
                <Input
                  id="add-project-title"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="h-9 rounded-lg"
                  placeholder={t("sidebar.projectNamePlaceholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && createFolderPath.trim() && !isBusy) {
                      handleCreateProject();
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Git clone form */}
          {addMode === "git" && (
            <div className="flex min-w-0 flex-col gap-3 px-6 pt-3 pb-3">
              {!isBusy && !gitDone && (
                <>
                  <div>
                    <Label htmlFor="git-url" className="mb-1.5 block text-sm font-medium text-foreground">
                      {t("sidebar.repositoryAddress")}
                    </Label>
                    <Input
                      id="git-url"
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      className="h-9 rounded-lg font-mono text-xs"
                      autoFocus
                      placeholder="https://github.com/user/repo.git"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && gitUrl.trim()) handleCloneFromGit();
                      }}
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-sm font-medium text-foreground">
                      {t("sidebar.targetDirectory")}
                    </Label>
                    <button
                      type="button"
                      className="flex h-9 w-full items-center rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
                      onClick={async () => {
                        const dir = await pickDirectory(gitTargetDir || undefined);
                        if (dir) setGitTargetDir(dir);
                      }}
                    >
                      {gitTargetDir || t("sidebar.projectSpaceRootDefault")}
                    </button>
                  </div>
                </>
              )}
              {(isBusy || gitDone) && (
                <div className="flex flex-col gap-2">
                  {gitDone && (
                    <div className="flex items-center gap-2 text-sm text-ol-green">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{t("sidebar.cloneComplete")}</span>
                    </div>
                  )}
                  <div className="max-h-[160px] overflow-y-auto rounded-lg border border-border/40 bg-muted/30 p-2.5">
                    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {gitProgress.slice(-12).join("\n") || t("sidebar.connecting")}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer: create mode */}
          {addMode === "create" && (
            <DialogFooter className="border-t border-border/30 px-6 pt-3 pb-5 gap-2">
              <Button
                variant="outline"
                type="button"
                className="h-9 rounded-md px-5 text-[13px] text-ol-text-auxiliary hover:bg-ol-surface-muted"
                onClick={() => { setAddMode(null); setCreateTitle(""); setCreateFolderPath(""); }}
              >
                {t("sidebar.back")}
              </Button>
              <Button
                variant="ghost"
                onClick={handleCreateProject}
                disabled={isBusy || !createFolderPath.trim()}
                className="h-9 rounded-md px-5 text-[13px] bg-ol-blue text-white shadow-none hover:bg-ol-blue hover:text-white hover:opacity-90"
              >
                {isBusy ? t("sidebar.creating") : t("sidebar.create")}
              </Button>
            </DialogFooter>
          )}

          {/* Footer: git clone mode */}
          {addMode === "git" && (
            <DialogFooter className="border-t border-border/30 px-6 pt-3 pb-5 gap-2">
              {!gitDone ? (
                <>
                  {isBusy ? (
                    <Button
                      variant="outline"
                      type="button"
                      className="h-9 rounded-md px-5 text-[13px] text-ol-red border-ol-red/20 hover:bg-ol-red-bg"
                      onClick={handleAbortClone}
                    >
                      <Square className="mr-1.5 h-3.5 w-3.5" />
                      {t("sidebar.abort")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      type="button"
                      className="h-9 rounded-md px-5 text-[13px] text-ol-text-auxiliary hover:bg-ol-surface-muted"
                      onClick={() => setAddMode(null)}
                    >
                      {t("sidebar.back")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={handleCloneFromGit}
                    disabled={isBusy || !gitUrl.trim()}
                    className="h-9 rounded-md px-5 text-[13px] bg-ol-purple text-white shadow-none hover:bg-ol-purple hover:text-white hover:opacity-90"
                  >
                    {isBusy ? t("sidebar.cloning") : t("sidebar.startClone")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setIsCreateOpen(false)}
                  className="h-9 rounded-md px-5 text-[13px] bg-ol-green text-white shadow-none hover:bg-ol-green hover:text-white hover:opacity-90"
                >
                  {t("sidebar.done")}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
