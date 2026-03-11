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

import { useState, useCallback, useMemo } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen,
  Plus,
  Edit2,
  Trash2,
  MoreHorizontal,
  Search,
  X,
  Star,
  GitBranch,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { toast } from "sonner";

import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useProjects, getProjectsQueryKey } from "@/hooks/use-projects";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useProjectLayout } from "@/hooks/use-project-layout";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
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

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Flatten project tree into a flat array with depth info. */
function flattenProjects(
  nodes: ProjectNode[],
  depth = 0,
): Array<ProjectNode & { depth: number }> {
  const result: Array<ProjectNode & { depth: number }> = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children?.length) {
      result.push(...flattenProjects(node.children, depth + 1));
    }
  }
  return result;
}

interface WorkspaceListPageProps {
  tabId: string;
  panelKey: string;
}

export default function WorkspaceListPage({ tabId }: WorkspaceListPageProps) {
  const { t } = useTranslation("nav");
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const runtimeByTabId = useTabRuntime((s) => s.runtimeByTabId);

  const [searchQuery, setSearchQuery] = useState("");
  const [renameTarget, setRenameTarget] = useState<{
    projectId: string;
    title: string;
    nextTitle: string;
  } | null>(null);

  const { data: projectList } = useProjects();
  const projects = projectList ?? [];

  const flatProjects = useMemo(() => flattenProjects(projects), [projects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return flatProjects;
    const q = searchQuery.trim().toLowerCase();
    return flatProjects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        getDisplayPathFromUri(p.rootUri).toLowerCase().includes(q),
    );
  }, [flatProjects, searchQuery]);

  const invalidateProjects = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getProjectsQueryKey() });
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

  const handleProjectClick = useCallback(
    (project: ProjectNode) => {
      if (!workspaceId) return;
      const targetProjectId = project.projectId;
      const baseId = `project:${targetProjectId}`;

      const existingTab = tabs.find((tab) => {
        if (tab.workspaceId !== workspaceId) return false;
        const base = runtimeByTabId[tab.id]?.base;
        return base?.id === baseId;
      });

      if (existingTab) {
        setActiveTab(existingTab.id);
        return;
      }

      const savedLayout = useProjectLayout
        .getState()
        .getProjectLayout(targetProjectId);
      addTab({
        workspaceId,
        createNew: true,
        title: project.title || t("workspaceListPage.untitled"),
        icon: project.icon ?? undefined,
        base: {
          id: baseId,
          component: "plant-page",
          params: {
            projectId: targetProjectId,
            rootUri: project.rootUri,
            projectTab: "files",
          },
        },
        leftWidthPercent: savedLayout?.leftWidthPercent ?? 100,
        rightChatCollapsed: savedLayout?.rightChatCollapsed ?? false,
        chatParams: { projectId: targetProjectId },
      });
    },
    [workspaceId, tabs, runtimeByTabId, addTab, setActiveTab, t],
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
      if (confirm(t("workspaceListPage.confirmRemove"))) {
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

  const activeBase = activeTabId
    ? runtimeByTabId[activeTabId]?.base
    : undefined;
  const activeProjectBaseId =
    activeBase?.component === "plant-page" ? activeBase.id : undefined;

  const renderProjectCard = useCallback(
    (
      project: ProjectNode & { depth: number },
      index: number,
    ) => {
      const baseId = `project:${project.projectId}`;
      const isActive = activeProjectBaseId === baseId;
      const gradientIndex =
        hashCode(project.projectId) % CARD_GRADIENTS.length;
      const displayPath = getDisplayPathFromUri(project.rootUri);
      const childCount = project.children?.length ?? 0;

      return (
        <motion.div
          key={project.projectId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: index * 0.04 }}
          className={`group relative flex flex-col overflow-hidden rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md hover:border-sky-300 dark:hover:border-sky-600 ${
            isActive
              ? "border-sky-400 dark:border-sky-500 shadow-sm ring-1 ring-sky-200 dark:ring-sky-700"
              : "border-border"
          }`}
          onClick={() => handleProjectClick(project)}
        >
          {/* Preview area */}
          <div
            className={`relative flex items-center justify-center h-44 bg-gradient-to-br ${CARD_GRADIENTS[gradientIndex]}`}
          >
            <div className="flex flex-col items-center gap-3 opacity-40">
              {project.icon ? (
                <span className="text-5xl leading-none">{project.icon}</span>
              ) : (
                <FolderOpen className="h-10 w-10" />
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
                <span className="inline-flex items-center rounded-full bg-amber-500/90 p-1 text-white dark:bg-amber-400/90 dark:text-amber-950">
                  <Star className="h-2.5 w-2.5 fill-current" />
                </span>
              )}
              {project.isGitProject && (
                <span className="inline-flex items-center rounded-full bg-black/50 p-1 text-white dark:bg-white/20">
                  <GitBranch className="h-2.5 w-2.5" />
                </span>
              )}
              {project.depth > 0 && (
                <span className="inline-flex items-center rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-white/15">
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
                    className="h-7 w-7 rounded-lg bg-background/80 backdrop-blur-sm shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
                    {t("workspaceChatList.contextMenu.rename")}
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
                      className={`mr-2 h-4 w-4 ${project.isFavorite ? "fill-amber-500 text-amber-500" : ""}`}
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
          <div className="flex flex-col gap-1.5 px-4 py-3">
            <span className="text-sm font-medium truncate flex items-center gap-1.5">
              {project.icon && (
                <span className="text-sm leading-none shrink-0">
                  {project.icon}
                </span>
              )}
              {project.title || t("workspaceListPage.untitled")}
            </span>
            <div className="flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{displayPath}</span>
              {childCount > 0 && (
                <span className="shrink-0">
                  {t("workspaceListPage.childCount", { count: childCount })}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      );
    },
    [
      activeProjectBaseId,
      handleProjectClick,
      handleToggleFavorite,
      handleRemove,
      t,
    ],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
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
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("workspaceListPage.totalCount", {
              count: flatProjects.length,
            })}
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col h-60 items-center justify-center gap-3 text-muted-foreground">
            <FolderOpen className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t("workspaceListPage.empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {filteredProjects.map((project, i) =>
              renderProjectCard(project, i),
            )}
          </div>
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
            <DialogTitle>{t("workspaceListPage.renameTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspaceListPage.renameDesc")}
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
              className="rounded-full bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-400 shadow-none transition-colors duration-150"
              onClick={handleRenameSave}
              disabled={updateMutation.isPending}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
