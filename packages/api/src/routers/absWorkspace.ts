import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";
import { z } from "zod";
import { workspaceBase } from "../types/workspace";

// 工作空间名称验证规则
export const workspaceNameSchema = z
  .string()
  .min(1, "工作空间名称不能为空")
  .max(50, "工作空间名称不能超过50个字符")
  .trim();

// 工作空间ID验证规则
export const workspaceIdSchema = z.string();

// 定义路由输入输出schema
export const workspaceSchemas = {
  getList: {
    output: z.array(workspaceBase),
  },
  getActive: {
    output: workspaceBase,
  },
  create: {
    input: z.object({
      name: workspaceNameSchema,
      rootUri: z.string().min(1, "工作空间保存目录不能为空").trim(),
    }),
    output: workspaceBase,
  },
  activate: {
    input: z.object({
      id: workspaceIdSchema,
    }),
    output: workspaceBase,
  },
  delete: {
    input: z.object({
      id: workspaceIdSchema,
    }),
    output: z.boolean(),
  },
  updateName: {
    input: z.object({
      id: workspaceIdSchema,
      name: workspaceNameSchema,
    }),
    output: workspaceBase,
  },
};

// 定义抽象路由类，包含所有路由的schema定义
export abstract class BaseWorkspaceRouter {
  // 路由名称
  public static routeName = "workspace";

  // 定义路由结构，子类需要实现具体的query/mutation逻辑
  public static createRouter() {
    return t.router({
      // 获取工作空间列表
      getList: shieldedProcedure
        .output(workspaceSchemas.getList.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),

      // 获取激活的工作空间
      getActive: shieldedProcedure
        .output(workspaceSchemas.getActive.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),

      // 新增工作空间
      create: shieldedProcedure
        .input(workspaceSchemas.create.input)
        .output(workspaceSchemas.create.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),

      // 激活工作空间
      activate: shieldedProcedure
        .input(workspaceSchemas.activate.input)
        .output(workspaceSchemas.activate.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),

      // 删除工作空间
      delete: shieldedProcedure
        .input(workspaceSchemas.delete.input)
        .output(workspaceSchemas.delete.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),

      // 更新工作空间名称
      updateName: shieldedProcedure
        .input(workspaceSchemas.updateName.input)
        .output(workspaceSchemas.updateName.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),

    });
  }
}

// 使用基类创建API路由框架
export const workspaceRouter = BaseWorkspaceRouter.createRouter();

export type WorkspaceRouter = typeof workspaceRouter;
