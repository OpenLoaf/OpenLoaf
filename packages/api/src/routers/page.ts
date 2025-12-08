import { router, publicProcedure } from "../index";
import prisma from "@teatime-ai/db";
import type { Page, Prisma } from "@teatime-ai/db";
import z from "zod";

// 定义zod schema
export const pageIdInputSchema = z.string({ message: "Invalid ID" });
export const pageCreateInputSchema = z.object({
  title: z.string().optional(),
  icon: z.string().optional(),
  cover: z.string().optional(),
  parentId: z.string().optional(),
  workspaceId: z.string(),
});
export const pageUpdateInputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  icon: z.string().optional(),
  cover: z.string().optional(),
  parentId: z.string().optional(),
  isExpanded: z.boolean().optional(),
  workspaceId: z.string().optional(),
});
export const pageGetAllInputSchema = z.object({
  workspaceId: z.string(),
});

// 导出类型
export type PageIdInput = z.infer<typeof pageIdInputSchema>;
export type PageCreateInput = z.infer<typeof pageCreateInputSchema>;
export type PageUpdateInput = z.infer<typeof pageUpdateInputSchema>;

type PageNode = Prisma.PageGetPayload<{
  include: {
    resources: true;
  };
}>;
type PageWithRelations = Prisma.PageGetPayload<{
  include: {
    blocks: true;
    resources: true;
  };
}>;
type PageTreeNode = Omit<PageNode, "children"> & { children: PageTreeNode[] };

// 将扁平的页面列表转换为树形结构
const buildTree = (pages: PageNode[]): PageTreeNode[] => {
  const pageMap: Record<string, PageTreeNode> = {};
  const rootPages: PageTreeNode[] = [];

  // 首先将所有页面放入map中
  for (const page of pages) {
    pageMap[page.id] = { ...page, children: [] };
  }

  // 然后构建树形结构
  for (const page of pages) {
    const current = pageMap[page.id];

    // 在严格索引模式下显式检查父节点是否存在
    if (page.parentId) {
      const parent = pageMap[page.parentId];

      if (parent && current) {
        // 如果有父页面，将其添加到父页面的children数组中
        parent.children.push(current);
        continue;
      }
    }

    // 否则，将其添加到根页面数组中
    if (current) {
      rootPages.push(current);
    }
  }

  return rootPages;
};

export const pageRouter = router({
  // 获取所有页面
  getAll: publicProcedure
    .input(pageGetAllInputSchema)
    .query(async ({ input }): Promise<PageTreeNode[]> => {
      const pages = await prisma.page.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          resources: true,
        },
      });

      return buildTree(pages);
    }),

  // 获取单个页面
  getById: publicProcedure
    .input(z.object({ id: pageIdInputSchema, workspaceId: z.string() }))
    .query(async ({ input }): Promise<PageWithRelations | null> => {
      const page = await prisma.page.findUnique({
        where: { id: input.id, workspaceId: input.workspaceId },
        include: {
          blocks: true,
          resources: true,
        },
      });

      return page;
    }),

  // 创建页面
  create: publicProcedure
    .input(pageCreateInputSchema)
    .mutation(async ({ input }): Promise<Page> => {
      const page = await prisma.page.create({
        data: input,
      });

      return page;
    }),

  // 更新页面
  update: publicProcedure
    .input(pageUpdateInputSchema)
    .mutation(async ({ input }): Promise<Page> => {
      const { id, ...rest } = input;
      const page = await prisma.page.update({
        where: { id },
        data: rest,
      });

      return page;
    }),

  // 删除页面
  delete: publicProcedure
    .input(pageIdInputSchema)
    .mutation(async ({ input }): Promise<Page> => {
      const page = await prisma.page.delete({
        where: { id: input },
      });

      return page;
    }),
});
