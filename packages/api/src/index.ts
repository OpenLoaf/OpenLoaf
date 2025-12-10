// import superjson from "superjson";
// Export generated routers
import { appRouter as internalAppRouter } from "../generated/routers";
import { t } from "../generated/routers/helpers/createRouter";
import { pageRouter } from "./routers/page";

export const appRouter = t.router({
  ...internalAppRouter._def.procedures,
  pageCustom: pageRouter,
});

export type AppRouter = typeof appRouter;

// Export generated schemas
export * from "../generated/schemas";
export * from "../generated/routers/helpers/createRouter";

// Export generated zod schemas
// export * as zodSchemas from "../generated/zod/schemas/index";

// export const t = initTRPC.context<Context>().create({});

// export const router = t.router;

// export const publicProcedure = t.procedure;
