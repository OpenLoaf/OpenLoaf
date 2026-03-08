/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "openloaf-server", script: "build-prod" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..", "..");

// 1. 生成迁移索引（在 esbuild 之前，这样 server.mjs 能内联迁移 SQL）
const genMigrations = spawnSync(
  process.platform === "win32" ? "cmd.exe" : "pnpm",
  process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm", "--filter", "@openloaf/db", "db:generate-migrations-index"]
    : ["--filter", "@openloaf/db", "db:generate-migrations-index"],
  { cwd: repoRoot, stdio: "inherit" },
);
if (genMigrations.error || (genMigrations.status !== 0)) {
  logger.error("[build-prod] Failed to generate migrations index");
  process.exit(genMigrations.status ?? 1);
}

// 2. esbuild 打包
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.mjs",
  external: [
    "playwright-core",
    "sharp",
    "@anthropic-ai/claude-agent-sdk",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
  ],
  alias: {
    "@trpc/client": path.resolve(repoRoot, "node_modules", "@trpc", "client"),
    "@trpc/server": path.resolve(repoRoot, "node_modules", "@trpc", "server"),
  },
  loader: { ".md": "text" },
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

// 3. 生成 seed.db（使用 prisma migrate deploy 代替 db:push）
const seedDbPath = path.join(serverRoot, "dist", "seed.db");
const pnpmArgs = ["--filter", "@openloaf/db", "db:migrate-deploy"];
const pnpmEnv = {
  ...process.env,
  OPENLOAF_DATABASE_URL: `file:${seedDbPath}`,
};

try {
  fs.mkdirSync(path.dirname(seedDbPath), { recursive: true });
  if (fs.existsSync(seedDbPath)) {
    fs.rmSync(seedDbPath);
  }
  const migrate =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "pnpm", ...pnpmArgs], {
          cwd: repoRoot,
          stdio: "inherit",
          env: pnpmEnv,
        })
      : spawnSync("pnpm", pnpmArgs, {
          cwd: repoRoot,
          stdio: "inherit",
          env: pnpmEnv,
        });
  if (migrate.error) {
    logger.error({ err: migrate.error }, "[build-prod] Failed to run prisma migrate deploy");
    process.exit(1);
  }
  if (migrate.status !== 0) {
    process.exit(migrate.status ?? 1);
  }
} catch (err) {
  logger.error(
    { err, seedDbPath },
    `[build-prod] Failed to generate seed DB at ${seedDbPath}`,
  );
  process.exit(1);
}

// Wipe business data so production starts with schema-only DB.
// 保留 _prisma_migrations 表记录（新用户需要知道哪些迁移已应用）。
const listTables = spawnSync(
  "sqlite3",
  [seedDbPath, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"],
  { encoding: "utf8" },
);
if (listTables.status !== 0) {
  process.exit(listTables.status ?? 1);
}
const tables = String(listTables.stdout ?? "")
  .split("\n")
  .map((name) => name.trim())
  .filter((name) => name && name !== "_prisma_migrations");
if (tables.length > 0) {
  const wipeSql = [
    "PRAGMA foreign_keys=OFF;",
    "BEGIN;",
    ...tables.map((name) => `DELETE FROM "${name.replaceAll('"', '""')}";`),
    "COMMIT;",
  ].join("\n");
  const wipe = spawnSync("sqlite3", [seedDbPath, wipeSql], { stdio: "inherit" });
  if (wipe.status !== 0) {
    process.exit(wipe.status ?? 1);
  }
}

const vacuum = spawnSync("sqlite3", [seedDbPath, "VACUUM;"], { stdio: "inherit" });
if (vacuum.status !== 0) {
  process.exit(vacuum.status ?? 1);
}
