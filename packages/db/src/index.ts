import { PrismaClient } from "../prisma/generated/client";
import * as PrismaEnums from "../prisma/generated/enums";
import { PrismaLibSql } from "@prisma/adapter-libsql";

console.log("======DATABASE_URL======", process.env.DATABASE_URL);

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "",
});

const prisma = new PrismaClient({ adapter });

export { PrismaEnums };
export default prisma;
