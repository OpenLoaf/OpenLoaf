import { router, publicProcedure } from "../index";
import prisma, { PrismaEnums as _PrismaEnums } from "@teatime-ai/db";
import z from "zod";

// 定义zod schema
export const pageIdInputSchema = z.string({ message: "Invalid ID" });
export const pageCreateInputSchema = z.object({
  title: z.string().optional(),
  icon: z.string().optional(),
  cover: z.string().optional(),
  parentId: z.string().optional(),
});
export const pageUpdateInputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  icon: z.string().optional(),
  cover: z.string().optional(),
  parentId: z.string().optional(),
  isExpanded: z.boolean().optional(),
});

// 导出类型
export type PageIdInput = z.infer<typeof pageIdInputSchema>;
export type PageCreateInput = z.infer<typeof pageCreateInputSchema>;
export type PageUpdateInput = z.infer<typeof pageUpdateInputSchema>;

// 将扁平的页面列表转换为树形结构
const buildTree = (pages: any[]) => {
  const pageMap: Record<string, any> = {};
  const rootPages: any[] = [];

  // 首先将所有页面放入map中
  for (const page of pages) {
    pageMap[page.id] = { ...page, children: [] };
  }

  // 然后构建树形结构
  for (const page of pages) {
    if (page.parentId) {
      // 如果有父页面，将其添加到父页面的children数组中
      if (pageMap[page.parentId]) {
        pageMap[page.parentId].children.push(pageMap[page.id]);
      }
    } else {
      // 否则，将其添加到根页面数组中
      rootPages.push(pageMap[page.id]);
    }
  }

  return rootPages;
};

export const pageRouter = router({
  // 获取所有页面
  getAll: publicProcedure.query(async ({}) => {
    const pages = await prisma.page.findMany({
      include: {
        children: true,
        resources: true,
      },
    });

    return buildTree(pages);
  }),

  // 获取单个页面
  getById: publicProcedure.input(pageIdInputSchema).query(async ({ input }) => {
    return prisma.page.findUnique({
      where: { id: input },
      include: {
        blocks: true,
        resources: true,
      },
    });
  }),

  // 创建页面
  create: publicProcedure
    .input(pageCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      return prisma.page.create({
        data: input,
      });
    }),

  // 更新页面
  update: publicProcedure
    .input(pageUpdateInputSchema)
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      return prisma.page.update({
        where: { id },
        data: rest,
      });
    }),

  // 删除页面
  delete: publicProcedure
    .input(pageIdInputSchema)
    .mutation(async ({ input }) => {
      return prisma.page.delete({
        where: { id: input },
      });
    }),
});
