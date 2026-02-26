// packages/db/src/index.ts

import { Prisma, PrismaClient } from "../prisma/generated/client";
export { Prisma };
export type { PrismaClient };
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolveOpenLoafDatabaseUrl } from "@openloaf/config";

const adapter = new PrismaLibSql({
  url: resolveOpenLoafDatabaseUrl(),
});

export const prisma = new PrismaClient({ adapter });

// 你要保留 default export 也可以
export default prisma;
