import {
  t,
  shieldedProcedure,
  type Workspace,
  BaseWorkspaceRouter,
  workspaceSchemas,
} from "@teatime-ai/api";
import {
  createDefaultConfigIfNotExists,
  getConfigPath,
  getTeatimeConfig,
  writeTeatimeConfig,
} from "../config/index";
import { v4 as uuidv4 } from "uuid";

// 创建具体的实现类，继承自基类
export class WorkspaceRouterImpl extends BaseWorkspaceRouter {
  // 重写createRouter方法，实现具体的路由逻辑
  public static createRouter() {
    // 辅助函数：更新工作空间配置
    const updateWorkspaces = (
      updater: (workspaces: Workspace[]) => Workspace[]
    ) => {
      const config = getTeatimeConfig();
      const updatedWorkspaces = updater(config.workspaces as Workspace[]);
      writeTeatimeConfig({
        ...config,
        workspaces: updatedWorkspaces,
      });
      return updatedWorkspaces;
    };

    return t.router({
      // 获取工作空间列表
      getList: shieldedProcedure
        .output(workspaceSchemas.getList.output)
        .query(async () => {
          const config = getTeatimeConfig();
          return config.workspaces as Workspace[];
        }),

      // 获取激活的工作空间
      getActive: shieldedProcedure
        .output(workspaceSchemas.getActive.output)
        .query(async () => {
          const config = getTeatimeConfig();
          const workspaces = config.workspaces as Workspace[];
          // 确保返回有效的Workspace对象，永远不会返回undefined
          const activeWorkspace =
            workspaces.find((w) => w.isActive) ||
            createDefaultConfigIfNotExists(getConfigPath());
          // 由于配置确保至少有一个工作空间，这里可以安全断言
          return activeWorkspace as Workspace;
        }),

      // 新增工作空间
      create: shieldedProcedure
        .input(workspaceSchemas.create.input)
        .output(workspaceSchemas.create.output)
        .mutation(async ({ input }) => {
          const newWorkspace: Workspace = {
            id: uuidv4(),
            name: input.name,
            type: "local",
            isActive: false,
          };

          updateWorkspaces((workspaces) => [...workspaces, newWorkspace]);
          return newWorkspace;
        }),

      // 激活工作空间
      activate: shieldedProcedure
        .input(workspaceSchemas.activate.input)
        .output(workspaceSchemas.activate.output)
        .mutation(async ({ input }) => {
          const config = getTeatimeConfig();
          const workspaceToActivate = config.workspaces.find(
            (w) => w.id === input.id
          );

          if (!workspaceToActivate) {
            throw new Error("工作空间不存在");
          }

          updateWorkspaces((workspaces) =>
            workspaces.map((workspace) => ({
              ...workspace,
              isActive: workspace.id === input.id,
            }))
          );

          return { ...workspaceToActivate, isActive: true };
        }),

      // 删除工作空间
      delete: shieldedProcedure
        .input(workspaceSchemas.delete.input)
        .output(workspaceSchemas.delete.output)
        .mutation(async ({ input }) => {
          const config = getTeatimeConfig();

          // 确保至少保留一个工作空间
          if (config.workspaces.length <= 1) {
            throw new Error("至少需要保留一个工作空间");
          }

          const workspaceToDelete = config.workspaces.find(
            (w) => w.id === input.id
          );
          if (!workspaceToDelete) {
            throw new Error("工作空间不存在");
          }

          updateWorkspaces((workspaces) => {
            const updatedWorkspaces = workspaces.filter(
              (w) => w.id !== input.id
            );

            // 如果删除的是激活的工作空间，需要激活另一个
            if (workspaceToDelete.isActive && updatedWorkspaces.length > 0) {
              // 类型安全的方式更新第一个工作空间
              return updatedWorkspaces.map((ws, index) =>
                index === 0 ? { ...ws, isActive: true } : ws
              );
            }

            return updatedWorkspaces;
          });

          return true;
        }),

      // 更新工作空间名称
      updateName: shieldedProcedure
        .input(workspaceSchemas.updateName.input)
        .output(workspaceSchemas.updateName.output)
        .mutation(async ({ input }) => {
          const config = getTeatimeConfig();
          const workspaceToUpdate = config.workspaces.find(
            (w) => w.id === input.id
          );

          if (!workspaceToUpdate) {
            throw new Error("工作空间不存在");
          }

          updateWorkspaces((workspaces) =>
            workspaces.map((workspace) =>
              workspace.id === input.id
                ? { ...workspace, name: input.name }
                : workspace
            )
          );

          return { ...workspaceToUpdate, name: input.name };
        }),
    });
  }
}

// 导出路由实现
export const workspaceRouterImplementation = WorkspaceRouterImpl.createRouter();
