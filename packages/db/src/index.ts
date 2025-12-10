// packages/db/src/index.ts

import { PrismaClient } from "../prisma/generated/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

console.log("======DATABASE_URL======", process.env.DATABASE_URL);

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "",
});

export const prisma = new PrismaClient({ adapter });

// 你要保留 default export 也可以
export default prisma;
