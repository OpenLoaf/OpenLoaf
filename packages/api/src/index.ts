import { initTRPC } from "@trpc/server";
import type { Context } from "./context";
export type { PrismaEnums } from "@teatime-ai/db";

export const t = initTRPC.context<Context>().create({
  // Enable SSE support for subscription procedures.
  sse: {
    ping: {
      enabled: true,
      intervalMs: 2_000,
    },
  },
});

export const router = t.router;

export const publicProcedure = t.procedure;
