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

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.mjs",
  external: ["playwright-core"],
  loader: { ".md": "text" },
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..", "..");
const seedDbPath = path.join(serverRoot, "dist", "seed.db");
const pnpmArgs = ["--filter", "@openloaf/db", "db:push"];
const pnpmEnv = {
  ...process.env,
  OPENLOAF_DATABASE_URL: `file:${seedDbPath}`,
};

try {
  fs.mkdirSync(path.dirname(seedDbPath), { recursive: true });
  // 中文注释：打包时自动生成空库并写入 schema，避免依赖本地 local.db。
  if (fs.existsSync(seedDbPath)) {
    fs.rmSync(seedDbPath);
  }
  const push =
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
  if (push.error) {
    logger.error({ err: push.error }, "[build-prod] Failed to spawn pnpm");
    process.exit(1);
  }
  if (push.status !== 0) {
    process.exit(push.status ?? 1);
  }
} catch (err) {
  logger.error(
    { err, seedDbPath },
    `[build-prod] Failed to generate seed DB at ${seedDbPath}`,
  );
  process.exit(1);
}

// Wipe any dev data so production starts with schema-only DB.
// (If you want to ship demo data, remove this.)
// 逻辑：动态读取现有表并清空，避免表不存在导致发布失败。
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
  .filter(Boolean);
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
