// packages/db/src/index.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "../prisma/generated/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import dotenv from "dotenv";

// 加载数据库相关环境变量（优先使用已存在的 process.env，其次尝试读取 monorepo 里的 apps/server/.env）。
function loadDatabaseEnv() {
  // db workspace 运行脚本时 cwd 在 packages/db，dotenv 默认找不到 apps/server/.env，这里做一次兜底加载。
  if (process.env.DATABASE_URL) return;

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, "../../..");

  const envCandidates = [
    path.join(repoRoot, "apps/server/.env"),
    path.join(repoRoot, ".env"),
  ];

  for (const envPath of envCandidates) {
    if (process.env.DATABASE_URL) return;
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
  }
}

loadDatabaseEnv();

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "",
});

export const prisma = new PrismaClient({ adapter });

// 你要保留 default export 也可以
export default prisma;
