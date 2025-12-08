import { router, publicProcedure } from "../index";
import prisma from "@teatime-ai/db";
import type { Prisma, Resource } from "@teatime-ai/db";
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

type ResourceWithChildren = Prisma.ResourceGetPayload<{
  include: {
    children: true;
  };
}>;

export const resourceRouter = router({
  // 获取所有资源
  getAll: publicProcedure.query(async (): Promise<ResourceWithChildren[]> => {
    const resources = await prisma.resource.findMany({
      include: {
        children: true
      }
    });

    return resources;
  }),
  
  // 获取单个资源
  getById: publicProcedure
    .input(resourceIdInputSchema)
    .query(async ({ input }): Promise<ResourceWithChildren | null> => {
    const resource = await prisma.resource.findUnique({
      where: { id: input },
      include: {
        children: true
      }
    });

    return resource;
  }),
  
  // 创建资源
  create: publicProcedure
    .input(resourceCreateInputSchema)
    .mutation(async ({ input }): Promise<Resource> => {
    const resource = await prisma.resource.create({
      data: input
    });

    return resource;
  }),
  
  // 更新资源
  update: publicProcedure
    .input(resourceUpdateInputSchema)
    .mutation(async ({ input }): Promise<Resource> => {
    const resource = await prisma.resource.update({
      where: { id: input.id },
      data: input
    });

    return resource;
  }),
  
  // 删除资源
  delete: publicProcedure
    .input(resourceIdInputSchema)
    .mutation(async ({ input }): Promise<Resource> => {
    const resource = await prisma.resource.delete({
      where: { id: input }
    });

    return resource;
  })
});
