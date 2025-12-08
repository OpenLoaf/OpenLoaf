import { initTRPC } from "@trpc/server";
import type { Context } from "./context";
export type { PrismaEnums } from "@teatime-ai/db";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;
