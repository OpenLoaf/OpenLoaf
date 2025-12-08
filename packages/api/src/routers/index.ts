import { publicProcedure, router } from "../index";
import { pageRouter } from "./page";
import { blockRouter } from "./block";
import { resourceRouter } from "./resource";
import { workspaceRouter } from "./workspace";
import { chatRouter } from "./chat";
import prisma, { PrismaEnums as _PrismaEnums } from "@teatime-ai/db";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  page: pageRouter,
  block: blockRouter,
  resource: resourceRouter,
  workspace: workspaceRouter,
  chat: chatRouter,
});
export type AppRouter = typeof appRouter;
