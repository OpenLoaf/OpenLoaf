import { create } from "zustand";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (workspace: Workspace) => void;
  refetchWorkspaces: () => void;
  createWorkspace: (name: string) => Promise<void>;
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
}

export const useWorkspace = () => {
  // 获取工作区列表
  const { data: workspaces = [], refetch: refetchWorkspaces } = useQuery(
    // trpc.workspace.getAll.queryOptions()
    trpc.workspace.findManyWorkspace.queryOptions({
      where: {isActive:true}
    })
    // trpc.workspace.getAll.queryOptions(),
  );

  // 获取当前激活的工作区
  const { data: activeWorkspace } = useQuery(
    trpc.workspace.findFirstWorkspace.queryOptions({
      where: { isActive: true },
    })
  );

  // 创建工作区的mutation
  const createWorkspaceMutation = useMutation(
    trpc.workspace.createOneWorkspace.mutationOptions()
  );

  // 更新工作区的mutation
  const updateWorkspaceMutation = useMutation(
    trpc.workspace.updateOneWorkspace.mutationOptions()
  );

  // 删除工作区的mutation
  const deleteWorkspaceMutation = useMutation(
    trpc.workspace.deleteOneWorkspace.mutationOptions()
  );

  // 设置激活的工作区
  const setActiveWorkspace = async (workspace: Workspace) => {
    try {
      await updateWorkspaceMutation.mutateAsync({
        data: {
          isActive: true,
        },
        where: {
          id: workspace.id,
        },
      });

      // 刷新工作区列表
      refetchWorkspaces();
    } catch (error) {
      console.error("Failed to set active workspace:", error);
    }
  };

  // 创建工作区
  const createWorkspace = async (name: string) => {
    try {
      await createWorkspaceMutation.mutateAsync({
        data: {
          name,
        },
      });

      // 刷新工作区列表
      refetchWorkspaces();
    } catch (error) {
      console.error("Failed to create workspace:", error);
    }
  };

  // 更新工作区
  const updateWorkspace = async (id: string, data: Partial<Workspace>) => {
    try {
      await updateWorkspaceMutation.mutateAsync({
        data,
        where: {
          id,
        },
      });

      // 刷新工作区列表
      refetchWorkspaces();
    } catch (error) {
      console.error("Failed to update workspace:", error);
    }
  };

  // 删除工作区
  const deleteWorkspace = async (id: string) => {
    try {
      await deleteWorkspaceMutation.mutateAsync({
        where: {
          id,
        },
      });

      // 刷新工作区列表
      refetchWorkspaces();
    } catch (error) {
      console.error("Failed to delete workspace:", error);
    }
  };

  return {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    refetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  };
};
