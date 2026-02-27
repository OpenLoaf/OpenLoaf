/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Context as HonoContext } from "hono";
import prisma from "@openloaf/db";
// @ts-ignore
// import client from "@openloaf/db/prisma/generated/client";
// @ts-ignore
// import enums from "@openloaf/db/prisma/generated/enums";
// @ts-ignore
// import models from "@openloaf/db/prisma/generated/models";

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
