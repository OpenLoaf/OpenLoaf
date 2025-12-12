import { z } from "zod";
import { t, shieldedProcedure } from "../index";

// 定义PageTreeNode类型
export interface PageTreeNode {
  id: string;
  title: string | null;
  icon: string | null;
  cover: string | null;
  isExpanded: boolean;
  createdAt: Date;
  updatedAt: Date;
  parentId: string | null;
  children: PageTreeNode[];
  resources: any[];
  workspaceId: string;
}

const PageTreeNodeSchema: z.ZodType<PageTreeNode> = z.object({
  id: z.string(),
  title: z.string().nullable(),
  icon: z.string().nullable(),
  cover: z.string().nullable(),
  isExpanded: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  parentId: z.string().nullable(),
  children: z.lazy(() => PageTreeNodeSchema.array()),
  resources: z.array(z.any()),
  workspaceId: z.string(),
});

// 输入schema定义
const pageGetAllInputSchema = z.object({
  workspaceId: z.string(),
});

// 构建树结构的函数
function buildTree(pages: any[]): PageTreeNode[] {
  const pageMap = new Map<string, PageTreeNode>();
  const rootPages: PageTreeNode[] = [];

  // 首先将所有页面转换为PageTreeNode并存储在map中
  for (const page of pages) {
    const treeNode: PageTreeNode = {
      ...page,
      children: [],
    };
    pageMap.set(page.id, treeNode);
  }

  // 然后构建树结构
  for (const page of pages) {
    const treeNode = pageMap.get(page.id)!;
    if (page.parentId) {
      const parent = pageMap.get(page.parentId);
      if (parent) {
        parent.children.push(treeNode);
      }
    } else {
      rootPages.push(treeNode);
    }
  }

  return rootPages;
}

export const pageRouter = t.router({
  getAll: shieldedProcedure
    .input(pageGetAllInputSchema)
    .query(async ({ ctx, input }): Promise<PageTreeNode[]> => {
      console.log("==pageGetAllInputSchema==", input);
      const pages = await ctx.prisma.page.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          resources: true,
        },
      });

      return buildTree(pages);
    }),
});

export type PageRouter = typeof pageRouter;
