import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "teatime-server", script: "build-prod" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.mjs",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverRoot = path.resolve(__dirname, "..");
const localDbPath = path.join(serverRoot, "local.db");
const seedDbPath = path.join(serverRoot, "dist", "seed.db");

try {
  fs.mkdirSync(path.dirname(seedDbPath), { recursive: true });
  fs.copyFileSync(localDbPath, seedDbPath);
} catch (err) {
  logger.error(
    { err, localDbPath, seedDbPath },
    `[build-prod] Failed to copy seed DB from ${localDbPath} -> ${seedDbPath}`,
  );
  process.exit(1);
}

// Wipe any dev data so production starts with schema-only DB.
// (If you want to ship demo data, remove this.)
const wipeSql = [
  "PRAGMA foreign_keys=OFF;",
  "BEGIN;",
  "DELETE FROM ChatMessage;",
  "DELETE FROM ChatSession;",
  "DELETE FROM PageChatSession;",
  "DELETE FROM Block;",
  "DELETE FROM Resource;",
  "DELETE FROM Page;",
  "DELETE FROM Tag;",
  "DELETE FROM Setting;",
  "COMMIT;",
].join("\n");

const wipe = spawnSync("sqlite3", [seedDbPath, wipeSql], { stdio: "inherit" });
if (wipe.status !== 0) {
  process.exit(wipe.status ?? 1);
}

const vacuum = spawnSync("sqlite3", [seedDbPath, "VACUUM;"], { stdio: "inherit" });
if (vacuum.status !== 0) {
  process.exit(vacuum.status ?? 1);
}
