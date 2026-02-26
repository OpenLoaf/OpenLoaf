#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Resolve the installed (possibly hoisted) `electron` package directory.
 */
function resolveElectronDir() {
  const pkgJsonPath = require.resolve("electron/package.json", { paths: [process.cwd()] });
  return dirname(pkgJsonPath);
}

/**
 * Check whether Electron's binary download completed (`dist/` + `path.txt`).
 */
function hasElectronBinary(electronDir) {
  // electron 的入口依赖 `path.txt`，缺失时会直接抛错
  const pathFile = join(electronDir, "path.txt");
  if (!existsSync(pathFile)) return false;

  const relativeExecPath = readFileSync(pathFile, "utf-8").trim();
  if (!relativeExecPath) return false;

  const execPath = join(electronDir, "dist", relativeExecPath);
  return existsSync(execPath);
}

/**
 * Run Electron's installer (downloads and unzips the platform binary).
 */
function runElectronInstall(electronDir) {
  const installJs = join(electronDir, "install.js");
  if (!existsSync(installJs)) {
    throw new Error(`Missing electron installer: ${installJs}`);
  }

  // 这里使用 “no proxy” 的方式执行，避免本地代理导致下载失败/超时
  const env = { ...process.env };
  for (const key of [
    "http_proxy",
    "https_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "all_proxy",
    "ALL_PROXY",
    "no_proxy",
    "NO_PROXY",
  ]) {
    delete env[key];
  }

  return spawnSync(process.execPath, [installJs], {
    stdio: "inherit",
    env,
  });
}

function main() {
  const electronDir = resolveElectronDir();

  if (hasElectronBinary(electronDir)) return;

  console.log("[openloaf] Electron binary missing, running electron/install.js…");
  const result = runElectronInstall(electronDir);
  if (result.status !== 0) process.exit(result.status ?? 1);

  // 二次校验：install.js 可能被环境变量跳过下载，导致仍然缺文件
  if (!hasElectronBinary(electronDir)) {
    console.error(
      "[openloaf] Electron install finished but binary is still missing. " +
        "Try: rm -rf node_modules/electron && pnpm -w install",
    );
    process.exit(1);
  }
}

main();
