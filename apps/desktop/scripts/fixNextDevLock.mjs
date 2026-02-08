#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const appsDir = join(repoRoot, "apps");

function runPowerShell(script) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  if (process.platform !== "win32") {
    console.log("[tenas] This script is intended for Windows only.");
    return;
  }

  const killNext = [
    "Get-CimInstance Win32_Process",
    "| Where-Object { $_.CommandLine -and $_.CommandLine -match 'next' }",
    "| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join(" ");

  const removeLocks = [
    `Get-ChildItem -Path "${appsDir}" -Recurse -Filter lock -ErrorAction SilentlyContinue`,
    "| Where-Object { $_.FullName -like '*.next\\dev\\lock' }",
    "| Remove-Item -Force -ErrorAction SilentlyContinue",
  ].join(" ");

  runPowerShell(killNext);
  runPowerShell(removeLocks);
  console.log("[tenas] Done: killed next processes and removed .next/dev/lock files.");
}

main();
