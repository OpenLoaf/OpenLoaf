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
import { Palette, Plus, Edit2, Trash2, MoreHorizontal, Copy, CopyPlus, CalendarDays, Search, X, FolderOpen } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useProjects } from "@/hooks/use-projects";
import { buildFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import { BOARD_INDEX_FILE_NAME } from "@/lib/file-name";
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
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openloaf/ui/tooltip";

/** Deterministic pastel gradient based on board id hash. */
const PREVIEW_GRADIENTS = [
  "from-teal-100 to-cyan-50 dark:from-teal-900/40 dark:to-cyan-900/30",
  "from-violet-100 to-fuchsia-50 dark:from-violet-900/40 dark:to-fuchsia-900/30",
  "from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/30",
  "from-sky-100 to-blue-50 dark:from-sky-900/40 dark:to-blue-900/30",
  "from-rose-100 to-pink-50 dark:from-rose-900/40 dark:to-pink-900/30",
  "from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/30",
  "from-indigo-100 to-purple-50 dark:from-indigo-900/40 dark:to-purple-900/30",
  "from-lime-100 to-yellow-50 dark:from-lime-900/40 dark:to-yellow-900/30",
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Format date based on i18n language. zh-* → yyyy/MM/dd, else → locale default. */
function formatBoardDate(date: Date | string, lang: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (lang.startsWith("zh")) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  }
  return d.toLocaleDateString(lang, { year: "numeric", month: "2-digit", day: "2-digit" });
}

interface BoardItem {
  id: string;
  title: string;
  folderUri: string;
  projectId?: string | null;
  updatedAt: string | Date;
  [key: string]: any;
}

interface BoardGroup {
  key: string;
  labelKey: string;
  boards: BoardItem[];
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function groupBoardsByTime(boards: BoardItem[]): BoardGroup[] {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  const sorted = [...boards].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const today: BoardItem[] = [];
  const yesterday: BoardItem[] = [];
  const within7: BoardItem[] = [];
  const within30: BoardItem[] = [];
  const byMonth = new Map<string, BoardItem[]>();

  for (const board of sorted) {
    const t = new Date(board.updatedAt);
    const diffDays = Math.floor((todayStart - startOfDay(t).getTime()) / oneDay);
    if (diffDays <= 0) today.push(board);
    else if (diffDays === 1) yesterday.push(board);
    else if (diffDays < 7) within7.push(board);
    else if (diffDays < 30) within30.push(board);
    else {
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
      const list = byMonth.get(key) ?? [];
      list.push(board);
      byMonth.set(key, list);
    }
  }

  const groups: BoardGroup[] = [];
  if (today.length)
    groups.push({ key: "today", labelKey: "session.groupLabel.today", boards: today });
  if (yesterday.length)
    groups.push({ key: "yesterday", labelKey: "session.groupLabel.yesterday", boards: yesterday });
  if (within7.length)
    groups.push({ key: "within7", labelKey: "session.groupLabel.within7", boards: within7 });
  if (within30.length)
    groups.push({ key: "within30", labelKey: "session.groupLabel.within30", boards: within30 });

  for (const [key, list] of byMonth) {
    groups.push({ key, labelKey: key, boards: list });
  }

  return groups;
}

interface CanvasListPageProps {
  tabId: string;
  panelKey: string;
  /** Filter boards by project id (project-level canvas list). */
  projectId?: string;
}

export default function CanvasListPage({ tabId, projectId }: CanvasListPageProps) {
  const { t, i18n } = useTranslation("nav");
  const { t: tAi } = useTranslation("ai");
  const lang = i18n.language;
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const rootUri = workspace?.rootUri;
  const queryClient = useQueryClient();

  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const runtimeByTabId = useTabRuntime((s) => s.runtimeByTabId);

  const [renameTarget, setRenameTarget] = useState<{
    boardId: string;
    title: string;
    nextTitle: string;
  } | null>(null);
  const [groupByTime, setGroupByTime] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProjectId, setFilterProjectId] = useState<string>("__all__");

  const { data: projectList } = useProjects();
  const projectInfoById = useMemo(() => {
    const map = new Map<string, { name: string; icon?: string }>();
    const walk = (nodes: typeof projectList) => {
      nodes?.forEach((node) => {
        if (node.projectId) map.set(node.projectId, { name: node.title, icon: node.icon });
        if (node.children?.length) walk(node.children);
      });
    };
    walk(projectList);
    return map;
  }, [projectList]);

  const queryInput = useMemo(
    () =>
      workspaceId
        ? { workspaceId, ...(projectId ? { projectId } : {}) }
        : { workspaceId: "" },
    [workspaceId, projectId],
  );

  const { data: boards } = useQuery(
    trpc.board.list.queryOptions(queryInput as any),
  );

  const thumbInput = useMemo(
    () =>
      workspaceId && boards && boards.length > 0
        ? {
            workspaceId,
            ...(projectId ? { projectId } : {}),
            boardIds: boards.map((b) => b.id),
          }
        : null,
    [workspaceId, projectId, boards],
  );

  const { data: thumbData } = useQuery(
    trpc.board.thumbnails.queryOptions(thumbInput as any, {
      enabled: !!thumbInput,
      staleTime: 5 * 60 * 1000,
    }),
  );

  const thumbMap = thumbData?.items as Record<string, string> | undefined;

  const filteredBoards = useMemo(() => {
    if (!boards) return [];
    let result = [...boards];
    if (filterProjectId !== "__all__") {
      if (filterProjectId === "__none__") {
        result = result.filter((b) => !b.projectId);
      } else {
        result = result.filter((b) => b.projectId === filterProjectId);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((b) => b.title.toLowerCase().includes(q));
    }
    return result;
  }, [boards, filterProjectId, searchQuery]);

  const boardGroups = useMemo(
    () => (groupByTime && filteredBoards.length > 0 ? groupBoardsByTime(filteredBoards as BoardItem[]) : []),
    [groupByTime, filteredBoards],
  );

  const invalidateBoardList = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: trpc.board.list.queryKey() });
  }, [queryClient]);

  const updateMutation = useMutation(
    trpc.board.update.mutationOptions({
      onSuccess: () => {
        invalidateBoardList();
        setRenameTarget(null);
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.board.delete.mutationOptions({
      onSuccess: () => {
        invalidateBoardList();
      },
    }),
  );

  const duplicateMutation = useMutation(
    trpc.board.duplicate.mutationOptions({
      onSuccess: () => {
        invalidateBoardList();
      },
    }),
  );

  const createMutation = useMutation(
    trpc.board.create.mutationOptions({
      onSuccess: (board) => {
        invalidateBoardList();
        handleBoardClick({ id: board.id, title: board.title, folderUri: board.folderUri });
      },
    }),
  );

  const handleCreate = useCallback(() => {
    if (!workspaceId || !rootUri || createMutation.isPending) return;
    createMutation.mutate({
      workspaceId,
      title: t("canvasList.defaultName"),
      ...(projectId ? { projectId } : {}),
    });
  }, [workspaceId, rootUri, projectId, createMutation, t]);

  const handleBoardClick = useCallback(
    (board: { id: string; title: string; folderUri: string }) => {
      if (!rootUri) return;
      const boardFolderUri = buildFileUriFromRoot(rootUri, board.folderUri);
      const boardFileUri = buildFileUriFromRoot(
        rootUri,
        `${board.folderUri}${BOARD_INDEX_FILE_NAME}`,
      );
      const baseId = `board:${boardFolderUri}`;

      const existingTab = tabs.find((tab) => {
        if (tab.workspaceId !== workspaceId) return false;
        const base = runtimeByTabId[tab.id]?.base;
        return base?.id === baseId;
      });

      if (existingTab) {
        setActiveTab(existingTab.id);
      } else {
        addTab({
          workspaceId,
          createNew: true,
          title: board.title || t("canvasList.untitled"),
          icon: "🎨",
          leftWidthPercent: 100,
          base: {
            id: baseId,
            component: "board-viewer",
            params: {
              boardFolderUri,
              boardFileUri,
              boardId: board.id,
            },
          },
        });
      }
    },
    [rootUri, workspaceId, tabs, runtimeByTabId, addTab, setActiveTab, t],
  );

  const handleRename = useCallback(
    (boardId: string, title: string) => {
      setRenameTarget({ boardId, title, nextTitle: title });
    },
    [],
  );

  const handleRenameSave = useCallback(() => {
    if (!renameTarget || !renameTarget.nextTitle.trim()) return;
    updateMutation.mutate({
      boardId: renameTarget.boardId,
      title: renameTarget.nextTitle.trim(),
    });
  }, [renameTarget, updateMutation]);

  const handleDelete = useCallback(
    (boardId: string) => {
      if (confirm(t("canvasList.confirmDelete"))) {
        deleteMutation.mutate({ boardId });
      }
    },
    [deleteMutation, t],
  );

  const handleDuplicate = useCallback(
    (boardId: string) => {
      if (!workspaceId || duplicateMutation.isPending) return;
      duplicateMutation.mutate({
        boardId,
        workspaceId,
        ...(projectId ? { projectId } : {}),
      });
    },
    [workspaceId, projectId, duplicateMutation],
  );

  const activeBase = activeTabId ? runtimeByTabId[activeTabId]?.base : undefined;
  const activeBoardBaseId =
    activeBase?.component === "board-viewer" ? activeBase.id : undefined;

  const renderBoardCard = useCallback(
    (board: { id: string; title: string; folderUri: string; updatedAt: string | Date; projectId?: string | null }, index: number) => {
      const boardFolderUri = rootUri
        ? buildFileUriFromRoot(rootUri, board.folderUri)
        : "";
      const baseId = `board:${boardFolderUri}`;
      const isActive = activeBoardBaseId === baseId;
      const gradientIndex = hashCode(board.id) % PREVIEW_GRADIENTS.length;
      const thumb = thumbMap?.[board.id];
      const projectInfo = board.projectId ? projectInfoById.get(board.projectId) : undefined;

      return (
        <motion.div
          key={board.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: index * 0.04 }}
          className={`group relative flex flex-col overflow-hidden rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md hover:border-teal-300 dark:hover:border-teal-600 ${
            isActive
              ? "border-teal-400 dark:border-teal-500 shadow-sm ring-1 ring-teal-200 dark:ring-teal-700"
              : "border-border"
          }`}
          onClick={() => handleBoardClick(board)}
        >
          {/* Preview area */}
          <div
            className={`relative flex items-center justify-center h-36 ${
              thumb ? "bg-muted/30" : `bg-gradient-to-br ${PREVIEW_GRADIENTS[gradientIndex]}`
            }`}
          >
            {thumb ? (
              <img
                src={thumb}
                alt={board.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 opacity-40">
                <Palette className="h-8 w-8" />
                <div className="flex gap-1">
                  <div className="h-1.5 w-6 rounded-full bg-current opacity-30" />
                  <div className="h-1.5 w-4 rounded-full bg-current opacity-20" />
                  <div className="h-1.5 w-8 rounded-full bg-current opacity-25" />
                </div>
              </div>
            )}

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
                      handleRename(board.id, board.title);
                    }}
                  >
                    <Edit2 className="mr-2 h-4 w-4" />
                    {t("workspaceChatList.contextMenu.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(board.id);
                    }}
                  >
                    <CopyPlus className="mr-2 h-4 w-4" />
                    {t("canvasList.duplicate")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      const fullPath = boardFolderUri.startsWith("file://")
                        ? decodeURIComponent(new URL(boardFolderUri).pathname).replace(/\/$/, "")
                        : boardFolderUri.replace(/\/$/, "");
                      navigator.clipboard.writeText(fullPath);
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("canvasList.copyPath")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(board.id);
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("workspaceChatList.contextMenu.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Info area */}
          <div className="flex flex-col gap-1 px-3 py-2.5">
            <span className="text-sm font-medium truncate">
              {board.title || t("canvasList.untitled")}
            </span>
            <div className="flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
              <span>{formatBoardDate(board.updatedAt, lang)}</span>
              {projectInfo ? (
                <span className="flex items-center gap-1 shrink-0 truncate max-w-[50%]">
                  {projectInfo.icon ? (
                    <span className="text-xs leading-none">{projectInfo.icon}</span>
                  ) : (
                    <img src="/head_s.png" alt="" className="h-3.5 w-3.5 rounded-sm" />
                  )}
                  <span className="truncate">{projectInfo.name}</span>
                </span>
              ) : null}
            </div>
          </div>
        </motion.div>
      );
    },
    [rootUri, activeBoardBaseId, thumbMap, projectInfoById, lang, handleBoardClick, handleRename, handleDelete, handleDuplicate, t],
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
          {!projectId && projectInfoById.size > 0 ? (
            <Select value={filterProjectId} onValueChange={setFilterProjectId}>
              <SelectTrigger className="h-8 w-auto max-w-40 gap-1.5 rounded-full border-transparent bg-muted/40 px-3 text-sm focus:border-border [&>svg]:h-3.5 [&>svg]:w-3.5">
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("canvasList.allProjects")}</SelectItem>
                <SelectItem value="__none__">{t("canvasList.noProject")}</SelectItem>
                {[...projectInfoById.entries()].map(([id, info]) => (
                  <SelectItem key={id} value={id}>
                    <span className="inline-flex items-center gap-1.5">
                      {info.icon ? (
                        <span className="text-xs leading-none">{info.icon}</span>
                      ) : (
                        <img src="/head_s.png" alt="" className="h-3.5 w-3.5 rounded-sm" />
                      )}
                      {info.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={groupByTime ? "secondary" : "ghost"}
                size="icon"
                className={`h-8 w-8 rounded-full ${groupByTime ? "bg-teal-500/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300" : ""}`}
                onClick={() => setGroupByTime((v) => !v)}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("canvasList.groupByTime")}</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 dark:bg-teal-400/15 dark:text-teal-300 dark:hover:bg-teal-400/25"
            onClick={handleCreate}
            disabled={!workspaceId || !rootUri || createMutation.isPending}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("canvasList.defaultName")}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredBoards.length === 0 ? (
          <div className="flex flex-col h-60 items-center justify-center gap-3 text-muted-foreground">
            <Palette className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t("canvasList.empty")}</p>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full mt-1 bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 dark:bg-teal-400/15 dark:text-teal-300 dark:hover:bg-teal-400/25"
              onClick={handleCreate}
              disabled={!workspaceId || !rootUri || createMutation.isPending}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t("canvasList.defaultName")}
            </Button>
          </div>
        ) : groupByTime ? (
          <div className="space-y-6">
            {boardGroups.map((group) => (
              <div key={group.key}>
                <h3 className="mb-3 text-xs font-medium text-muted-foreground/70 px-1">
                  {tAi(group.labelKey, { defaultValue: group.labelKey })}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                  {group.boards.map((board, i) => renderBoardCard(board, i))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {filteredBoards.map((board, i) => renderBoardCard(board, i))}
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
            <DialogTitle>{t("canvasList.renameTitle")}</DialogTitle>
            <DialogDescription>{t("canvasList.renameDesc")}</DialogDescription>
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
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button
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
