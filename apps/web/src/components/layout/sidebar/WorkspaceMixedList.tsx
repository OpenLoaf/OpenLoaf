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

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, MoreHorizontal, Trash2, Edit2, FolderInput, PenTool, Sparkles, Loader2, ClipboardCopy } from "lucide-react";
import { useQuery, useMutation, useQueryClient, skipToken } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useNavigation } from "@/hooks/use-navigation";
import { useWorkspace } from "@/components/workspace/workspaceContext";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { ConvertChatToProjectDialog } from "./ConvertChatToProjectDialog";
import { PageTreePicker } from "./ProjectTree";
import { useProjects } from "@/hooks/use-projects";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { getCachedAccessToken } from "@/lib/saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";

type MixedItem =
  | { kind: "chat"; id: string; title: string; updatedAt: string; isPin?: boolean; raw: any }
  | { kind: "canvas"; uri: string; name: string; updatedAt: string; raw: any };

interface WorkspaceMixedListProps {
  workspaceId: string;
}

export function WorkspaceMixedList({ workspaceId }: WorkspaceMixedListProps) {
  const { t } = useTranslation("nav");
  const { workspace } = useWorkspace();
  const rootUri = workspace?.rootUri;

  const [expanded, setExpanded] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [canvasRenameTarget, setCanvasRenameTarget] = useState<{
    uri: string;
    name: string;
    nextName: string;
  } | null>(null);
  const [aiNaming, setAiNaming] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ uri: string; name: string } | null>(null);
  const [moveSelectedProjectId, setMoveSelectedProjectId] = useState<string | null>(null);
  const { loggedIn: saasLoggedIn } = useSaasAuth();

  const queryClient = useQueryClient();
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const runtimeByTabId = useTabRuntime((s) => s.runtimeByTabId);
  const setActiveWorkspaceChat = useNavigation((s) => s.setActiveWorkspaceChat);
  const activeWorkspaceChatSessionId = useNavigation((s) => s.activeWorkspaceChatSessionId);


  const boardsDirUri = rootUri
    ? buildFileUriFromRoot(rootUri, ".openloaf/boards")
    : "";

  // Fetch chats
  const { data: chats, refetch: refetchChats } = useQuery(
    trpc.chat.listByWorkspace.queryOptions({
      workspaceId,
      projectId: null,
      limit: expanded ? undefined : 50,
    })
  );

  // Fetch boards
  const { data: boardsData } = useQuery(
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

  const boards = (boardsData?.entries ?? []).filter((e: any) => e.kind === "folder");

  const deleteMutation = useMutation(
    trpc.chat.deleteSession.mutationOptions({
      onSuccess: () => refetchChats(),
    })
  );

  const updateMutation = useMutation(
    trpc.chat.updateSession.mutationOptions({
      onSuccess: () => refetchChats(),
    })
  );

  // Merge and sort by updatedAt descending
  const mixedItems = useMemo<MixedItem[]>(() => {
    const items: MixedItem[] = [];

    if (chats) {
      for (const chat of chats) {
        items.push({
          kind: "chat",
          id: chat.id,
          title: chat.title,
          updatedAt: chat.updatedAt as unknown as string,
          isPin: chat.isPin ?? undefined,
          raw: chat,
        });
      }
    }

    for (const board of boards) {
      const displayName = getBoardDisplayName(board.name) || t("canvasList.untitled");
      items.push({
        kind: "canvas",
        uri: board.uri,
        name: displayName,
        updatedAt: board.updatedAt,
        raw: board,
      });
    }

    // Pinned chats first, then sort by updatedAt desc
    items.sort((a, b) => {
      const aPin = a.kind === "chat" && a.isPin ? 1 : 0;
      const bPin = b.kind === "chat" && b.isPin ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return items;
  }, [chats, boards, t]);

  // Chat click handler
  const handleChatClick = useCallback(
    (chatId: string, chatTitle: string) => {
      const existingTab = tabs.find(
        (tab) => tab.workspaceId === workspaceId && tab.chatSessionId === chatId
      );

      if (existingTab) {
        setActiveTab(existingTab.id);
      } else {
        addTab({
          workspaceId,
          createNew: true,
          title: chatTitle,
          icon: "\uD83D\uDCAC",
          chatSessionId: chatId,
          chatParams: { projectId: null },
          leftWidthPercent: 0,
          rightChatCollapsed: false,
          chatLoadHistory: true,
        });
      }

      setActiveWorkspaceChat(chatId);
    },
    [workspaceId, tabs, addTab, setActiveTab, setActiveWorkspaceChat]
  );

  // Board click handler
  const handleBoardClick = useCallback(
    (board: { uri: string; name: string }) => {
      if (!rootUri) return;
      const boardFolderUri = buildFileUriFromRoot(rootUri, board.uri);
      const boardFileUri = buildFileUriFromRoot(
        rootUri,
        `${board.uri}/${BOARD_META_FILE_NAME}`,
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
        const displayName = getBoardDisplayName(board.name) || t("canvasList.untitled");
        addTab({
          workspaceId,
          createNew: true,
          title: displayName,
          icon: "\uD83C\uDFA8",
          leftWidthPercent: 100,
          base: {
            id: baseId,
            component: "board-viewer",
            params: { boardFolderUri, boardFileUri },
          },
        });
      }

      setActiveWorkspaceChat(null);
    },
    [rootUri, workspaceId, tabs, runtimeByTabId, addTab, setActiveTab, setActiveWorkspaceChat, t],
  );

  const handleDelete = useCallback(
    (chatId: string) => {
      if (confirm(t("workspaceChatList.confirmDelete"))) {
        deleteMutation.mutate({ sessionId: chatId });
      }
    },
    [deleteMutation, t]
  );

  const handleRename = useCallback(
    (chatId: string, currentTitle: string) => {
      const newTitle = prompt(t("workspaceChatList.renamePrompt"), currentTitle);
      if (newTitle && newTitle.trim() !== currentTitle) {
        updateMutation.mutate({
          sessionId: chatId,
          title: newTitle.trim(),
          isUserRename: true,
        });
      }
    },
    [updateMutation, t]
  );

  const handleConvertToProject = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
    setConvertDialogOpen(true);
  }, []);

  const renameBoardMutation = useMutation(
    trpc.fs.rename.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.fs.list.queryKey() });
        setCanvasRenameTarget(null);
      },
    }),
  );

  const deleteBoardMutation = useMutation(
    trpc.fs.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.fs.list.queryKey() });
      },
    }),
  );

  const handleCanvasRename = useCallback(
    (uri: string, displayName: string) => {
      setCanvasRenameTarget({ uri, name: displayName, nextName: displayName });
    },
    [],
  );

  const handleCanvasDelete = useCallback(
    (uri: string) => {
      if (confirm(t("canvasList.confirmDelete"))) {
        deleteBoardMutation.mutate({ workspaceId, uri });
      }
    },
    [deleteBoardMutation, workspaceId, t],
  );

  const handleCopyCanvasPath = useCallback(
    async (uri: string) => {
      if (!rootUri) return;
      const fullUri = buildFileUriFromRoot(rootUri, uri);
      const displayPath = getDisplayPathFromUri(fullUri);
      await navigator.clipboard.writeText(displayPath);
      toast.success(t("canvasList.pathCopied"));
    },
    [rootUri, t],
  );

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
    if (!saasLoggedIn) {
      setLoginOpen(true);
      return;
    }
    setAiNaming(true);
    try {
      const result = await inferBoardNameMutation.mutateAsync({
        workspaceId,
        boardFolderUri: canvasRenameTarget.uri,
        saasAccessToken: getCachedAccessToken() ?? undefined,
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
  }, [canvasRenameTarget, workspaceId, saasLoggedIn, t]);

  // Auto-close login dialog on successful login
  useEffect(() => {
    if (saasLoggedIn && loginOpen) setLoginOpen(false);
  }, [saasLoggedIn, loginOpen]);

  // Active board detection
  const activeBase = activeTabId ? runtimeByTabId[activeTabId]?.base : undefined;
  const activeBoardBaseId =
    activeBase?.component === "board-viewer" ? activeBase.id : undefined;

  if (mixedItems.length === 0) {
    return null;
  }

  const COLLAPSED_LIMIT = 15;
  const displayItems = expanded ? mixedItems : mixedItems.slice(0, COLLAPSED_LIMIT);
  const hasMore = mixedItems.length > COLLAPSED_LIMIT;

  return (
    <div className="workspace-mixed-list flex flex-col">
      <div className="px-2 space-y-0.5">
        {displayItems.map((item) => {
          if (item.kind === "chat") {
            const isActive = activeWorkspaceChatSessionId === item.id;
            return (
              <div
                key={`chat:${item.id}`}
                className={`group/chat-item flex h-8 items-center gap-2 rounded-lg px-2 text-sm hover:bg-[var(--sidebar-project-accent)] dark:hover:bg-[var(--sidebar-project-accent)] cursor-pointer ${
                  isActive ? "bg-[var(--sidebar-project-accent)] dark:bg-[var(--sidebar-project-accent)]" : ""
                }`}
                onClick={() => handleChatClick(item.id, item.title)}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate min-w-0">{item.title}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover/chat-item:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleRename(item.id, item.title)}>
                      <Edit2 className="mr-2 h-4 w-4" />
                      {t("workspaceChatList.contextMenu.rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleConvertToProject(item.id)}>
                      <FolderInput className="mr-2 h-4 w-4" />
                      {t("workspaceChatList.contextMenu.convertToProject")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(item.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("workspaceChatList.contextMenu.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          }

          // Canvas item
          const boardFolderUri = rootUri
            ? buildFileUriFromRoot(rootUri, item.uri)
            : "";
          const baseId = `board:${boardFolderUri}`;
          const isActive = activeBoardBaseId === baseId;

          return (
            <div
              key={`canvas:${item.uri}`}
              className={`group/canvas-item flex h-8 items-center gap-2 rounded-lg px-2 text-sm hover:bg-[var(--sidebar-project-accent)] dark:hover:bg-[var(--sidebar-project-accent)] cursor-pointer ${
                isActive
                  ? "bg-[var(--sidebar-project-accent)] dark:bg-[var(--sidebar-project-accent)]"
                  : ""
              }`}
              onClick={() => handleBoardClick(item.raw)}
            >
              <PenTool className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate min-w-0">{item.name}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover/canvas-item:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleCanvasRename(item.uri, item.name)}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    {t("workspaceChatList.contextMenu.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleCopyCanvasPath(item.uri)}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                    {t("canvasList.copyPath")}
                  </DropdownMenuItem>
                  {item.uri.startsWith(".openloaf/boards") && (
                    <DropdownMenuItem onClick={() => handleMoveToProject(item.uri, item.name)}>
                      <FolderInput className="mr-2 h-4 w-4" />
                      {t("canvasList.moveToProject")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => handleCanvasDelete(item.uri)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("workspaceChatList.contextMenu.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
      {!expanded && hasMore && (
        <div className="px-2 pt-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => setExpanded(true)}
          >
            {t("workspaceChatList.viewMore")}
          </Button>
        </div>
      )}
      {selectedChatId && (
        <ConvertChatToProjectDialog
          open={convertDialogOpen}
          onOpenChange={setConvertDialogOpen}
          chatSessionId={selectedChatId}
          workspaceId={workspaceId}
          onSuccess={() => {
            refetchChats();
            setConvertDialogOpen(false);
          }}
        />
      )}
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
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
              className={`transition-colors duration-150 ${
                aiNaming
                  ? "text-muted-foreground opacity-50"
                  : saasLoggedIn
                    ? "text-amber-500 hover:text-amber-600 hover:border-amber-300 dark:text-amber-400 dark:hover:text-amber-300"
                    : "text-muted-foreground"
              }`}
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
