import type { Context as HonoContext } from "hono";
import prisma from "@tenas-ai/db";
// @ts-ignore
// import client from "@tenas-ai/db/prisma/generated/client";
// @ts-ignore
// import enums from "@tenas-ai/db/prisma/generated/enums";
// @ts-ignore
// import models from "@tenas-ai/db/prisma/generated/models";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({
  context: _context,
}: CreateContextOptions): Promise<{
  session: null;
  prisma: typeof prisma;
}> {
  // No auth configured
  return {
    session: null,
    prisma,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
