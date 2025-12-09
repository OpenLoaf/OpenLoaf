import { router, publicProcedure } from "../index";
import prisma from "@teatime-ai/db";
import type { Setting } from "@teatime-ai/db";
import z from "zod";

// 定义zod schema
export const settingIdInputSchema = z.string({ message: "Invalid ID" });
export const settingCreateInputSchema = z.object({
  key: z.string(),
  value: z.string(),
  secret: z.boolean().optional(),
  type: z.enum(["APP", "UI", "SYSTEM", "USER"]).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  isReadonly: z.boolean().optional(),
});
export const settingUpdateInputSchema = z.object({
  id: settingIdInputSchema,
  key: z.string().optional(),
  value: z.string().optional(),
  secret: z.boolean().optional(),
  type: z.enum(["APP", "UI", "SYSTEM", "USER"]).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  isReadonly: z.boolean().optional(),
});
export const settingGetByKeyInputSchema = z.object({
  key: z.string(),
});
export const settingGetByTypeInputSchema = z.object({
  type: z.enum(["APP", "UI", "SYSTEM", "USER"]),
});
export const settingGetByCategoryInputSchema = z.object({
  category: z.string(),
});

// 导出类型
export type SettingIdInput = z.infer<typeof settingIdInputSchema>;
export type SettingCreateInput = z.infer<typeof settingCreateInputSchema>;
export type SettingUpdateInput = z.infer<typeof settingUpdateInputSchema>;

export const settingRouter: ReturnType<typeof router> = router({
  // 获取所有设置
  getAll: publicProcedure.query(async (): Promise<Setting[]> => {
    const settings = await prisma.setting.findMany();
    return settings;
  }),

  // 根据ID获取设置
  getById: publicProcedure
    .input(z.object({ id: settingIdInputSchema }))
    .query(async ({ input }): Promise<Setting | null> => {
      const setting = await prisma.setting.findUnique({
        where: { id: input.id },
      });
      return setting;
    }),

  // 根据Key获取设置
  getByKey: publicProcedure
    .input(settingGetByKeyInputSchema)
    .query(async ({ input }): Promise<Setting | null> => {
      const setting = await prisma.setting.findUnique({
        where: { key: input.key },
      });
      return setting;
    }),

  // 根据Type获取设置
  getByType: publicProcedure
    .input(settingGetByTypeInputSchema)
    .query(async ({ input }): Promise<Setting[]> => {
      const settings = await prisma.setting.findMany({
        where: { type: input.type },
      });
      return settings;
    }),

  // 根据Category获取设置
  getByCategory: publicProcedure
    .input(settingGetByCategoryInputSchema)
    .query(async ({ input }): Promise<Setting[]> => {
      const settings = await prisma.setting.findMany({
        where: { category: input.category },
      });
      return settings;
    }),

  // 创建设置
  create: publicProcedure
    .input(settingCreateInputSchema)
    .mutation(async ({ input }): Promise<Setting> => {
      const setting = await prisma.setting.create({
        data: input,
      });
      return setting;
    }),

  // 更新设置
  update: publicProcedure
    .input(settingUpdateInputSchema)
    .mutation(async ({ input }): Promise<Setting> => {
      const { id, ...rest } = input;
      const setting = await prisma.setting.update({
        where: { id },
        data: rest,
      });
      return setting;
    }),

  // 删除设置
  delete: publicProcedure
    .input(settingIdInputSchema)
    .mutation(async ({ input }): Promise<Setting> => {
      const setting = await prisma.setting.delete({
        where: { id: input },
      });
      return setting;
    }),
});
