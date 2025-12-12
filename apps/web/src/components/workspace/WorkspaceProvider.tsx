"use client";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { WorkspaceContext } from "@/app/page";
import type { Workspace } from "@teatime-ai/api";

interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  // 使用 TRPC 获取活跃工作区，使用 TanStack React Query 方式
  const { data: workspace = {} as Workspace, isLoading } = useQuery(
    trpc.workspace.getActive.queryOptions()
  );

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
