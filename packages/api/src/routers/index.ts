import { publicProcedure, router } from "../index";
import { pageRouter } from "./page";
import { blockRouter } from "./block";
import { resourceRouter } from "./resource";
import { workspaceRouter } from "./workspace";
import { chatRouter } from "./chat";
import { settingRouter } from "./setting";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  page: pageRouter,
  block: blockRouter,
  resource: resourceRouter,
  workspace: workspaceRouter,
  chat: chatRouter,
  setting: settingRouter,
});
export type AppRouter = typeof appRouter;
