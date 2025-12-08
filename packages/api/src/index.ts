import { initTRPC } from "@trpc/server";
import type { Context } from "./context";
// 导入并重新导出，确保类型系统能解析完整依赖链
import prisma, { PrismaEnums as _PrismaEnums } from "@teatime-ai/db";
export type { PrismaEnums } from "@teatime-ai/db";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;
