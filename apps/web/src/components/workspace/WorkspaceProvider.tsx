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
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { WorkspaceContext } from "@/components/workspace/workspaceContext";
import type { Workspace } from "@openloaf/api/types/workspace";
import { useEffect, useMemo } from "react";
import { useTabs } from "@/hooks/use-tabs";
import { DEFAULT_TAB_INFO } from "@openloaf/api/common";

interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  // 使用 TRPC 获取活跃工作区，使用 TanStack React Query 方式
  const { data: workspace = {} as Workspace, isLoading } = useQuery(
    trpc.workspace.getActive.queryOptions()
  );
  const addTab = useTabs((s) => s.addTab);
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);

  useEffect(() => {
    if (!workspace?.id) return;
    document.cookie = `workspace-id=${encodeURIComponent(
      workspace.id
    )}; path=/; max-age=31536000; SameSite=Lax`;
  }, [workspace?.id]);

  // 自动创建默认 AI 助手标签页（当工作区有 ID 且无活动标签页时）
  useEffect(() => {
    if (!workspace?.id) return;
    if (isLoading) return;
    if (activeTabId) return;

    // 检查是否已有该工作区的标签页
    const hasWorkspaceTabs = tabs.some((tab) => tab.workspaceId === workspace.id);
    if (hasWorkspaceTabs) return;

    // 创建默认 AI 助手标签页
    addTab({
      workspaceId: workspace.id,
      createNew: true,
      title: DEFAULT_TAB_INFO.titleKey,
      icon: DEFAULT_TAB_INFO.icon,
      leftWidthPercent: 0,
      rightChatCollapsed: false,
    });
  }, [workspace?.id, isLoading, activeTabId, tabs, addTab]);

  const contextValue = useMemo(
    () => ({ workspace, isLoading }),
    [workspace, isLoading],
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {!isLoading && children}
    </WorkspaceContext.Provider>
  );
};
