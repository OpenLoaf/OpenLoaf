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

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, MoreHorizontal, Trash2, Edit2, FolderInput } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { useNavigation } from "@/hooks/use-navigation";
import { Button } from "@openloaf/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { ConvertChatToProjectDialog } from "./ConvertChatToProjectDialog";

interface WorkspaceChatListProps {
  workspaceId: string;
}

export function WorkspaceChatList({ workspaceId }: WorkspaceChatListProps) {
  const { t } = useTranslation("nav");
  const [expanded, setExpanded] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const setActiveWorkspaceChat = useNavigation((s) => s.setActiveWorkspaceChat);
  const activeWorkspaceChatSessionId = useNavigation((s) => s.activeWorkspaceChatSessionId);

  // 查询 Workspace Chat 列表
  const { data: chats, refetch } = useQuery(
    trpc.chat.listByWorkspace.queryOptions({
      workspaceId,
      projectId: null, // 只查询 Workspace 级别的对话
      limit: expanded ? undefined : 10,
    })
  );

  const deleteMutation = useMutation(
    trpc.chat.deleteSession.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    })
  );

  const updateMutation = useMutation(
    trpc.chat.updateSession.mutationOptions({
      onSuccess: () => {
        refetch();
      },
    })
  );

  const handleChatClick = useCallback(
    (chatId: string, chatTitle: string) => {
      // 检查是否已有该 chat 的 tab
      const existingTab = tabs.find(
        (tab) =>
          tab.workspaceId === workspaceId &&
          tab.chatSessionId === chatId
      );

      if (existingTab) {
        setActiveTab(existingTab.id);
      } else {
        // 创建新 tab
        addTab({
          workspaceId,
          createNew: true,
          title: chatTitle,
          icon: "💬",
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

  if (!chats || chats.length === 0) {
    return null;
  }

  const displayChats = expanded ? chats : chats.slice(0, 10);
  const hasMore = chats.length > 10;

  return (
    <div className="workspace-chat-list flex flex-col h-full">
      <div className="text-xs font-medium text-muted-foreground px-4 py-2 shrink-0">
        {t("workspaceChatList.title")}
      </div>
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 min-h-0">
        {displayChats.map((chat) => {
          const isActive = activeWorkspaceChatSessionId === chat.id;
          return (
            <div
              key={chat.id}
              className={`group/chat-item flex h-8 items-center gap-2 rounded-lg px-2 text-sm hover:bg-[var(--sidebar-project-accent)] dark:hover:bg-[var(--sidebar-project-accent)] cursor-pointer ${
                isActive ? "bg-[var(--sidebar-project-accent)] dark:bg-[var(--sidebar-project-accent)]" : ""
              }`}
              onClick={() => handleChatClick(chat.id, chat.title)}
            >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate min-w-0">{chat.title}</span>
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
                <DropdownMenuItem onClick={() => handleRename(chat.id, chat.title)}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  {t("workspaceChatList.contextMenu.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleConvertToProject(chat.id)}>
                  <FolderInput className="mr-2 h-4 w-4" />
                  {t("workspaceChatList.contextMenu.convertToProject")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDelete(chat.id)}
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
            refetch();
            setConvertDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
