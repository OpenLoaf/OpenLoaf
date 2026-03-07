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
import { useTranslation } from "react-i18next";
import { PenTool, ClipboardCopy, Edit2, FolderInput, Trash2, Sparkles, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient, skipToken } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useNavigation } from "@/hooks/use-navigation";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useProjects } from "@/hooks/use-projects";
import { buildFileUriFromRoot, getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { BOARD_META_FILE_NAME, getBoardDisplayName, ensureBoardFolderName } from "@/lib/file-name";
import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import { PageTreePicker } from "./ProjectTree";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";

interface WorkspaceCanvasListProps {
  workspaceId: string;
}

export function WorkspaceCanvasList({ workspaceId }: WorkspaceCanvasListProps) {
  const { t } = useTranslation("nav");
  const { workspace } = useWorkspace();
  const rootUri = workspace?.rootUri;

  const [canvasRenameTarget, setCanvasRenameTarget] = useState<{
    uri: string;
    name: string;
    nextName: string;
  } | null>(null);
  const [aiNaming, setAiNaming] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ uri: string; name: string } | null>(null);
  const [moveSelectedProjectId, setMoveSelectedProjectId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const boardsDirUri = rootUri
    ? buildFileUriFromRoot(rootUri, ".openloaf/boards")
    : "";

  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const tabs = useTabs((s) => s.tabs);
  const runtimeByTabId = useTabRuntime((s) => s.runtimeByTabId);
  const setActiveView = useNavigation((s) => s.setActiveView);

  const { data } = useQuery(
    trpc.fs.list.queryOptions(
      boardsDirUri
        ? {
            workspaceId,
            uri: ".openloaf/boards",
            includeHidden: true,
            sort: { field: "mtime", order: "desc" },
          }
        : skipToken,
    ),
  );

  const boards = (data?.entries ?? []).filter((e: any) => e.kind === "folder");

  const handleBoardClick = useCallback(
    (board: { uri: string; name: string }) => {
      if (!rootUri) return;
      const boardFolderUri = buildFileUriFromRoot(rootUri, board.uri);
      const boardFileUri = buildFileUriFromRoot(
        rootUri,
        `${board.uri}/${BOARD_META_FILE_NAME}`,
      );
      const baseId = `board:${boardFolderUri}`;

      // Check if already open in a tab
      const existingTab = tabs.find((tab) => {
        if (tab.workspaceId !== workspaceId) return false;
        const base = runtimeByTabId[tab.id]?.base;
        return base?.id === baseId;
      });

      if (existingTab) {
        setActiveTab(existingTab.id);
      } else {
        const displayName = getBoardDisplayName(board.name) || t("canvasList.untitled");
        addTab({
          workspaceId,
          createNew: true,
          title: displayName,
          icon: "🎨",
          leftWidthPercent: 100,
          base: {
            id: baseId,
            component: "board-viewer",
            params: { boardFolderUri, boardFileUri },
          },
        });
      }

      setActiveView("canvas" as any);
    },
    [rootUri, workspaceId, tabs, runtimeByTabId, addTab, setActiveTab, setActiveView, t],
  );

  const handleCopyPath = useCallback(
    async (boardUri: string) => {
      if (!rootUri) return;
      const fullUri = buildFileUriFromRoot(rootUri, boardUri);
      const displayPath = getDisplayPathFromUri(fullUri);
      await navigator.clipboard.writeText(displayPath);
      toast.success(t("canvasList.pathCopied"));
    },
    [rootUri, t],
  );

  // Rename
  const renameBoardMutation = useMutation(
    trpc.fs.rename.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.fs.list.queryKey() });
        setCanvasRenameTarget(null);
      },
    }),
  );

  const handleCanvasRename = useCallback(
    (uri: string, displayName: string) => {
      setCanvasRenameTarget({ uri, name: displayName, nextName: displayName });
    },
    [],
  );

  const handleCanvasRenameSave = useCallback(() => {
    if (!canvasRenameTarget || !canvasRenameTarget.nextName.trim()) return;
    const newFolderName = ensureBoardFolderName(canvasRenameTarget.nextName);
    const parentUri = canvasRenameTarget.uri.split("/").slice(0, -1).join("/");
    const newUri = parentUri ? `${parentUri}/${newFolderName}` : newFolderName;
    renameBoardMutation.mutate({
      workspaceId,
      from: canvasRenameTarget.uri,
      to: newUri,
    });
  }, [canvasRenameTarget, renameBoardMutation, workspaceId]);

  const inferBoardNameMutation = useMutation(
    trpc.settings.inferBoardName.mutationOptions(),
  );

  const handleAiName = useCallback(async () => {
    if (!canvasRenameTarget) return;
    setAiNaming(true);
    try {
      const result = await inferBoardNameMutation.mutateAsync({
        workspaceId,
        boardFolderUri: canvasRenameTarget.uri,
      });
      if (result.title) {
        setCanvasRenameTarget((prev) =>
          prev ? { ...prev, nextName: result.title } : prev,
        );
      } else {
        toast.error(t("canvasList.aiNameEmpty"));
      }
    } catch {
      toast.error(t("canvasList.aiNameFailed"));
    } finally {
      setAiNaming(false);
    }
  }, [canvasRenameTarget, workspaceId, t]);

  // Delete
  const deleteBoardMutation = useMutation(
    trpc.fs.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.fs.list.queryKey() });
      },
    }),
  );

  const handleCanvasDelete = useCallback(
    (uri: string) => {
      if (confirm(t("canvasList.confirmDelete"))) {
        deleteBoardMutation.mutate({ workspaceId, uri });
      }
    },
    [deleteBoardMutation, workspaceId, t],
  );

  // Move to project
  const projectListQuery = useProjects();
  const projectTree = useMemo(() => {
    const walk = (items?: ProjectNode[]): ProjectNode[] =>
      (items ?? [])
        .filter((item) => Boolean(item.projectId))
        .map((item) => ({
          ...item,
          children: item.children?.length ? walk(item.children) : [],
        }));
    return walk(projectListQuery.data);
  }, [projectListQuery.data]);

  const projectIdByRootUri = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (items?: ProjectNode[]) => {
      items?.forEach((item) => {
        if (item.projectId) map.set(item.rootUri, item.projectId);
        if (item.children?.length) walk(item.children);
      });
    };
    walk(projectListQuery.data);
    return map;
  }, [projectListQuery.data]);

  const handleMoveToProject = useCallback(
    (uri: string, name: string) => {
      setMoveTarget({ uri, name });
      setMoveSelectedProjectId(null);
    },
    [],
  );

  const moveBoardMutation = useMutation(
    trpc.fs.rename.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.fs.list.queryKey() });
        setMoveTarget(null);
        toast.success(t("canvasList.movedToProject"));
      },
      onError: (error: any) => {
        toast.error(error?.message ?? t("canvasList.moveFailed"));
      },
    }),
  );

  const handleConfirmMove = useCallback(() => {
    if (!moveTarget || !moveSelectedProjectId) return;
    const folderName = moveTarget.uri.split("/").pop() ?? "";
    moveBoardMutation.mutate({
      workspaceId,
      from: moveTarget.uri,
      to: `@[${moveSelectedProjectId}]/.openloaf/boards/${folderName}`,
    });
  }, [moveTarget, moveSelectedProjectId, moveBoardMutation, workspaceId]);

  // Find which board is currently active
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeBase = activeTabId ? runtimeByTabId[activeTabId]?.base : undefined;
  const activeBoardBaseId =
    activeBase?.component === "board-viewer" ? activeBase.id : undefined;

  if (boards.length === 0) {
    return null;
  }

  return (
    <div className="workspace-canvas-list flex flex-col">
      <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground/70">{t('canvas')}</div>
      <div className="px-2 space-y-0.5">
        {boards.map((board: any) => {
          const boardFolderUri = rootUri
            ? buildFileUriFromRoot(rootUri, board.uri)
            : "";
          const baseId = `board:${boardFolderUri}`;
          const isActive = activeBoardBaseId === baseId;
          const displayName = getBoardDisplayName(board.name) || t("canvasList.untitled");
          const isWorkspaceLevel = board.uri.startsWith(".openloaf/boards");

          return (
            <ContextMenu key={board.uri}>
              <ContextMenuTrigger asChild>
                <div
                  className={`group/canvas-item flex h-8 items-center gap-2 rounded-lg px-2 text-sm hover:bg-[var(--sidebar-project-accent)] dark:hover:bg-[var(--sidebar-project-accent)] cursor-pointer ${
                    isActive
                      ? "bg-[var(--sidebar-project-accent)] dark:bg-[var(--sidebar-project-accent)]"
                      : ""
                  }`}
                  onClick={() => handleBoardClick(board)}
                >
                  <PenTool className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate min-w-0">{displayName}</span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuItem
                  icon={Edit2}
                  onClick={() => handleCanvasRename(board.uri, displayName)}
                >
                  {t("workspaceChatList.contextMenu.rename")}
                </ContextMenuItem>
                <ContextMenuItem
                  icon={ClipboardCopy}
                  onClick={() => void handleCopyPath(board.uri)}
                >
                  {t("canvasList.copyPath")}
                </ContextMenuItem>
                {isWorkspaceLevel && (
                  <ContextMenuItem
                    icon={FolderInput}
                    onClick={() => handleMoveToProject(board.uri, displayName)}
                  >
                    {t("canvasList.moveToProject")}
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  icon={Trash2}
                  onClick={() => handleCanvasDelete(board.uri)}
                  className="text-destructive"
                >
                  {t("workspaceChatList.contextMenu.delete")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      {/* Rename dialog */}
      <Dialog
        open={!!canvasRenameTarget}
        onOpenChange={(open) => {
          if (!open) setCanvasRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("canvasList.renameTitle")}</DialogTitle>
            <DialogDescription>{t("canvasList.renameDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              value={canvasRenameTarget?.nextName ?? ""}
              onChange={(e) =>
                setCanvasRenameTarget((prev) =>
                  prev ? { ...prev, nextName: e.target.value } : prev,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCanvasRenameSave();
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              title={t("canvasList.aiName")}
              disabled={aiNaming}
              onClick={handleAiName}
            >
              {aiNaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button onClick={handleCanvasRenameSave}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Move to project dialog */}
      <Dialog
        open={!!moveTarget}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("canvasList.selectProject")}</DialogTitle>
            <DialogDescription>{t("canvasList.selectProjectDesc")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto -mx-2">
            <PageTreePicker
              projects={projectTree}
              activeUri={
                moveSelectedProjectId
                  ? projectTree.find(
                      (p) => p.projectId === moveSelectedProjectId,
                    )?.rootUri ?? null
                  : null
              }
              onSelect={(uri) => {
                const projectId = projectIdByRootUri.get(uri);
                if (projectId) setMoveSelectedProjectId(projectId);
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button
              onClick={handleConfirmMove}
              disabled={!moveSelectedProjectId || moveBoardMutation.isPending}
            >
              {t("canvasList.moveToProject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
