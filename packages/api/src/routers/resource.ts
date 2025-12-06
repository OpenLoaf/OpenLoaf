import { router, publicProcedure } from "../index";
import prisma, { PrismaEnums as _PrismaEnums } from "@teatime-ai/db";
import z from "zod";

// 定义zod schema
export const resourceIdInputSchema = z.string({ message: "Invalid ID" });
export const resourceCreateInputSchema = z.any();
export const resourceUpdateInputSchema = z.object({
  id: z.string(),
}).loose();

// 导出类型
export type ResourceIdInput = z.infer<typeof resourceIdInputSchema>;
export type ResourceCreateInput = z.infer<typeof resourceCreateInputSchema>;
export type ResourceUpdateInput = z.infer<typeof resourceUpdateInputSchema>;

export const resourceRouter = router({
  // 获取所有资源
  getAll: publicProcedure.query(async () => {
    return prisma.resource.findMany({
      include: {
        children: true
      }
    });
  }),
  
  // 获取单个资源
  getById: publicProcedure.input(resourceIdInputSchema).query(async ({ input }) => {
    return prisma.resource.findUnique({
      where: { id: input },
      include: {
        children: true
      }
    });
  }),
  
  // 创建资源
  create: publicProcedure.input(resourceCreateInputSchema).mutation(async ({ input }) => {
    return prisma.resource.create({
      data: input
    });
  }),
  
  // 更新资源
  update: publicProcedure.input(resourceUpdateInputSchema).mutation(async ({ input }) => {
    return prisma.resource.update({
      where: { id: input.id },
      data: input
    });
  }),
  
  // 删除资源
  delete: publicProcedure.input(resourceIdInputSchema).mutation(async ({ input }) => {
    return prisma.resource.delete({
      where: { id: input }
    });
  })
});
