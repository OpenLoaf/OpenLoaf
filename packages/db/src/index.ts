import { PrismaClient } from "../prisma/generated/client";

import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
	url: process.env.DATABASE_URL || "",
});

const prisma = new PrismaClient({ adapter });

export default prisma;
