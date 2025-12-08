// packages/db/src/index.ts

import { PrismaClient } from "../prisma/generated/client";
import * as PrismaEnums from "../prisma/generated/enums";
import { PrismaLibSql } from "@prisma/adapter-libsql";

console.log("======DATABASE_URL======", process.env.DATABASE_URL);

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "",
});

export const prisma = new PrismaClient({ adapter });

export { PrismaEnums };

// 关键：只导出类型，不导出 runtime 内部实现
export type { PrismaClient } from "../prisma/generated/client";

// 你要保留 default export 也可以
export default prisma;
