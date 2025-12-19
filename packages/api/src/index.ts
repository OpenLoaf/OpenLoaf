// import superjson from "superjson";
// Export generated routers
import { appRouter as internalAppRouter } from "../generated/routers";
import { t } from "../generated/routers/helpers/createRouter";
import { pageRouter } from "./routers/page";
import {
  workspaceRouter,
  BaseWorkspaceRouter,
  workspaceSchemas,
} from "./routers/workspace";
import { chatRouter } from "./routers/chat";
import { health } from "./routers/health";

export const appRouterDefine = {
  ...internalAppRouter._def.procedures,
  health,
  chat: chatRouter,
  pageCustom: pageRouter,
  workspace: workspaceRouter,
};

export const appRouter = t.router({
  ...appRouterDefine,
});

export type AppRouter = typeof appRouter;

// Export generated schemas
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

// export const t = initTRPC.context<Context>().create({
// });

// export const router = t.router;

// export const publicProcedure = t.procedure;
