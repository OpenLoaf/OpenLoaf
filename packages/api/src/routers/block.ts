import { router, publicProcedure } from "../index";
import prisma from "@teatime-ai/db";
import type { Block, Prisma } from "@teatime-ai/db";
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

type BlockWithChildren = Prisma.BlockGetPayload<{
  include: {
    children: true;
  };
}>;

export const blockRouter = router({
  // 获取页面的所有内容块
  getAllByPageId: publicProcedure
    .input(blockPageIdInputSchema)
    .query(async ({ input }): Promise<BlockWithChildren[]> => {
    const blocks = await prisma.block.findMany({
      where: { pageId: input },
      include: {
        children: true
      },
      orderBy: { order: "asc" }
    });

    return blocks;
  }),
  
  // 获取单个内容块
  getById: publicProcedure.input(blockIdInputSchema).query(async ({ input }): Promise<BlockWithChildren | null> => {
    const block = await prisma.block.findUnique({
      where: { id: input },
      include: {
        children: true
      }
    });

    return block;
  }),
  
  // 创建内容块
  create: publicProcedure.input(blockCreateInputSchema).mutation(async ({ input }): Promise<Block> => {
    const block = await prisma.block.create({
      data: input
    });

    return block;
  }),
  
  // 更新内容块
  update: publicProcedure.input(blockUpdateInputSchema).mutation(async ({ input }): Promise<Block> => {
    const { id, ...rest } = input;
    const block = await prisma.block.update({
      where: { id },
      data: rest
    });

    return block;
  }),
  
  // 删除内容块
  delete: publicProcedure.input(blockIdInputSchema).mutation(async ({ input }): Promise<Block> => {
    const block = await prisma.block.delete({
      where: { id: input }
    });

    return block;
  })
});
