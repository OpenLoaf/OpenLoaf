// import superjson from "superjson";
// Export generated routers
// @ts-ignore
import { appRouter as internalAppRouter } from "../generated/routers";
import { t } from "../generated/routers/helpers/createRouter";
import { pageRouter } from "./routers/page";
import {
  workspaceRouter,
  BaseWorkspaceRouter,
  workspaceSchemas,
} from "./routers/absWorkspace";
import { tabRouter, BaseTabRouter, tabSchemas } from "./routers/absTab";
import { chatRouter } from "./routers/chat";
import { BaseChatRouter, chatSchemas } from "./routers/absChat";
import { health } from "./routers/health";

export const appRouterDefine = {
  ...internalAppRouter._def.procedures,
  health,
  chat: chatRouter,
  pageCustom: pageRouter,
  workspace: workspaceRouter,
  tab: tabRouter,
};

export const appRouter = t.router({
  ...appRouterDefine,
});

export type AppRouter = typeof appRouter;

// Export generated schemas
// @ts-ignore
export * from "../generated/schemas";
export * from "../generated/routers/helpers/createRouter";

// Export generated zod schemas
// export * as zodSchemas from "../generated/zod/schemas/index";

// Export custom types
export * from "./types/workspace";
export * from "./types/event";
export * from "./types/message";
export * from "./types/toolResult";
export * from "./common";
export * from "./markdown/block-markdown";

// Export workspace router components
export { BaseWorkspaceRouter, workspaceSchemas };

// Export tab router components
export { BaseTabRouter, tabSchemas };

// Export chat router components
export { BaseChatRouter, chatSchemas };

// export const t = initTRPC.context<Context>().create({
// });

// export const router = t.router;

// export const publicProcedure = t.procedure;
