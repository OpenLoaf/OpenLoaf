import { router, publicProcedure } from "../index";
import prisma from "@teatime-ai/db";
import type { Workspace } from "@teatime-ai/db";
import z from "zod";

// 定义zod schema
export const workspaceIdInputSchema = z.string({ message: "Invalid ID" });
export const workspaceCreateInputSchema = z.object({
  name: z.string(),
});
export const workspaceUpdateInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  isActive: z.boolean().optional(),
});

// 导出类型
export type WorkspaceIdInput = z.infer<typeof workspaceIdInputSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateInputSchema>;
export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateInputSchema>;

// 创建默认工作区的辅助函数
const ensureDefaultWorkspace = async (): Promise<Workspace> => {
  // 使用事务确保默认工作区只会被创建一次
  return prisma.$transaction(async (prisma) => {
    // 先检查是否已经存在工作区
    const existingWorkspace = await prisma.workspace.findFirst();

    // 如果已经存在工作区，直接返回
    if (existingWorkspace) {
      return existingWorkspace;
    }

    // 否则创建默认工作区
    const workspace = await prisma.workspace.create({
      data: {
        name: "Default Workspace",
        isActive: true,
      },
    });

    return workspace;
  });
};

export const workspaceRouter = router({
  // 获取所有工作区
  getAll: publicProcedure.query(async () => {
    // 确保默认工作区存在
    await ensureDefaultWorkspace();

    const workspaces = await prisma.workspace.findMany();

    return workspaces;
  }),

  // 获取当前激活的工作区
  getActive: publicProcedure.query(async (): Promise<Workspace | null> => {
    // 确保默认工作区存在
    await ensureDefaultWorkspace();

    const activeWorkspace = await prisma.workspace.findFirst({
      where: { isActive: true },
    });

    // 如果没有激活的工作区，返回第一个工作区
    if (!activeWorkspace) {
      const fallbackWorkspace = await prisma.workspace.findFirst();
      return fallbackWorkspace;
    }

    return activeWorkspace;
  }),

  // 创建工作区
  create: publicProcedure
    .input(workspaceCreateInputSchema)
    .mutation(async ({ input }): Promise<Workspace> => {
      // 检查是否有其他激活的工作区
      const activeWorkspaces = await prisma.workspace.count({
        where: { isActive: true },
      });

      const workspace = await prisma.workspace.create({
        data: {
          ...input,
          isActive: activeWorkspaces === 0, // 如果是第一个工作区，设置为激活
        },
      });

      return workspace;
    }),

  // 更新工作区
  update: publicProcedure
    .input(workspaceUpdateInputSchema)
    .mutation(async ({ input }): Promise<Workspace> => {
      const { id, isActive, ...rest } = input;

      // 如果要设置为激活，先将其他工作区的isActive设置为false
      if (isActive) {
        await prisma.workspace.updateMany({
          data: { isActive: false },
        });
      }

      const workspace = await prisma.workspace.update({
        where: { id },
        data: {
          ...rest,
          ...(isActive !== undefined && { isActive }),
        },
      });

      return workspace;
    }),

  // 删除工作区
  delete: publicProcedure
    .input(workspaceIdInputSchema)
    .mutation(async ({ input }): Promise<Workspace> => {
      // 检查是否是最后一个工作区
      const workspaceCount = await prisma.workspace.count();
      if (workspaceCount <= 1) {
        throw new Error("Cannot delete the last workspace");
      }

      // 检查是否是激活的工作区
      const workspace = await prisma.workspace.findUnique({
        where: { id: input },
        select: { isActive: true },
      });

      const deleteResult = await prisma.workspace.delete({
        where: { id: input },
      });

      // 如果删除的是激活的工作区，将第一个工作区设置为激活
      if (workspace?.isActive) {
        // 先获取第一个工作区
        const firstWorkspace = await prisma.workspace.findFirst({
          where: { id: { not: input } },
          orderBy: { createdAt: "asc" },
        });

        // 如果存在其他工作区，将第一个工作区设置为激活
        if (firstWorkspace) {
          await prisma.workspace.update({
            where: { id: firstWorkspace.id },
            data: { isActive: true },
          });
        }
      }

      return deleteResult;
    }),
});
