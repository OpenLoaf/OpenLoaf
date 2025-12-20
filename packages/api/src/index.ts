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
} from "./routers/workspace";
import { tabRouter, BaseTabRouter, tabSchemas } from "./routers/tab";
import { chatRouter } from "./routers/chat";
import { health } from "./routers/health";
import { runtimeRouter, BaseRuntimeRouter, runtimeSchemas } from "./routers/runtime";

export const appRouterDefine = {
  ...internalAppRouter._def.procedures,
  health,
  chat: chatRouter,
  pageCustom: pageRouter,
  workspace: workspaceRouter,
  tab: tabRouter,
  runtime: runtimeRouter,
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
export * from "./types/runtime";
export * from "./common";

// Export workspace router components
export { BaseWorkspaceRouter, workspaceSchemas };

// Export tab router components
export { BaseTabRouter, tabSchemas };

// Export runtime router components
export { BaseRuntimeRouter, runtimeSchemas };

// export const t = initTRPC.context<Context>().create({
// });

// export const router = t.router;

// export const publicProcedure = t.procedure;
