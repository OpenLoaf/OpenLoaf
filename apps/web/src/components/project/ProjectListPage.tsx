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
  ExternalLink,
  FolderOpen,
  Plus,
  Edit2,
  Trash2,
  MoreHorizontal,
  Search,
  X,
  Star,
  GitBranch,
  Layers3,
  Filter,
} from "lucide-react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";

import { useIsInView } from "@/hooks/use-is-in-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useProjectOpen } from "@/hooks/use-project-open";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import type { ProjectListItem } from "@openloaf/api/services/projectTreeService";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
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
  const [createTitle, setCreateTitle] = useState("");
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
    trpc.project.create.mutationOptions({
      onSuccess: () => {
        invalidateProjects();
        setIsCreateOpen(false);
        setCreateTitle("");
      },
    }),
  );

  const handleCreateProject = useCallback(() => {
    const title = createTitle.trim();
    if (!title) return;
    createMutation.mutate({ title, enableVersionControl: true });
  }, [createTitle, createMutation]);

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
              transition={{ duration: 0.3, delay: index * 0.04 }}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-background/70 backdrop-blur-sm cursor-pointer shadow-none transition-colors duration-200 hover:border-ol-blue/60 dark:bg-background/30 ${
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
                    <span className="inline-flex items-center rounded-full bg-ol-amber p-1 text-white">
                      <Star className="h-2.5 w-2.5 fill-current" />
                    </span>
                  )}
                  {project.isGitProject && (
                    <span className="inline-flex items-center rounded-full bg-black/50 p-1 text-white dark:bg-foreground/20">
                      <GitBranch className="h-2.5 w-2.5" />
                    </span>
                  )}
                  {project.depth > 0 && (
                    <span className="inline-flex items-center rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-foreground/15">
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
                        className="h-6 w-6 rounded-full bg-background/80 backdrop-blur-sm shadow-none"
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
              className="h-8 pl-8 pr-7 text-sm rounded-full bg-muted/40 border-transparent focus:border-border"
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
            <SelectTrigger className="h-8 w-auto max-w-40 gap-1.5 rounded-full border-transparent bg-muted/40 px-3 text-sm focus:border-border [&>svg]:h-3.5 [&>svg]:w-3.5">
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
                className={`h-8 w-8 rounded-full ${groupByType ? "bg-ol-blue/10 text-ol-blue" : ""}`}
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
            className="rounded-full bg-ol-blue/10 text-ol-blue hover:bg-ol-blue/20"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("projectListPage.addProject")}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isInitialLoading ? (
          <div className="flex h-60 items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-border/60 border-t-ol-blue animate-spin" />
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
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-xs font-medium text-muted-foreground/70">
                    {tSettings(`project.typeLabel.${group.key}`)}
                  </h3>
                  <span className="text-[11px] text-muted-foreground/60">
                    {group.projects.length}
                  </span>
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
                className="rounded-full text-muted-foreground shadow-none transition-colors duration-150"
              >
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              className="rounded-full bg-ol-blue/10 text-ol-blue hover:bg-ol-blue/20 shadow-none transition-colors duration-150"
              onClick={handleRenameSave}
              disabled={updateMutation.isPending}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Create project dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setCreateTitle("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("projectListPage.addProjectTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateProject();
            }}
            placeholder={t("projectListPage.addProjectPlaceholder")}
            className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="ghost"
                className="rounded-full text-muted-foreground shadow-none transition-colors duration-150"
              >
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              className="rounded-full bg-ol-blue/10 text-ol-blue hover:bg-ol-blue/20 shadow-none transition-colors duration-150"
              onClick={handleCreateProject}
              disabled={createMutation.isPending || !createTitle.trim()}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("projectListPage.addProject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
