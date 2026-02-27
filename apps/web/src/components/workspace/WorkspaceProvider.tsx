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
import { useEffect } from "react";

interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  // 使用 TRPC 获取活跃工作区，使用 TanStack React Query 方式
  const { data: workspace = {} as Workspace, isLoading } = useQuery(
    trpc.workspace.getActive.queryOptions()
  );

  useEffect(() => {
    if (!workspace?.id) return;
    document.cookie = `workspace-id=${encodeURIComponent(
      workspace.id
    )}; path=/; max-age=31536000; SameSite=Lax`;
  }, [workspace?.id]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        isLoading,
      }}
    >
      {!isLoading && children}
    </WorkspaceContext.Provider>
  );
};
