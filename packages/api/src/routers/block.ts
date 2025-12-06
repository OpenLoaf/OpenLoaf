import { router, publicProcedure } from "../index";
import prisma from "@teatime-ai/db";
import z from "zod";

// 定义zod schema
export const blockIdInputSchema = z.string({ message: "Invalid ID" });
export const blockPageIdInputSchema = z.string({ message: "Invalid page ID" });
export const blockCreateInputSchema = z.object({
  pageId: z.string(),
  type: z.string(),
  props: z.any().optional(),
  content: z.any().optional(), // Plate.js Slate JSON格式
  parentId: z.string().optional(),
  order: z.number(),
});
export const blockUpdateInputSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  props: z.any().optional(),
  content: z.any().optional(), // Plate.js Slate JSON格式
  parentId: z.string().optional(),
  order: z.number().optional(),
});

// 导出类型
export type BlockIdInput = z.infer<typeof blockIdInputSchema>;
export type BlockPageIdInput = z.infer<typeof blockPageIdInputSchema>;
export type BlockCreateInput = z.infer<typeof blockCreateInputSchema>;
export type BlockUpdateInput = z.infer<typeof blockUpdateInputSchema>;

export const blockRouter = router({
  // 获取页面的所有内容块
  getAllByPageId: publicProcedure.input(blockPageIdInputSchema).query(async ({ input }) => {
    return prisma.block.findMany({
      where: { pageId: input },
      include: {
        children: true
      },
      orderBy: { order: "asc" }
    });
  }),
  
  // 获取单个内容块
  getById: publicProcedure.input(blockIdInputSchema).query(async ({ input }) => {
    return prisma.block.findUnique({
      where: { id: input },
      include: {
        children: true
      }
    });
  }),
  
  // 创建内容块
  create: publicProcedure.input(blockCreateInputSchema).mutation(async ({ input }) => {
    return prisma.block.create({
      data: input
    });
  }),
  
  // 更新内容块
  update: publicProcedure.input(blockUpdateInputSchema).mutation(async ({ input }) => {
    const { id, ...rest } = input;
    return prisma.block.update({
      where: { id },
      data: rest
    });
  }),
  
  // 删除内容块
  delete: publicProcedure.input(blockIdInputSchema).mutation(async ({ input }) => {
    return prisma.block.delete({
      where: { id: input }
    });
  })
});
